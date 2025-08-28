import OpenAI from "openai";
import { COMMON_PROMPT } from "../npcs";

// 環境変数で API キー取得
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set");

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

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
  // COMMON_PROMPT と npc.persona, xmlString を繋ぐ
  const systemContent = `${COMMON_PROMPT}\n${npc.persona}\n\n${xmlString}`;

  return [
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

// 非ストリーミング（全文テキスト取得）
async function callSync({
  model = "gpt-5-mini",
  messages,
  schema,
}: {
  model?: string;
  messages: { role: string; content: string }[];
  schema?: object;
}) {
  const response = await openai.chat.completions.create({
    model: model,
    messages: messages,
    response_format: { type: "json_schema", json_schema: schema as any },
    reasoning_effort: "low",
    // max_tokens: 2048,
  });
  const text = response.choices[0]?.message?.content ?? "";
  if (!text) throw new Error("No text returned from OpenAI");
  return text;
}

// ストリーミング（逐次テキスト取得）
async function* callStream({
  model = "gpt-5-mini",
  messages,
}: {
  model?: string;
  messages: { role: string; content: string }[];
}) {
  console.log("[OpenAI callStream] model:", model);
  const response = await openai.chat.completions.create({
    model: model,
    messages: messages,
    reasoning_effort: "low",
    stream: true,
  });
  for await (const part of response) {
    const text = part.choices[0]?.delta?.content ?? "";
    if (text) yield { text };
  }
}

export default {
  id: "openai",
  buildMessages,
  callSync,
  callStream,
};
