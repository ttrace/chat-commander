import type { NextApiRequest, NextApiResponse } from "next";
import { NPCS, COMMON_PROMPT } from "../../lib/npcs";
import { generateGeminiText } from "../../lib/gemini";
import fs from "fs";
import path from "path";

function sseWrite(res: NextApiResponse, obj: any) {
  res.write(`data: ${JSON.stringify(obj)}\n\n`);
}

// Ollamaストリーム取得用（既存ロジックをほぼそのまま）
async function streamFromOllama({
  res,
  npcId,
  name,
  model,
  messages,
}: {
  res: NextApiResponse;
  npcId: string;
  name: string;
  model: string;
  messages: any[];
}) {
  let inThink = false;
  console.log(
    `[Ollama] Connecting to Ollama server for npcId=${npcId}, name=${name}, model=${model}`
  );
  console.log(
    "[Ollama] Ollama payload:",
    JSON.stringify({ model, messages, stream: true })
  );
  const ollamaRes = await fetch("http://localhost:11434/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      options: { num_ctx: 8192 },
    }),
  });
  if (!ollamaRes.body) throw new Error("No response body from Ollama");
  const reader = ollamaRes.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split("\n");
    buf = parts.pop() || "";
    for (const part of parts) {
      const line = part.trim();
      if (!line) continue;
      if (line.startsWith("{")) {
        const obj = JSON.parse(line);
        let content = obj.message?.content || "";

        // <think>ステート処理
        if (!inThink && content.includes("<think>")) {
          inThink = true;
          const idx = content.indexOf("<think>");
          const before = content.slice(0, idx);
          if (before.trim()) {
            res.write(
              `data: ${JSON.stringify({
                type: "utterance",
                agentId: npcId,
                name,
                delta: before,
              })}\n\n`
            );
          }
          continue;
        }
        if (inThink && content.includes("</think>")) {
          inThink = false;
          const idx = content.indexOf("</think>") + "</think>".length;
          const after = content.slice(idx);
          if (after.trim()) {
            res.write(
              `data: ${JSON.stringify({
                type: "utterance",
                agentId: npcId,
                name,
                delta: after,
              })}\n\n`
            );
          }
          continue;
        }
        if (inThink) {
          continue;
        }
        if (content.trim()) {
          res.write(
            `data: ${JSON.stringify({
              type: "utterance",
              agentId: npcId,
              name,
              delta: content,
            })}\n\n`
          );
        }
      }
    }
  }
  console.log(`[Ollama] Finished streaming for npcId=${npcId}, name=${name}`);
}

// ユーティリティ: シナリオXMLを読み込む（存在しなければ空文字）
function loadScenarioXML(scenarioFile = "op_damascus_suburb.xml") {
  const scenarioPath = path.join(process.cwd(), "scenarios", scenarioFile);
  try {
    return fs.readFileSync(scenarioPath, "utf-8");
  } catch {
    return "";
  }
}

// 各バックエンド向けメッセージ生成を集約
function buildMessagesForOpenAI({
  npc,
  baseContext,
  xmlString,
}: {
  npc: { id: string; persona: string; name: string };
  baseContext: Array<{ role: string; content: string; who?: string }>;
  xmlString: string;
}) {
  // filteredContext: user or messages from this npc
  const filteredContext = baseContext.filter(
    (m) => m.role === "user" || m.who === `npc:${npc.id}`
  );
  const systemContent = `${COMMON_PROMPT}\n${npc.persona}\n\n${xmlString}\n`;
  const messages = [
    { role: "system", content: systemContent },
    ...filteredContext.map((m) => ({
      role: m.role === "user" ? "user" : "assistant",
      content: m.content,
    })),
  ];
  return messages;
}

function buildMessagesForOllama({
  npc,
  requestMessages,
  xmlString,
}: {
  npc: { id: string; persona: string; name: string };
  requestMessages: any[]; // messages passed in request body (assumed chat format)
  xmlString: string;
}) {
  const systemPrompt = `${xmlString}\n${COMMON_PROMPT}\n${npc.persona}`;
  const ollamaMessages = [
    { role: "system", content: systemPrompt },
    ...(requestMessages || []),
  ];
  return ollamaMessages;
}

