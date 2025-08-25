import {TextGenerationClient, TextGenerationModel} from '@google/genai';

// 環境変数などでAPIキーを管理する想定
const apiKey = process.env.GEMINI_API_KEY ?? '';

// Geminiクライアントの初期化
const client = new TextGenerationClient({ apiKey });

// モデル指定（例として 'models/text-bison-001' を使用）
const model = new TextGenerationModel(client, 'models/text-bison-001');

export async function generateGeminiText(messages: {role: string; content: string}[]): Promise<string> {
  // GeminiはOpenAI形式とは違うが、メッセージのうちユーザー発言文だけを渡すシンプルAPIと仮定
  // messages配列の最後のユーザー発言を使う例
  const userMessage = messages.filter(m => m.role === 'user').slice(-1)[0]?.content || '';

  try {
    const response = await model.generate(
      {
        prompt: userMessage,
        maxTokens: 512,
        temperature: 0.7,
      }
    );
    // 生成結果のテキストを返す
    return response.generations[0].text;
  } catch (e) {
    console.error('Gemini text generation error:', e);
    throw e;
  }
}
