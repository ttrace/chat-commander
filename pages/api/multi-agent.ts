import type { NextApiRequest, NextApiResponse } from "next";
import { NPCS, COMMON_PROMPT } from "../../lib/npcs";
import fs from "fs";
import path from "path";
import Ajv from "ajv";

// ---- AJV JSON Schema setup ----
const ajv = new Ajv();
const nextTurnSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  title: "NextTurnDirective",
  type: "object",
  additionalProperties: false,
  properties: {
    utterance: {
      type: "string",
      description: "今回の発言（日本語の自然文）。会議に出す台詞そのもの。",
    },
    next_speaker: {
      type: "string",
      description: "次の発言者のID。例: commander, drone_op_1 など",
      pattern: "^[a-z0-9_\\-]+$",
    },
  },
  required: ["utterance", "next_speaker"],
};
const validateNextTurn = ajv.compile(nextTurnSchema);

// --- Utility: extractJson ---
function extractJson(text: string): string | null {
  const m = text.match(/\{[\s\S]*\}/);
  return m ? m[0] : null;
}

// ---- Utility ----
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

// サーバー送信メッセージの作成（OpenAI用）
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

// サーバー送信メッセージの作成（Ollama用）
function buildMessagesForOllama({
  npc,
  requestMessages,
  xmlString,
}: {
  npc: { id: string; persona: string; name: string };
  requestMessages: any[];
  xmlString: string;
}) {
  const systemPrompt = `${COMMON_PROMPT}\n${npc.persona}\n\n${xmlString}\n`;
  const ollamaMessages = [
    { role: "system", content: systemPrompt },
    ...(requestMessages || []),
  ];
  return ollamaMessages;
}

// サーバー送信メッセージの作成（Gemini用）
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

// Ollamaからのストリーミング応答処理
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

// Geminiからのストリーミング応答処理
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
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  try {
    const { generateGeminiStream } = await import("../../lib/gemini");
    for await (const delta of generateGeminiStream(messages)) {
      const payload = { npcId, name, delta };
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    }
    res.write(`event: done\ndata: {}\n\n`);
    res.end();
  } catch (err: any) {
    console.error("Error streaming Gemini:", err);
    res.write(
      `event: error\ndata: ${JSON.stringify({
        message: err.message || String(err),
      })}\n\n`
    );
    res.end();
  }
}

// OpenAIからのストリーミング応答処理
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
      } catch (e) {}
    }
  }
}

// ---- Main Handler ----
// Backendごとの関数マッピング
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

// APIハンドラー
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const {
    backend,  // "openai" | "gemini" | "ollama"
    npcIds = [],
    rounds = 1,
    context = [],
    messages: requestMessages = [],
    scenario,
    reasoningEfforts = {},
    structured, // 追加: structuredフラグ
    model,  // 追加: modelパラメータ
  } = req.body as any;

  if (!backend || !(backend in BACKENDS)) {
    res
      .status(400)
      .json({ error: "backend must be one of: openai, gemini, ollama" });
    return;
  }

  if (!Array.isArray(npcIds) || npcIds.length === 0) {
    res.status(400).json({ error: "npcIds required" });
    return;
  }

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

        let messagesForBackend: any[];
        if (backendKey === "ollama") {
          messagesForBackend = buildMessagesForOllama({
            npc,
            requestMessages,
            xmlString,
          });
        } else if (backendKey === "openai") {
          messagesForBackend = buildMessagesForOpenAI({
            npc,
            baseContext,
            xmlString,
          });
        } else  { // geminiのケース
          messagesForBackend = buildMessagesForGemini({
            npc,
            baseContext,
            xmlString,
          });
        }

        // --- Structured/JSON mode branch ---
        if (structured) {
          console.log('[Structured mode] npcId=', id, 'backend=', backend);
          const jsonInstruction = `応答は必ず有効なJSONオブジェクトのみを返してください。スキーマ:
{"utterance":"（発話本文）","next_speaker":"（次の発話者ID、例: commander, drone_op_1）"}
余計な説明を含めないでください。`;

          const messagesWithJson = [
            ...messagesForBackend,
            { role: "system", content: jsonInstruction },
          ];

          try {
            let text = "";

            if (backendKey === "gemini") {
              const { generateGeminiText } = await import("../../lib/gemini");
              text = await generateGeminiText(messagesWithJson as any);
            } else if (backendKey === "openai") {
              // openai-node v4
              const { OpenAI } = await import("openai");
              const client = new OpenAI({ apiKey: OPENAI_API });
              const completion = await client.chat.completions.create({
                model: OPENAI_MODEL,
                messages: messagesWithJson,
                max_tokens: 1024,
                temperature: 0.2,
              });
              text = completion.choices?.[0]?.message?.content ?? "";
            } else if (backendKey === "ollama") {
              const ollamaRes = await fetch("http://localhost:11434/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  model: model || "llama3",
                  messages: messagesWithJson,
                  stream: false,
                  options: { num_ctx: 8192 },
                }),
              });
              const j = await ollamaRes.json();
              text = j?.response ?? j?.message ?? JSON.stringify(j);
            }

            console.log(`[LLM full response] npcId=${id} model=${model} content=`, text);
            const jsonStr = extractJson(text);
            if (!jsonStr) {
              sseWrite(res, {
                type: "error",
                agentId: id,
                name: npc.name,
                message: "No JSON found in LLM response",
              });
            } else {
              let parsed: any;
              try {
                parsed = JSON.parse(jsonStr);
              } catch (e) {
                sseWrite(res, {
                  type: "error",
                  agentId: id,
                  name: npc.name,
                  message: "Invalid JSON from LLM",
                });
                continue;
              }

              const valid = validateNextTurn(parsed);
              console.log(
                `[LLM structured output] npcId=${id} model=${model} content=`,
                parsed
              );

              if (!valid) {
                sseWrite(res, {
                  type: "error",
                  agentId: id,
                  name: npc.name,
                  message: "Schema validation failed",
                  details: validateNextTurn.errors,
                });
              } else {
                sseWrite(res, {
                  type: "structured",
                  agentId: id,
                  name: npc.name,
                  utterance: parsed.utterance,
                  next_speaker: parsed.next_speaker,
                });
              }
            }
          } catch (err: any) {
            sseWrite(res, {
              type: "error",
              agentId: id,
              name: npc.name,
              message: err?.message || String(err),
            });
          }
          continue;
        }
        // --- End structured branch ---

        try {
          
          if (backendKey === "openai") {
            if (!OPENAI_API) {
              sseWrite(res, {
                type: "error",
                message: "OPENAI_API_KEY not configured",
              });
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
              model: model || "gemma3:4b",
              messages: messagesForBackend,
            });
          }
        } catch (innerErr: any) {
          console.error("stream error for npc", id, innerErr);
          sseWrite(res, {
            type: "error",
            message: innerErr?.message || String(innerErr),
          });
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