// Gemini 用メッセージビルダー（OpenAI と同等の system を付与）
function buildMessagesForGemini({
  npc,
  baseContext,
  xmlString,
}: {
  npc: { id: string; persona: string; name: string };
  baseContext: Array<{ role: string; content: string; who?: string }>;
  xmlString: string;
}) {
  const filteredContext = baseContext.filter(
    (m) => m.role === "user" || m.who === `npc:${npc.id}`
  );
  const systemContent = `${COMMON_PROMPT}\n${npc.persona}\n\n${xmlString}\n`;
  const messages = [
    { role: "system", content: systemContent },
    ...filteredContext.map((m) => ({
      role: m.role === "user" ? "user" : "assistant",
      content: m.content,
    })),
  ];
  return messages;
}

// メインハンドラ
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const OPENAI_API = process.env.OPENAI_API_KEY;
  const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5-mini";
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  const { backend, messages, ollamaModel, npcId, scenario } = req.body as {
    backend: "openai" | "gemini" | "ollama";
    messages?: { role: string; content: string }[];
    ollamaModel?: string;
    npcId?: string;
    scenario?: string;
  };

  console.log("[multi-agent] incoming payload:", {
    backend,
    messages_len: Array.isArray(messages) ? messages.length : "NA",
    roles: Array.isArray(messages) ? messages.map((m) => m.role) : "NA",
    ollamaModel,
    npcId,
    scenario,
  });

  // --- Gemini branch (簡単な流れ: messages を渡して generateGeminiText を呼ぶ) ---
  if (backend === "gemini") {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    const {
      npcIds = [],
      rounds = 1,
      context = [],
    } = req.body as {
      npcIds?: string[];
      rounds?: number;
      context?: Array<{ role: string; content: string; who?: string }>;
    };

    if (!Array.isArray(npcIds) || npcIds.length === 0) {
      sseWrite(res, { type: "error", message: "npcIds required" });
      res.end();
      return;
    }

    const baseContext = Array.isArray(context) ? context.slice() : [];
    const xmlString = loadScenarioXML(scenario || "op_damascus_suburb.xml");

    try {
      for (let r = 0; r < rounds; r++) {
        for (const id of npcIds) {
          const npc = NPCS.find((n) => n.id === id);
          if (!npc) continue;

          const geminiMessages = buildMessagesForGemini({
            npc,
            baseContext,
            xmlString,
          });

          console.log('[geminicontext]', npc, baseContext, xmlString);

          // ストリーム対応のラッパー関数を呼ぶ（内部で generateGeminiText を使う）
          await streamFromGemini({
            res,
            npcId: id,
            name: npc.name,
            messages: geminiMessages,
          });
        }
      }

      sseWrite(res, { type: "done" });
      res.end();
      return;
    } catch (err: any) {
      sseWrite(res, { type: "error", message: err.message || String(err) });
      res.end();
      return;
    }
  }

  // SSE ヘッダ（OpenAI / Ollama 共通で使用）
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  // --- Ollama branch ---
  if (backend === "ollama") {
    const { npcIds = [], messages: reqMessages = [] } = req.body as {
      npcIds?: string[];
      messages?: any[];
    };

    const xmlString = loadScenarioXML(scenario || "op_damascus_suburb.xml");

    for (const id of npcIds) {
      const npc = NPCS.find((n) => n.id === id);
      if (!npc) continue;
      const ollamaMessages = buildMessagesForOllama({
        npc,
        requestMessages: reqMessages,
        xmlString,
      });
      await streamFromOllama({
        res,
        npcId: id,
        name: npc.name,
        model: ollamaModel || "llama3",
        messages: ollamaMessages,
      });
    }

    console.log(`[Ollama] Done all npcs`);
    sseWrite(res, { type: "done" });
    res.end();
    return;
  }

  // --- OpenAI branch ---
  if (!OPENAI_API) {
    sseWrite(res, { type: "error", message: "OPENAI_API_KEY not configured" });
    res.end();
    return;
  }

  const {
    npcIds = [],
    rounds = 1,
    context = [],
    reasoningEfforts = {},
  } = req.body as {
    npcIds?: string[];
    rounds?: number;
    context?: Array<{ role: string; content: string; who?: string }>;
    reasoningEfforts?: { [key: string]: "low" | "medium" | "high" };
  };

  if (!Array.isArray(npcIds) || npcIds.length === 0) {
    sseWrite(res, { type: "error", message: "npcIds required" });
    res.end();
    return;
  }

  const baseContext = Array.isArray(context) ? context.slice() : [];
  const xmlString = loadScenarioXML(scenario || "op_damascus_suburb.xml");

  try {
    for (let r = 0; r < rounds; r++) {
      for (const id of npcIds) {
        const npc = NPCS.find((n) => n.id === id);
        if (!npc) continue;

        const openaiMessages = buildMessagesForOpenAI({
          npc,
          baseContext,
          xmlString,
        });

        const openaiRes = await fetch(
          "https://api.openai.com/v1/chat/completions",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${OPENAI_API}`,
            },
            body: JSON.stringify({
              model: OPENAI_MODEL,
              messages: openaiMessages,
              stream: true,
              verbosity: "low",
              reasoning_effort: reasoningEfforts[id] || "medium",
            }),
          }
        );

        if (!openaiRes.ok || !openaiRes.body) {
          const text = await openaiRes.text();
          sseWrite(res, { type: "error", message: text });
          continue;
        }

        const reader = openaiRes.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() || "";
          for (const part of parts) {
            const line = part.trim();
            if (!line) continue;
            const m = line.match(/^data: (.*)$/s);
            if (!m) continue;
            const dataStr = m[1].trim();
            if (dataStr === "[DONE]") continue;
            try {
              const json = JSON.parse(dataStr);
              const delta = json.choices?.[0]?.delta?.content;
              if (delta) {
                sseWrite(res, {
                  type: "utterance",
                  agentId: id,
                  name: npc.name,
                  delta,
                });
              }
            } catch {}
          }
        }
      }
    }
    sseWrite(res, { type: "done" });
    res.end();
    return;
  } catch (err: any) {
    sseWrite(res, { type: "error", message: err.message || String(err) });
    res.end();
    return;
  }
}

// generateGeminiText の戻り値がストリーム (AsyncIterable<string>) or string の両方に対応して SSE で送る
async function streamFromGemini({
  res,
  npcId,
  name,
  messages,
}: {
  res: NextApiResponse;
  npcId: string;
  name: string;
  messages: any[];
}) {
  // generateGeminiText は実装により同期/非同期/ストリーミングの形があるため両方対応するラッパー
  const result = await generateGeminiText(messages);
  // case: async iterable (streaming)
  if (result && typeof (result as any)[Symbol.asyncIterator] === "function") {
    for await (const chunk of result as AsyncIterable<string>) {
      if (chunk && chunk.trim()) {
        sseWrite(res, {
          type: "utterance",
          agentId: npcId,
          name,
          delta: chunk,
        });
      }
    }
    return;
  }
  // case: sync iterable
  if (result && typeof (result as any)[Symbol.iterator] === "function") {
    for (const chunk of result as Iterable<string>) {
      if (chunk && chunk.trim()) {
        sseWrite(res, {
          type: "utterance",
          agentId: npcId,
          name,
          delta: chunk,
        });
      }
    }
    return;
  }
  // case: plain string
  if (typeof result === "string") {
    if (result.trim()) {
      sseWrite(res, {
        type: "utterance",
        agentId: npcId,
        name,
        delta: result,
      });
    }
    return;
  }

  // 不明な戻り値の場合はエラー通知
  sseWrite(res, { type: "error", message: "Unsupported Gemini response type" });
}
