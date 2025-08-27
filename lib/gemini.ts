import { GoogleGenAI } from "@google/genai";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY is not set");
}

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

// 既存の同期的に全文取得する関数
export async function generateGeminiText(
  messages: { role: string; content: string }[]
): Promise<string> {
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

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });
    const text = response.text ?? "";
    if (!text) {
      throw new Error("No text returned from Gemini");
    }
    return text;
  } catch (e) {
    console.error("Gemini text generation error:", e);
    throw e;
  }
}

// 新規追加: ストリームで少しずつ文章生成を受け取るための async generator 関数
export async function* generateGeminiStream(
  messages: { role: string; content: string }[]
): AsyncGenerator<string> {
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

  try {
    const responseStream = await ai.models.generateContentStream({
      model: "gemini-2.5-flash",
      contents: prompt,
    });
    for await (const chunk of responseStream) {
      const text = (chunk as any).text ?? "";
      if (text) {
        yield text;
      }
    }
  } catch (e) {
    console.error("Gemini streaming error:", e);
    throw e;
  }
}
