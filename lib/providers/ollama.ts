import { Provider } from "./index";
import type { Scenario } from "../../types";
import type { ChatCompletionMessageParam } from "openai/resources/chat";

const schema = {
  type: "object",
  properties: {
    utterance: {
      type: "string",
      description: "今回の発言（日本語の自然文）。会議に出す台詞そのもの。",
    },
    next_speaker: {
      type: "string",
      description: "次の発言者のID。例: commander, drone_op_1 など",
      pattern: "^(commander|safety|drone|local_operator|foreign|evac)$",
    },
  },
  required: ["utterance", "next_speaker"],
  additionalProperties: false,
};

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
      role: m.role === "user" ? "user" : "assistant",
      who: m.who,
      content: `${m.who}の発言：${m.content}`,
    })),
  ];
}

async function callSync({
  model = "gemmma3:4b",
  messages,
}: {
  model?: string;
  messages: { role: string; content: string }[];
}): Promise<string> {
  const prompt = messages.map((m) => `${m.role}: ${m.content}`).join("\n\n");
  const endpoint = process.env.OLLAMA_API_ENDPOINT;
  if (!endpoint) throw new Error("OLLAMA_API_ENDPOINT is not set");

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt }),
  });
  if (!response.ok)
    throw new Error(
      `Ollama API error: ${response.status} ${response.statusText}`
    );

  return await response.text();
}

async function* callStream({
  model,
  messages,
  scenario,
}: {
  model?: string;
  messages: { role: string; content: string }[];
  scenario?: Scenario;
}) {
  const endpoint =
    process.env.OLLAMA_API_ENDPOINT ?? "http://localhost:11434/api/generate";

  // console.log("[OpenAI callStream] model:", model);
  const speakerIds = (scenario?.members ?? []).map((m) => m.id);
  // 正規表現pattern
  const pattern = speakerIds
    .map((id) => id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");

  const scenarioSchema = JSON.parse(JSON.stringify(schema));
  scenarioSchema.properties.next_speaker = {
    type: "string",
    pattern: "^(" + pattern + ")$",
    description: "次に話す登場人物のID",
  };

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
  // console.log(`[ollama] callStream model=${model} prompt=`, prompt);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: model ?? "gemma3:4b", // 未指定時のみデフォルト
      prompt,
      format: scenarioSchema,
      stream: true,
    }),
  });

  // console.log("[ollama] response:", response);

  if (!response.body) throw new Error("No response body from Ollama");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // console.log("[ollama] chunk:", buffer);
    // 1行ごと（\n区切り）でパース
    let lines = buffer.split("\n");
    buffer = lines.pop() || ""; // 未完結の行は次回へ保持

    for (const line of lines) {
      // console.log("[ollama] line:", line); // デバッグ用 ollamaの生データ確認
      if (!line.trim()) continue;
      try {
        const obj = JSON.parse(line);
        if (obj.response) yield { text: obj.response };
      } catch (e) {
        // 必要に応じてエラー処理
      }
    }
  }
  // 念のため残バッファ処理
  if (buffer.trim()) {
    try {
      const obj = JSON.parse(buffer);
      if (obj.text) yield { text: obj.text };
    } catch {}
  }
}

const ollama: Provider = {
  id: "ollama",
  buildMessages,
  callSync,
  callStream,
};

export default ollama;
