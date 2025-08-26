# プロジェクトファイル一覧および役割の引き継ぎドキュメント

このプロジェクトは、多人数エージェントによる会議型RPGチャットアプリ（Next.js, TypeScript, OpenAI/Ollama LLM連携）です。
**日本語IME入力に対応するための`composing`扱い部分のコードは絶対に変更しないでください。**

---

## ディレクトリ・ファイル構成と主な役割

### 主要フロントエンド

- `components/ChatPanel.tsx`  
  メインチャットUI・ロジック。エージェント選択、発言送信、返信ストリーム受信、backend種別切り替えも担当。  
  **注意**: 日本語IME対応のための`composing`と`onCompositionStart`/`onCompositionEnd`部のコードは変更禁止。

- `components/MainPanel.tsx`
  サブUIパネル。本体チャットやモデル切替など、複数のパネルを管理。

- `components/ModelSelectorPanel.tsx`
  LLMの選択UI。
### バックエンド(API)

- `pages/api/multi-agent.ts`  
  各種LLMプロバイダー（OpenAI, Ollamaなど）へのプロキシAPI。
  クライアントからのリクエストを受信し、指定プロバイダへ問い合わせる。ストリームレスポンスは`sseWrite(res, obj)`関数（`data: ...\n\n`形式）で統一的に出力する。
- `pages/api/chat.ts`  
  別エンドポイントの（詳細未記載）API。
- `pages/api/xml-to-5w1h.ts`  
  XMLから5W1H形式に変換するAPI。

### ドメインロジック・共通定義

- `lib/npcs.ts`
  NPCの定義・共通プロンプト・キャラクター情報(XML形式含む)の格納・出力。

- `lib/prompts.ts`
  プロンプト定義・管理。

- `lib/gemini.ts`
  Gemini APIとのやりとりに関する実装。

### データ・リソース

- `scenarios/op_damascus_suburb.xml`
  シナリオ用XMLファイル例。民間人保護やミッションAbort基準の記述がある。

### システム・設定
- `package.json`  
  依存パッケージ・スクリプト管理。

- `tsconfig.json`  
  TypeScript構成ファイル。

- `next.config.js`  
  Next.jsビルド・実行設定ファイル。
- `next-env.d.ts`  
  Next.js用型定義。**編集禁止**ファイル。

- `styles/globals.css` / `styles/globals.scss`  
  Tailwind等グローバルスタイル指定。

### ページ・UI

- `pages/_app.tsx`
  Next.jsトップラップファイル。
### ドキュメント

- `README.md`, `README_RUN.md`  
  プロジェクト概要・導入解説・実行手順。

---

## コーディング注意事項（引き継ぎ）

- **日本語IME入力対応のため、`components/ChatPanel.tsx`での`composing`・`onCompositionStart`・`onCompositionEnd`のロジックは**
  **絶対に変更しないこと。**
- バックエンドLLM拡張時はAPIロジック・アダプタを分離（例：lib/ 以下で管理）し、API本体（multi-agent.ts）は共通I/Fに。
- ストリーム送信には必ず`sseWrite`関数を利用すること。
- `next-env.d.ts`は自動生成。手動編集禁止。
---

ファイルや機能の追加時も、上記フォーマットに従い役割・注意点を追記してください。

_Last updated: 2025-08_20