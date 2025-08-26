import type { NextApiRequest, NextApiResponse } from "next";
import { NPCS, COMMON_PROMPT } from "../../lib/npcs";
import { generateGeminiText } from "../../lib/gemini";
import fs from "fs";
import path from "path";

// ---- 既存ユーティリティ（そのまま） ----
function sseWrite(res: NextApiResponse, obj: any) {
  res.write(`data: ${JSON.stringify(obj)}\n\n`);
}

function loadScenarioXML(scenarioFile = "op_damascus_suburb.xml") {
  const scenarioPath = path.join(process.cwd(), "scenarios", scenarioFile);
  try {
    return fs.readFileSync(scenarioPath, "utf-8");
  } catch {
    return "";
  }
}

// ---- 既存のメッセージビルダ（変更なし） ----
function buildMessagesForOpenAI({
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

function buildMessagesForOllama({
  npc,
  requestMessages,
  xmlString,
}: {
  npc: { id: string; persona: string; name: string };
  requestMessages: any[]; // for ollama we pass request messages directly
  xmlString: string;
}) {
  const systemPrompt = `${xmlString}\n${COMMON_PROMPT}\n${npc.persona}`;
  const ollamaMessages = [
    { role: "system", content: systemPrompt },
    ...(requestMessages || []),
  ];
  return ollamaMessages;
}

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

// ---- streamFromOllama: 既存ロジックを関数化して流用 ----
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
  console.log("[Ollama] Ollama payload:", JSON.stringify({ model, messages, stream: true }));
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

        // <think> ステート処理（既存）
        if (!inThink && content.includes("<think>")) {
          inThink = true;
          const idx = content.indexOf("<think>");
          const before = content.slice(0, idx);
          if (before.trim()) {
            sseWrite(res, {
              type: "utterance",
              agentId: npcId,
              name,
              delta: before,
            });
          }
          continue;
        }
        if (inThink && content.includes("</think>")) {
          inThink = false;
          const idx = content.indexOf("</think>") + "</think>".length;
          const after = content.slice(idx);
          if (after.trim()) {
            sseWrite(res, {
              type: "utterance",
              agentId: npcId,
              name,
              delta: after,
            });
          }
          continue;
        }
        if (inThink) continue;

        if (content.trim()) {
          sseWrite(res, {
            type: "utterance",
            agentId: npcId,
            name,
            delta: content,
          });
        }
      }
    }
  }
  console.log(`[Ollama] Finished streaming for npcId=${npcId}, name=${name}`);
}

// ---- streamFromGemini: 既存ラッパー利用（generateGeminiText を呼ぶ） ----
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
  const result = await generateGeminiText(messages);
  if (result && typeof (result as any)[Symbol.asyncIterator] === "function") {
    for await (const chunk of result as AsyncIterable<string>) {
      if (chunk && chunk.trim()) {
        sseWrite(res, { type: "utterance", agentId: npcId, name, delta: chunk });
      }
    }
    return;
  }
  if (result && typeof (result as any)[Symbol.iterator] === "function") {
    for (const chunk of result as Iterable<string>) {
      if (chunk && chunk.trim()) {
        sseWrite(res, { type: "utterance", agentId: npcId, name, delta: chunk });
      }
    }
    return;
  }
  if (typeof result === "string") {
    if (result.trim()) {
      sseWrite(res, { type: "utterance", agentId: npcId, name, delta: result });
    }
    return;
  }
  sseWrite(res, { type: "error", message: "Unsupported Gemini response type" });
}

