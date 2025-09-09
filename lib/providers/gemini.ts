import { GoogleGenAI, Type } from "@google/genai";
import type { Scenario } from "../../types";
import type { ChatCompletionMessageParam } from "openai/resources/chat";

const schema = {
  type: Type.OBJECT,
  properties: {
    utterance: {
      type: Type.STRING,
      description: "今回の発言（日本語の自然文）。会議に出す台詞そのもの。",
    },
    next_speaker: {
      type: Type.STRING,
      description: "次の発言者のID。例: commander, drone_op_1 など",
    },
  },
  required: ["utterance", "next_speaker"],
};

// 環境変数で API キー取得
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set");
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

// メッセージ変換
function buildMessages({
  npc,
  baseContext,
  disclaimer,
  behavior,
  knowledge,
}: {
  npc: { id: string; persona: string; name: string };
  baseContext: Array<{ role: string; content: string; who?: string }>;
  disclaimer?: string;
  behavior?: [];
  knowledge: JSON;
}) {
  return [
    { role: "system", content: disclaimer },
    { role: "system", content: npc.persona },
    { role: "system", content: behavior?.join("\n") || "" },
    { role: "system", content: JSON.stringify(knowledge) },
    ...baseContext.map((m) => ({
      role: m.role === "user" ? "system" : "assistant",
      who: m.who,
      content: `${m.who}の発言：${m.content}`,
    })),
  ];
}

// 非ストリーミング（構造化/structured用）
async function callSync({
  messages,
  scenario,
}: {
  messages: { role: string; content: string }[];
  scenario?: Scenario;
}) {
  const systemPart = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  const conversationPart = messages
    .filter((m) => m.role !== "system")
    .map((m) => {
      const roleLabel = m.role === "user" ? "ユーザー" : "アシスタント";
      return `${roleLabel}: ${m.content}`;
    })
    .join("\n\n");
  const prompt = [systemPart, conversationPart].filter(Boolean).join("\n\n");
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
  });
  const text = response.text ?? "";
  if (!text) throw new Error("No text returned from Gemini");
  return text;
}

// ストリーミング

async function* callStream({
  messages,
  scenario,
}: {
  messages: { role: string; content: string }[];
  scenario?: Scenario;
}) {
  const speakerIds = (scenario?.members ?? []).map((m) => m.id);
  const pattern = speakerIds
    .map((id) => id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const scenarioSchema = JSON.parse(JSON.stringify(schema));
  scenarioSchema.properties.next_speaker = {
    type: "string",
    pattern: "^(" + pattern + ")$",
    description: "次に話す登場人物のID",
  };


  // Gemini形式への変換
  const contents = messages
    .filter(
      (m) => m.role === "system" || m.role === "user" || m.role === "assistant"
    )
    .map((m) => {
      // Geminiは "user" or "model" で区別
      let role;
      if (m.role === "system") {
        // Gemini公式ではsystemプロンプト非対応なので先頭user扱いか、または埋め込む
        role = "user";
      } else if (m.role === "user") {
        role = "user";
      } else if (m.role === "assistant") {
        role = "model";
      }
      return {
        role,
        parts: [{ text: m.content }],
      };
    });
  const responseStream = await ai.models.generateContentStream({
    model: "gemini-2.5-flash",
    contents: contents,
    config: { responseMimeType: "application/json", responseSchema: schema },
  });
  for await (const chunk of responseStream) {
    // console.log("[gemini stream chunk]", chunk.text);
    const text = (chunk as any).text ?? "";
    if (text) yield { text };
  }
}

export default {
  id: "gemini",
  buildMessages,
  callSync,
  callStream,
};
