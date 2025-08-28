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

### プロバイダ集約とmulti-agent API

- `lib/providers/`
  各種LLMプロバイダの実装とインターフェース集約。現状はGemini APIのみ実装。
  - `lib/providers/gemini.ts`
    Gemini APIとの通信を担当。メッセージ構築(buildMessages)、同期呼び出し(callSync)、およびストリーミング呼び出し(callStream)を提供。
  - `lib/providers/index.ts`
    利用可能なプロバイダをIDで管理し、APIから選択可能にしている。
- `pages/api/multi-agent.ts`  
  複数NPCの会話シミュレーションを行うストリーミングAPI。
  - リクエストでbackend（`gemini`など）とNPC ID群を受け取る。
  - 対応プロバイダを選択し、ビルドされたメッセージ群を用いてストリーミングレスポンスを取得。
  - SSE形式でクライアントへ逐次応答を送信。utterance（発言）と構造化された次発話者指定のJSON行を検出し分けて送信。
  - JSON Schemaによる検証ロジックも用意されているが、現在はストリーミング処理に注力。

- `components/ChatPanel.tsx`
  APIのストリームレスポンス（SSE）を受信し、`data: ...`形式のJSONラインを解析して画面に逐次反映。

### バックエンド(API)
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

---

## 進行中の機能追加: JSONスキーマ/AJV対応（structuredモード）

- 目的: 会話LLMの返答を JSON Schema に準拠させ、utterance と next_speaker を返す構造化出力に対応。
- スキーマ: NextTurnDirective（draft-07）。プロパティ: utterance(string), next_speaker(string, pattern: ^[a-z0-9_\-]+$)。

現状の実装状況
- 依存導入: ajv を導入済み（package.json）。
- サーバ実装: `pages/api/multi-agent.ts`
  - AJV で NextTurnDirective（draft-07）をコンパイルし、LLM 応答を検証。
  - structured フラグ（リクエストの payload.structured）が true の場合、非ストリーミングで全文取得→JSON抽出→検証→SSE 送信。
    - Gemini: `lib/gemini.ts` の `generateGeminiText` を使用。
    - OpenAI: chat.completions（stream: false）で全文取得。
    - Ollama: `stream: false` で全文取得。
  - JSON 抽出: `extractJson(text)` で最初の `{ ... }` ブロックを抽出。
  - 検証OK時のSSEペイロード: `{ type: "structured", agentId, name, utterance, next_speaker }`。
  - 検証NG/抽出失敗時は `{ type: "error", ... }` を `sseWrite(res, obj)` で返却。
- クライアント実装: `components/ChatPanel.tsx`
  - API 呼び出しは `startMultiAgentStream` に統一（POST /api/multi-agent + SSE）。
  - structured モードを使う場合は payload に `structured: true` を付与して送信。onDelta 内で `type === 'structured'` を処理。

既知の注意点/制約
- structured モードは「非ストリーミング（全文）」取得で実装（JSON整合性のため）。将来 JSONL 等でストリーム対応を検討。
- OpenAI は JSON 以外のテキストを前後に付ける場合があるため、`extractJson` で抽出してから AJV 検証。
- Gemini は比較的 JSON 応答が安定。`lib/gemini.ts` 側で `response.text ?? ''` ガードを追加済み。

今後のTODO
- 全ての通信をJSONスキーマを使うstructuredに変更する。
+
+## クライアント実装
+
+- `components/ChatPanel.tsx`
+  - メインチャットUI・ロジックを担当。
+  - APIとの対話は`startMultiAgentStream`関数で一元管理。
+  - `/api/multi-agent`にJSON形式のリクエストをPOSTし、SSE（Server-Sent Events）によるストリーム応答を受信。
+  - 受信したストリームデータは`\n\n`で分割し、`data: ...`のJSONをパース後に`onDelta`で逐次反映、`type: 'done'`で会話終了を通知。
+  - 日本語IME入力対応のため、`composing`イベント部分のコードは変更禁止。
+
+## プロバイダ集約
+
+- `lib/providers/index.ts`
+  - 複数LLMプロバイダ（Gemini、OpenAIなど）を`Provider`インターフェースで抽象化し集約。
+  - `Provider`は`buildMessages`によるプロンプト組み立て、`callSync`（非ストリームAPI呼び出し）、`callStream`（ストリームAPI呼び出し）を持つ。
+  - `lib/providers/gemini.ts`ではNPC・シナリオ情報を元にプロンプトを構築する`buildMessages`を実装。
- バックエンド毎の非ストリーム全文取得処理を `lib/` に切り出し、`pages/api/multi-agent.ts` から共通I/Fで呼び出す（保守性向上）。
- JSON スキーマの外部管理（将来: シナリオからスキーマ生成）に備え、AJV の validator を差し替え可能にする。

_Last updated: 2025-08-27

