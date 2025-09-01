# プロジェクトファイル一覧および役割の引き継ぎドキュメント

このプロジェクトは、多人数エージェントによる会議型RPGチャットアプリ（Next.js, TypeScript, OpenAI/Ollama LLM連携）です。
**日本語IME入力に対応するための`composing`扱い部分のコードは絶対に変更しないでください。**

---

## ディレクトリ・ファイル構成と主な役割

### 主要フロントエンド

- `components/ChatPanel.tsx`  
  メインチャットUI・ロジック。エージェント選択、発言送信、返信ストリーム受信、backend種別切り替えも担当。  
  **注意**: 日本語IME対応のための`composing`と`onCompositionStart`/`onCompositionEnd`部のコードは変更禁止。
  - APIとの対話は`startMultiAgentStream`関数で一元管理。
  - `/api/multi-agent`にJSON形式POST+SSEでやりとり、ストリームデータの逐次反映は`onDelta`経由。
  - 受信したストリームデータは`\n\n`で分割、`data: ...`のJSONをパースし`onDelta`に渡す。`type: 'done'`で完了通知。
- `components/MainPanel.tsx`
  サブUIパネル。本体チャットやモデル切替など、複数のパネルを管理。

- `components/ModelSelectorPanel.tsx`
  LLMの選択UI。

### プロバイダ集約

- `lib/providers/`
  各種LLMプロバイダの実装とインターフェース集約。OpenAI、Gemini、Ollama対応。

- `lib/providers/index.ts`
  複数LLMプロバイダを`Provider` I/Fで抽象化・集約。
  - `buildMessages`: プロンプト生成、`callSync`: 非ストリーム呼び出し、`callStream`: ストリーム呼び出しを持つ。

- `lib/providers/gemini.ts`
  Gemini API対応。NPC・シナリオ情報を元に`buildMessages`等を実装。

### multi-agent API/バックエンド

- `pages/api/multi-agent.ts`  
  複数NPCの会話シミュレーション用SSEストリームAPI
  - リクエストでbackend（`gemini`等）、NPC ID群、structuredフラグ等を受け取る。
  - Provider呼び出しやストリーム応答、structured対応（全文取得＆スキーマ検証）。
  - SSE形式でクライアントへ逐次応答送信。`utterance`や次発話者のJSONなどを分離して送る。
  - JSON Schema（AJV）による検証対応：structured:true時は全文取得→JSON抽出（`extractJson`）→AJV検証→SSE送信。エラー時は`type: 'error'`で返却。
  - ストリーム送信には`sseWrite`関数を必ず利用。

- `pages/api/chat.ts`  
  別エンドポイント（詳細未記載）。

- `pages/api/xml-to-5w1h.ts`  
  XMLから5W1H形式変換API。

### ドメインロジック・共通定義

- `lib/npcs.ts`
  NPC定義・共通プロンプト・キャラクター情報（XML含む）の集約。

- `lib/prompts.ts`
  プロンプト定義・管理。

- `lib/gemini.ts`
  Gemini APIやストリーム/全文取得実装。`generateGeminiText`他。

### データ・リソース

- `scenarios/op_damascus_suburb.xml`
  旧シナリオ定義(XML)。以降JSON形式への移行推奨。

### システム・設定

- `package.json`  
  依存・スクリプト管理。`ajv`等 structured対応追加済み。

- `tsconfig.json`  
  TypeScript設定。

- `next.config.js`  
  Next.js設定。

- `next-env.d.ts`  
  Next.js型定義（自動生成・**編集禁止**）。

- `styles/globals.css` / `styles/globals.scss`  
  Tailwind等グローバルスタイル。

### ページ・UI

- `pages/_app.tsx`
  アプリ全体のトップラップ。

### ドキュメント

- `README.md`, `README_RUN.md`  
  プロジェクト概要・導入解説・実行手順。

---

## 共通型定義(TypeScript)について

プロジェクト全体で型の重複や不整合を避けるため、`types/index.ts`に主要な型定義を一元管理しています。

### 主な型定義（types/index.ts）

```typescript
// メッセージ（チャット1件）の型
export type Message = {
  who: "user" | "system" | `npc:${string}` | "assistant";
  text: string;
};

// 登場人物（メンバー/NPC/エージェント）
export type Member = {
  id: string;
  name: string;
  role: string;
  persona?: string;
  avatar?: string;
  supervisorId?: string;
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
```

- **Message**: チャットの発話単位。発話者を`who`（ユーザー・システム・NPC等）および内容`text`で持つ。NPCは `npc:エージェントID` のような表記に対応。
- **Member**: 会議での一人ひとりの登場人物。役割やアバター、上司情報も含む。
- **Scenario**: シナリオ自体の汎用型。`members`や`initialMessages`などを含み、柔軟拡張可能。

すべてのファイル・コンポーネントで型を共通import（`import type { Message, Member, Scenario } from '../types'` 等）し、
propsや状態管理の型も統一することで型エラーや運用バグを防止しています。
---

## シナリオパッケージ構成（現状2024/06）

このプロジェクトでは、各会議シナリオは「パッケージ」（ディレクトリ単位）として `public/scenarios/` 配下に管理されます。

### 主なディレクトリ・ファイル構成

