import type { NextApiRequest, NextApiResponse } from "next";
import { NPCS, COMMON_PROMPT } from "../../lib/npcs";
import fs from "fs";
import path from "path";

function sseWrite(res: NextApiResponse, obj: any) {
  res.write(`data: ${JSON.stringify(obj)}\n\n`);
}

// Ollamaストリーム取得用の関数
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
  let inThink = false; // <think>~</think>タグ内フラグ
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
          continue; // <think>以降は送らない
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
          continue; // </think>までをスキップ
        }
        if (inThink) {
          continue; // <think>タグ内は送信しない
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
  const { backend = "openai", model: ollamaModel } = req.body;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  // Ollamaルート
  if (backend === "ollama") {
    const { npcIds = [], messages = [] } = req.body;

    const scenarioPath = path.join(
      process.cwd(),
      "scenarios",
      "op_damascus_suburb.xml"
    );
    let xmlString = "";
    try {
      xmlString = fs.readFileSync(scenarioPath, "utf-8");
    } catch {}
    for (const id of npcIds) {
      const npc = NPCS.find((n) => n.id === id);
      if (!npc) continue;
      const systemPrompt = `${xmlString}\n${COMMON_PROMPT}\n${npc.persona}`;
      const ollamaMessages = [
        { role: "system", content: systemPrompt },
        ...messages,
      ];
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

  // OpenAIルート
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
  const scenarioPath = path.join(
    process.cwd(),
    "scenarios",
    "op_damascus_suburb.xml"
  );
  let xmlString = "";
  try {
    xmlString = fs.readFileSync(scenarioPath, "utf-8");
  } catch {}

  try {
    for (let r = 0; r < rounds; r++) {
      for (const id of npcIds) {
        const npc = NPCS.find((n) => n.id === id);
        if (!npc) continue;

        const filteredContext = baseContext.filter(
          (m) => m.role === "user" || m.who === `npc:${id}`
        );
        const messages = [
          {
            role: "system",
            content: `${xmlString}\n${COMMON_PROMPT}\n${npc.persona}`,
          },
          ...filteredContext.map((m) => ({
            role: m.role === "user" ? "user" : "assistant",
            content: m.content,
          })),
        ];

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
              messages,
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

