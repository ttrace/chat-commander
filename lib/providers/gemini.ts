import { GoogleGenAI, Type } from "@google/genai";
import { COMMON_PROMPT } from "../npcs";
import { rootTaskDispose } from "next/dist/build/swc/generated-native";

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
      pattern: "^(commander|safety|drone|local_operator|foreign|evac)$",
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
  xmlString,
}: {
  npc: { id: string; persona: string; name: string };
  baseContext: Array<{ role: string; content: string; who?: string }>;
  xmlString: string;
}) {
  const systemContent = `${COMMON_PROMPT}\n${npc.persona}\n\n${xmlString}`;

  return [
    // { role: "system", content: systemContent },
    { role: "system", content: COMMON_PROMPT },
    { role: "system", content: npc.persona },
    { role: "system", content: xmlString },
    ...baseContext.map((m) => ({
      role: m.role === "user" ? "user" : "assistant",
      who: m.who,
      content: m.content,
    })),
  ];
}

// 非ストリーミング（構造化/structured用）
async function callSync({
  messages,
}: {
  messages: { role: string; content: string }[];
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
}: {
  messages: { role: string; content: string }[];
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
  // console.log(`[gemini] callStream prompt=`, prompt);
  const responseStream = await ai.models.generateContentStream({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: { responseMimeType: "application/json", responseSchema: schema },
  });
  for await (const chunk of responseStream) {
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
