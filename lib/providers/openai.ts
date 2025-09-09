import OpenAI from "openai";
import type { Scenario } from "../../types";
import type { ChatCompletionMessageParam } from "openai/resources/chat";

const schema = {
  name: "NextTurnDirective",
  strict: true,
  schema: {
    type: "object",
    properties: {
      utterance: {
        type: "string",
        description: "今回の発言（日本語の自然文）。会議に出す台詞そのもの。",
      },
      next_speaker: {
        type: "string",
        description: "次の発言者のID。例: commander, drone_op_1 など",
      },
    },
    required: ["utterance", "next_speaker"],
    additionalProperties: false,
  },
};

// 環境変数で API キー取得
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set");

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// メッセージ変換
function buildMessages({
  npc,
  baseContext,
  disclaimer,
  behavior,
  knowledge
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
      role: m.role === "user" ? "user" : "assistant",
      who: m.who,
      content: `${m.who}の発言：${m.content}`,
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
    messages: messages as ChatCompletionMessageParam[],
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
  scenario,
}: {
  model?: string;
  messages: { role: string; content: string }[];
  scenario?: Scenario;
}) {
  // console.log("[OpenAI callStream] model:", model);
  const speakerIds = (scenario?.members ?? []).map((m) => m.id);
  // 正規表現pattern
  const pattern = speakerIds
    .map((id) => id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");

  const scenarioSchema = JSON.parse(JSON.stringify(schema));
  scenarioSchema.schema.properties.next_speaker = {
    type: "string",
    pattern: "^(" + pattern + ")$",
    description: "次に話す登場人物のID",
  };

  const response = await openai.chat.completions.create({
    model: model,
    messages: messages as ChatCompletionMessageParam[],
    response_format: { type: "json_schema", json_schema: schema as any },
    reasoning_effort: "low",
    stream: true,
  });
  for await (const part of response) {
    const text = part.choices[0]?.delta?.content ?? "";
    // console.log("[openai stream text]", text);
    if (text) yield { text };
  }
}

export default {
  id: "openai",
  buildMessages,
  callSync,
  callStream,
};
