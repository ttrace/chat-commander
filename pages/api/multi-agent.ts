// pages/api/multi-agent.ts

import type { NextApiRequest, NextApiResponse } from "next";
// import { NPCS, COMMON_PROMPT } from "../../lib/npcs";
import fs from "fs";
import path from "path";
import Ajv from "ajv";
import { PROVIDERS, Provider } from "../../lib/providers/index";
import type { Member, Scenario } from "../../types";

const ajv = new Ajv();
// const npcIds = NPCS.map((npc) => npc.id);
function escapeRegex(str: string) {
  return str.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
}

// // 例としてpatternをログで確認
// console.log("NPC ID pattern for JSON Schema:", npcPattern);

function extractJson(text: string): string | null {
  const m = text.match(/\{[\s\S]*\}/);
  return m ? m[0] : null;
}

function sseWrite(res: NextApiResponse, obj: any) {
  res.write(`data: ${JSON.stringify(obj)}\n\n`);
}

// function loadScenarioXML(scenarioFile = "op_damascus_suburb.xml") {
//   const scenarioPath = path.join(process.cwd(), "scenarios", scenarioFile);
//   try {
//     return fs.readFileSync(scenarioPath, "utf-8");
//   } catch {
//     return "";
//   }
// }

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
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
    scenario,
    reasoningEfforts = {},
    structured,
    model,
  } = req.body as any;

  if (!backend || !(backend in PROVIDERS)) {
    res
      .status(400)
      .json({ error: "backend must be one of: openai, gemini, ollama" });
    return;
  }

  if (!Array.isArray(npcIds) || npcIds.length === 0) {
    res.status(400).json({ error: "npcIds required" });
    return;
  }

  const npcPattern = (scenario?.members ?? []).map((m: Member) => m.id);
  const pattern = npcPattern
    .map((id: String) => id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");

  console.log("scenario", scenario.title, "npcPattern", npcPattern);
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
        pattern: "^(" + pattern + ")$",
      },
    },
    required: ["utterance", "next_speaker"],
  };
  const validateNextTurn = ajv.compile(nextTurnSchema);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  // const xmlString = loadScenarioXML(scenario || "op_damascus_suburb.xml");
  const baseContext = Array.isArray(context) ? context.slice() : [];

  const backendKey = backend as keyof typeof PROVIDERS;
  const provider: Provider = PROVIDERS[backendKey];
  try {
    for (let r = 0; r < rounds; r++) {
      for (const id of npcIds) {
        const npc = scenario.members.find((n: Member) => n.id === id);
        // console.log("[multi-agent] Processing npcId=", npc, id);
        if (!npc) continue;

        let messagesForBackend;
        const disclaimer = scenario?.disclaimer;
        const behavior = scenario?.behavior;
        const excludeKeys = ["disclaimer", "behavior"];
        const sanitizedMembers = (scenario.members ?? []).map(
          ({ persona, ...rest }: Member) => rest
        );
        
        // scenarioのその他のキーを抽出（membersは除外）
        const otherEntries = Object.entries(scenario).filter(
          ([key]) => !excludeKeys.includes(key) && key !== "members"
        );

        // knowledgeオブジェクトを生成
        const knowledge = Object.fromEntries(otherEntries);

        // membersにpersona削除版をセット
        knowledge.members = sanitizedMembers;

        console.log("[buildMessages] Disclaimer", disclaimer);
        messagesForBackend = provider.buildMessages({
          npc,
          baseContext,
          disclaimer,
          behavior,
          knowledge,
        });

        // if (structured) {
        const jsonInstruction = `出力は必ずJSONLで、完全なJSON形式で返してください。
        スキーマ:\n${JSON.stringify(nextTurnSchema, null, 2)}
        余計な説明やコードブロックは含めないでください。`;

        const messagesWithJson = [
          { role: "system", content: jsonInstruction },
          ...messagesForBackend,
        ];

        // 例: npcループ内でメッセージ生成直後
        // console.log(
        //   `[multi-agent sending] npcId=${id} backend=${backendKey} messagesWithJson:`,
        //   messagesWithJson
        // );

        // try {
        //   if (!provider.callSync) {
        //     throw new Error(
        //       `Provider ${backendKey} does not support sync call for structured mode`
        //     );
        //   }
        //   const text = await provider.callSync({
        //     model,
        //     messages: messagesWithJson,
        //   });

        //   console.log(
        //     `[multi-agent response] npcId=${id} backend=${backendKey} text:`,
        //     text
        //   );

        //   const jsonStr = extractJson(text);
        //   if (!jsonStr) {
        //     sseWrite(res, {
        //       type: "error",
        //       agentId: id,
        //       name: npc.name,
        //       message: "No JSON found in LLM response",
        //     });
        //     continue;
        //   }

        //   let parsed;
        //   try {
        //     parsed = JSON.parse(jsonStr);
        //   } catch (e) {
        //     sseWrite(res, {
        //       type: "error",
        //       agentId: id,
        //       name: npc.name,
        //       message: "Invalid JSON from LLM",
        //     });
        //     continue;
        //   }

        //   if (!validateNextTurn(parsed)) {
        //     sseWrite(res, {
        //       type: "error",
        //       agentId: id,
        //       name: npc.name,
        //       message: "Schema validation failed",
        //       details: validateNextTurn.errors,
        //     });
        //   } else {
        //     sseWrite(res, {
        //       type: "structured",
        //       agentId: id,
        //       name: npc.name,
        //       utterance: parsed.utterance,
        //       next_speaker: parsed.next_speaker,
        //     });
        //   }
        // } catch (err: any) {
        //   sseWrite(res, {
        //     type: "error",
        //     agentId: id,
        //     name: npc.name,
        //     message: err.message || String(err),
        //   });
        // }

        //   continue;
        // }

        if (!provider.callStream) {
          sseWrite(res, {
            type: "error",
            message: `Provider ${backendKey} does not support streaming`,
          });
          continue;
        }

        try {
          let buffer = "";
          let utteranceBuffer = "";
          let previousSentBuffer = ""; // 前回送信したutteranceを保存

          // 受信チャンク処理のループ
          // console.log(
          //   `[multi-agent] Starting stream for npcId=${id} backend=${backendKey}`
          // );
          console.log(messagesWithJson);
          for await (const chunk of provider.callStream({
            model,
            messages: messagesWithJson,
            scenario,
          })) {
            // console.log(`[multi-agent stream] npcId=${id} chunk:`, chunk);
            let text: string;
            if (typeof chunk === "string") {
              text = chunk;
            } else if (chunk && typeof chunk === "object" && "text" in chunk) {
              text = chunk.text;
            } else {
              text = ""; // または適切なデフォルト値
            }

            // Markdownコードブロック除去
            text = text.replace(/```json(l)*\s*/, "").replace(/```/g, "");

            buffer += text;
            // console.log(`[multi-agent stream] npcId=${id} text:`, buffer);
            // utterance フィールドの文字列を抽出する正規表現 （部分的な文字列をリアルタイムに蓄積）
            const utteranceMatch = buffer.match(/"utterance"\s*:\s*"([^"]*)/);
            const nextSpeakerMatch = buffer.match(
              /"utterance"\s*:\s*"([^"]*)"/
            );

            // if (next
            text = text.replace(/{\n*\s*"utterance"\s*:\s*"/g, "");
            text = text.replace(/[":{}]/g, "");
            // console.log("[multi-agent] buffer:", buffer);

            let tailingText = "";
            if (nextSpeakerMatch && backendKey === "gemini") {
              tailingText = text.replace(/,[\s\S]*next_speaker[\s\S]*.*/g, "");
              // console.log("Geminiの時の末尾削り", text, tailingText);
            }

            if (utteranceMatch && !nextSpeakerMatch) {
              // 新しく取り込んだutteranceの文字列をバッファに追加
              const currentUtterance = utteranceMatch[1];

              previousSentBuffer = currentUtterance;
              // クライアントへ逐次送信（例）
              sseWrite(res, {
                type: "utterance",
                agentId: id,
                name: npc.name,
                // delta: currentUtterance,
                delta: text,
              });
            }

            if (tailingText !== "") {
              sseWrite(res, {
                type: "utterance",
                agentId: id,
                name: npc.name,
                // delta: currentUtterance,
                delta: tailingText,
              });
            }

            // 完全JSONの検出（末尾にnext_speakerがあるJSON）
            const jsonMatch = buffer.match(
              /\{[\s\S]*"next_speaker"\s*:\s*"([^"]*)"\s*\}/
            );
            if (jsonMatch) {
              try {
                const fullJsonStr = jsonMatch[0];
                const parsed = JSON.parse(fullJsonStr);
                console.log("[multi-agent] next_speaker", parsed.next_speaker);

                sseWrite(res, {
                  type: "structured",
                  agentId: id,
                  name: npc.name,
                  utterance: "",
                  next_speaker: parsed.next_speaker,
                });
              } catch (e) {
                console.error("JSON parse error:", e);
              }
              // バッファクリア（次のレスポンス用に）
              buffer = "";
              utteranceBuffer = "";
            }
          }
        } catch (err: any) {
          console.error(`stream error for npc=${id}`, err);
          sseWrite(res, { type: "error", message: err.message || String(err) });
        }
      }
    }
    sseWrite(res, { type: "done" });
    res.end();
  } catch (err: any) {
    sseWrite(res, {
      type: "error",
      message: err.message || String(err),
    });
    res.end();
  }
}
