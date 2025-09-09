// メッセージ（チャット1件）の型
export type Backend = "openai" | "gemini" | "ollama";

export type Message = {
  who: "user" | "system" | `npc:${string}` | "assistant";
  text: string;
  backend?: Backend;
  model?: string;
};

// 登場人物（メンバー/NPC/エージェント）
export type Member = {
  id: string;
  name: string;
  role: string;
  persona?: string;
  avatar?: string;
  supervisorId?: string;
  backend?: Backend; // 追加: 使用するバックエンド
  model?: string;   // 追加: 使用するモデル
};

// シナリオ本体の型（拡張性重視。必要で追記）
export type Scenario = {
  id: string;
  title: string;
  version?: string;
  members?: Member[];
  initialMessages?: Message[];
  // 柔軟に他の項目も追加
  [key: string]: any;
};
