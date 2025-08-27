import { GoogleGenAI } from '@google/genai';

// 環境変数で API キー取得
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not set');
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

// メッセージ変換
function buildMessages({ npc, baseContext, xmlString }: {
  npc: { id: string; persona: string; name: string },
  baseContext: Array<{ role: string; content: string; who?: string }>,
  xmlString: string
}) {
  const filteredContext = baseContext.filter(
    (m) => m.role === "user" || m.who === `npc:${npc.id}`
  );
  const systemContent = `${xmlString}\n${npc.persona}`;
  return [
    { role: "system", content: systemContent },
    ...filteredContext.map((m) => ({
      role: m.role === "user" ? "user" : "assistant",
      content: m.content,
    })),
  ];
}

// 非ストリーミング（構造化/structured用）
async function callSync({ messages }: { messages: { role: string; content: string }[] }) {
  const systemPart = messages.filter(m => m.role === "system").map(m => m.content).join("\n\n");
  const conversationPart = messages.filter(m => m.role !== "system").map(m => {
    const roleLabel = m.role === "user" ? "ユーザー" : "アシスタント";
    return `${roleLabel}: ${m.content}`;
  }).join("\n\n");
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
async function* callStream({ messages }: { messages: { role: string; content: string }[] }) {
  const systemPart = messages.filter(m => m.role === "system").map(m => m.content).join("\n\n");
  const conversationPart = messages.filter(m => m.role !== "system").map(m => {
    const roleLabel = m.role === "user" ? "ユーザー" : "アシスタント";
    return `${roleLabel}: ${m.content}`;
  }).join("\n\n");
  const prompt = [systemPart, conversationPart].filter(Boolean).join("\n\n");
  const responseStream = await ai.models.generateContentStream({
    model: "gemini-2.5-flash",
    contents: prompt,
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