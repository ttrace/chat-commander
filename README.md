# Chat RPG - Multi-Agent Meeting Simulator

このリポジトリは、OpenAI (GPT-4o/GPT-5等) および Google Gemini を活用した多人数ロールプレイ・チャット会議ゲーム雛形です。  
Next.js + React + TypeScript + Tailwind CSS構成で、シナリオはXMLで管理し、複数NPC＋プレイヤーが独立したコンテキスト/権限で会議できます。

---

## 主な機能

- プレイヤーとNPCによるリアルタイム会議風チャット体験
- OpenAI GPT-4o/GPT-5 と Gemini (Google GenAI) 両対応
- シナリオは `scenarios/` 配下のXMLファイルで管理。複数切り替え可
- 各NPCの設定・共通ルールは `lib/npcs.ts` で一元管理
- 複数ベンダーのLLMを使い分けるバックエンドAPI（`pages/api/multi-agent.ts`）
- プレイヤー発言や状況入力は多人数マルチエージェント文脈の一部として扱う
- reasoning_effort や verbosity 等 GPT-5やGeminiのパラメータ対応済み
- IME日本語入力対応により自然な発話入力が可能

---

## Gemini対応について

- Gemini APIとのやりとりは `lib/gemini.ts` に実装されており、ストリーミング対応もあります。
- Gemini用のAPIキーは `.env.local` の `GEMINI_API_KEY` にセットしてください。
- フロントエンドUI（`components/ChatPanel.tsx`）でバックエンド種別を切り替え可能です。
- API経由で Gemini のチャットモデル（例：`gemini-2.5-flash`）を利用できます。

---

## 環境セットアップ

1. リポジトリをクローンし依存インストール

```bash
git clone <repository-url>
cd <project-root>
npm install
```

2. 環境変数設定（`.env.local` を作成）

```bash
cp .env.example .env.local
```

`OPENAI_API_KEY` と合わせて `GEMINI_API_KEY` を設定してください。

3. 開発サーバー起動

```bash
npm run dev
```

4. ブラウザで `http://localhost:3000` にアクセス

---

## ファイル構成

- `components/ChatPanel.tsx`  
  メインチャットUI。エージェント選択やLLMモデル選択、メッセージ送受信（ストリーム受信）を担当。  
  ※日本語IME入力部分の特殊処理には注意。

- `components/ModelSelectorPanel.tsx`  
  LLM種別・モデル選択UI。

- `pages/api/multi-agent.ts`  
  OpenAI・Ollama・Geminiなど複数LLMへのAPIプロキシ。ストリーミング応答対応。

- `lib/gemini.ts`  
  Google Gemini API連携ロジック

- `scenarios/`  
  XML形式の各種会議シナリオデータ

---

## よくある質問

- **Geminiを使いたいがどうしたらよいか？**  
  `.env.local` に `GEMINI_API_KEY` を設定し、チャット画面で「モデル選択」から Gemini を選択してください。

---