// ---- streamFromOpenAI: OpenAI ストリーミングロジックを切り出し ----
async function streamFromOpenAI({
  res,
  npcId,
  name,
  messages,
  openaiKey,
  openaiModel,
  reasoningEffort,
}: {
  res: NextApiResponse;
  npcId: string;
  name: string;
  messages: any[];
  openaiKey: string;
  openaiModel: string;
  reasoningEffort?: "low" | "medium" | "high";
}) {
  const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      model: openaiModel,
      messages,
      stream: true,
      verbosity: "low",
      reasoning_effort: reasoningEffort || "medium",
    }),
  });

  if (!openaiRes.ok || !openaiRes.body) {
    const text = await openaiRes.text();
    sseWrite(res, { type: "error", message: text });
    return;
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
          sseWrite(res, { type: "utterance", agentId: npcId, name, delta });
        }
      } catch (e) {
        // ignore parse errors
      }
    }
  }
}

// ---- backend strategy map ----
const BACKENDS = {
  openai: {
    buildMessages: buildMessagesForOpenAI,
    streamFn: streamFromOpenAI,
  },
  gemini: {
    buildMessages: buildMessagesForGemini,
    streamFn: streamFromGemini,
  },
  ollama: {
    buildMessages: buildMessagesForOllama,
    streamFn: streamFromOllama,
  },
} as const;

// ---- メインハンドラ（共通ループ化） ----
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const {
    backend,
    npcIds = [],
    rounds = 1,
    context = [],
    messages: requestMessages = [],
    ollamaModel,
    scenario,
    reasoningEfforts = {},
  } = req.body as any;

  if (!backend || !(backend in BACKENDS)) {
    res.status(400).json({ error: "backend must be one of: openai, gemini, ollama" });
    return;
  }

  if (!Array.isArray(npcIds) || npcIds.length === 0) {
    res.status(400).json({ error: "npcIds required" });
    return;
  }

  // SSE ヘッダ（共通）
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const xmlString = loadScenarioXML(scenario || "op_damascus_suburb.xml");
  const baseContext = Array.isArray(context) ? context.slice() : [];

  const backendKey = backend as keyof typeof BACKENDS;
  const { buildMessages, streamFn } = BACKENDS[backendKey];

  const OPENAI_API = process.env.OPENAI_API_KEY;
  const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5-mini";

  try {
    for (let r = 0; r < rounds; r++) {
      for (const id of npcIds) {
        const npc = NPCS.find((n) => n.id === id);
        if (!npc) continue;

        // 各 backend に応じた message 生成
        let messagesForBackend: any[];
        if (backendKey === "ollama") {
          // ollama はリクエストメッセージ（raw）を渡す想定
          messagesForBackend = buildMessages({
            npc,
            requestMessages,
            xmlString,
          });
        } else {
          messagesForBackend = buildMessages({
            npc,
            baseContext,
            xmlString,
          });
        }

        try {
          // backend ごとの stream 関数を呼ぶ（必要な追加パラメータを渡す）
          if (backendKey === "openai") {
            if (!OPENAI_API) {
              sseWrite(res, { type: "error", message: "OPENAI_API_KEY not configured" });
              continue;
            }
            await (streamFn as typeof streamFromOpenAI)({
              res,
              npcId: id,
              name: npc.name,
              messages: messagesForBackend,
              openaiKey: OPENAI_API,
              openaiModel: OPENAI_MODEL,
              reasoningEffort: reasoningEfforts[id],
            });
          } else if (backendKey === "gemini") {
            await (streamFn as typeof streamFromGemini)({
              res,
              npcId: id,
              name: npc.name,
              messages: messagesForBackend,
            });
          } else if (backendKey === "ollama") {
            await (streamFn as typeof streamFromOllama)({
              res,
              npcId: id,
              name: npc.name,
              model: ollamaModel || "llama3",
              messages: messagesForBackend,
            });
          }
        } catch (innerErr: any) {
          console.error("stream error for npc", id, innerErr);
          sseWrite(res, { type: "error", message: innerErr?.message || String(innerErr) });
        }
      }
    }

    sseWrite(res, { type: "done" });
    res.end();
  } catch (err: any) {
    sseWrite(res, { type: "error", message: err?.message || String(err) });
    res.end();
  }
}