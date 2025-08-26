import { GoogleGenAI } from '@google/genai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  throw new Error('GEMINI_API_KEY is not set');
}

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
export async function generateGeminiText(messages: { role: string; content: string }[]): Promise<string> {
  // system を先頭にまとめる（複数あれば全部結合）
  const systemPart = messages
    .filter(m => m.role === "system")
    .map(m => m.content)
    .join("\n\n");

  // 会話履歴（assistant/user）を適切に整形して含める
  const conversationPart = messages
    .filter(m => m.role !== "system")
    .map(m => {
      const roleLabel = m.role === "user" ? "ユーザー" : "アシスタント";
      return `${roleLabel}: ${m.content}`;
    })
    .join("\n\n");

  // 最終プロンプト（system があれば先頭に挿入）
  const prompt = [systemPart, conversationPart].filter(Boolean).join("\n\n");

  try {
    // ai.models.generateContent に渡す形は既存コードに合わせる（string を渡す実装）
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt, // system を含んだ prompt を渡す
    });
    return response.text;
  } catch (e) {
    console.error("Gemini text generation error:", e);
    throw e;
  }
}
