import type { NextApiRequest, NextApiResponse } from "next";
import { NPCS } from "../../lib/npcs";

const OPENAI_API = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5-mini";

function sseWrite(res: NextApiResponse, obj: any) {
  res.write(`data: ${JSON.stringify(obj)}\n\n`);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!OPENAI_API) {
    res.status(500).json({ error: "OPENAI_API_KEY not configured" });
    return;
  }

  const {
    npcIds = [],
    rounds = 1,
    context = [],
  } = req.body as {
    npcIds?: string[];
    rounds?: number;
    context?: Array<{ role: string; content: string; who?: string }>;
  };

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  if (!Array.isArray(npcIds) || npcIds.length === 0) {
    sseWrite(res, { type: "error", message: "npcIds required" });
    res.end();
    return;
  }

  const baseContext = Array.isArray(context) ? context.slice() : [];

  try {
    for (let r = 0; r < rounds; r++) {
      for (const id of npcIds) {
        const npc = NPCS.find((n) => n.id === id);
        if (!npc) continue;

        const filteredContext = baseContext.filter(
          (m) => m.role === "user" || m.who === `npc:${id}`
        );
        const messages = [
          { role: "system", content: npc.persona },
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