```
public/
  scenarios/
    {scenarioId}/
      scenario.json         -- シナリオ本体の設定・登場人物・初期メッセージ等をすべて含む構造化JSON
      avatars/
        (各memberで利用するアバター画像, 例: operator.png, safety_officer.png, など)
```

#### ファイル・ディレクトリの役割

- **public/scenarios/{scenarioId}/scenario.json**
  - シナリオ個別の主ファイル（JSON）
  - 含める内容例：
    - `id`, `title`, `version`... ：基本情報
    - `members`: 登場人物・エージェント一覧（役割、名前、アバターID、上司ID、性格など）
    - `initialMessages`：会議開始時点でのシステム・状況説明メッセージ
    - その他柔軟に新規項目（ルール・イベント・分岐条件等）

- **public/scenarios/{scenarioId}/avatars/**
  - 上記シナリオ専用のアバター画像置き場
  - `scenario.json` の `avatar` フィールドでパス（例: `"./avatars/operator.png"`）として利用

### フロントエンド・バックエンドとのデータ連携

- **シナリオ一覧の取得**
  - `/api/scenario-list`（`pages/api/scenario-list.ts`）で `public/scenarios/` を走査し、
    - 配下のシナリオID一覧＋タイトルをAPIで取得
    - クライアントはここで得た一覧から選択UI生成

- **シナリオ本体データの取得**
  - クライアントサイドの `fetch('/scenarios/{scenarioId}/scenario.json')` で直接取得
  - 初期メッセージやmembers情報などもこのJSON経由でパネル・チャット内容に反映

- **アバター画像の利用**
  - `public/scenarios/{scenarioId}/avatars/xxx.png` を `img`タグや`src`属性で参照

### 型定義・仕様管理

- 構造化JSON（`scenario.json`）の型・構成は `types/index.ts` にて型定義
  - 主な型：`Scenario`, `Member`, `Message` など
  - props/stateや型アノテーションは `import type { Scenario, Member, Message } from '../types'` で統一

### 運用・追加・変更フロー

- 新シナリオ追加： `public/scenarios/{新id}/scenario.json` と `avatars/` 以下に必要な画像を配置
- 削除もディレクトリごと削除で即反映
- シナリオ編集は `scenario.json` を直接編集（型に準拠）
- シナリオ切替はクライアントUIのセレクトから、パネル・チャットの状態を動的に変更

---

以上が2024年6月時点の「シナリオパッケージ構成」および現状構成ファイルリスト・役割です。

今後「認証」や「柔軟なルール参照」「分岐イベント」導入時はこのJSONモデルの拡張あるいはAPI方式への追加拡張が想定されます。

今後、/scenarios/ 以下に各シナリオごとのディレクトリを作成し、以下のような形式でシナリオを管理します。

- `/scenarios/{scenario_id}/scenario.json`
  シナリオ本体・設定・登場人物・ルール等をJSON形式で一元管理します。

- `/scenarios/{scenario_id}/resources/avatars/[avatar_id].png`
  シナリオで使用するアバター画像をここに配置します。

- 共通ルールや他シナリオでも再利用する断片（ルールやNPC設定等）は、`/scenarios/common/` 下などにJSONで分離し、各シナリオJSONから参照パスやIDでリンクする設計とします。

  例：
  ```json
  {
    "title": "オペレーション・ダマスカス近郊",
    "setting": {...},
    "members": [...],
    "rules": ["../common/general_rules.json", "../common/roeg_rules.json"]
  }
  ```
  ※実際のリンク先ファイルはアプリ側で読み込み・マージしてください。
---

## ハードコード断片の集約について

これまでプロジェクト中でハードコードされていたシナリオ固有データ（登場人物定義、ルール文、設定断片等）は、今後すべて該当するシナリオの`scenario.json`または`common`ディレクトリに外部ファイルとして集約・管理します。各種LLMプロバイダやUI内で直接定義されていた断片も段階的に`/scenarios/`以下に統一し、シナリオパッケージとして流動的な差し替え・管理を可能とします。

これにより、シナリオの切り替え・可搬・バージョン管理・再利用が容易になり、将来的な自然文→シナリオ自動生成やエクスポートにも対応しやすくなります。
---

## コーディング注意事項（引き継ぎ）

- **日本語IME入力対応のため、`components/ChatPanel.tsx`での`composing`・`onCompositionStart`・`onCompositionEnd`のロジックは絶対に変更しないこと。**
- バックエンドLLM拡張時はAPIロジック・アダプタを分離（例：lib/ 以下で管理）し、API本体（multi-agent.ts）は共通I/Fに。
- ストリーム送信には必ず`sseWrite`関数を利用すること。
- `next-env.d.ts`は自動生成。手動編集禁止。
- ファイルや機能の追加時は、本ドキュメント記法に従い役割・注意点・ディレクトリを必ず追記すること。

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
- バックエンド毎の非ストリーム全文取得処理を `lib/` に切り出し、`pages/api/multi-agent.ts` から共通I/Fで呼び出す（保守性向上）。
- JSON スキーマの外部管理（将来: シナリオからスキーマ生成）に備え、AJV の validator を差し替え可能にする。

_Last updated: 2025-08-27



