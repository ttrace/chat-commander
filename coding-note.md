# プロジェクトファイル一覧および役割の引き継ぎドキュメント

このプロジェクトは、多人数エージェントによる会議型RPGチャットアプリ（Next.js, TypeScript, OpenAI/Ollama/Gemini LLM連携）です。

**注意: 日本語IME入力に対応するための composing および onCompositionStart/onCompositionEnd のロジックは絶対に変更しないこと。**

---

## ディレクトリ・ファイル構成と主な役割

- components/
  - MainPanel.tsx:
    - シナリオ選択メニュー、会議メンバー表示などのメインUIパネルを提供。
    - モデル選択ボタンおよびModelSelectorPanelをシナリオ選択メニュー直下に移設。選択UI自体はここで表示するが、状態は上位で管理する。
  - ModelSelectorPanel.tsx:
    - モデル選択に関するUIパネル（backend選択・Ollamaモデル選択等）。
    - propsとして `backend`, `setBackend`, `ollamaModel`, `setOllamaModel` を受け取る。
      - 参考: setBackend の型は `(backend: Backend) => void` としているが、必要であれば `Dispatch<SetStateAction<Backend>>` に戻すと React の setter をそのまま渡せる（互換性の注意）。
  - ChatPanel.tsx:
    - メインチャットUI・ロジック。APIとの通信やメッセージ表示を担当。
    - モデル選択状態はローカルに持たず `pages/index.tsx`から `backend` と `ollamaModel` を props 経由で受け取るように変更。
    - runMultiAgent の新規メッセージ追加時に `backend` / `model` を Message に付与しておくことで、UI側でバッジ表示やログ解析に利用可能にした。
- lib/providers/
  - openai.ts, ollama.ts, gemini.ts: 各LLMプロバイダ向けの会議メッセージ構築ロジックを実装。npcやコンテキストを元にchat API用メッセージ配列を生成。

- pages/
  - api/multi-agent.ts: マルチエージェント会議APIの一部。ユーティリティ関数やAPIエンドポイントを含む。
  - api/scenario-list.ts: `public/scenarios` 配下を列挙し、scenario.json から id/title を返す。
  - index.tsx: ルートページ。シナリオ選択・会議メンバー・チャットパネル、ならびにモデル選択状態（backend, ollamaModel, selectorOpen等）を一元的に管理。MainPanel及びChatPanelへ状態/propsとして渡す。
- public/scenarios/
  - <ID>/scenario.json: シナリオデータのJSON形式ファイル。メンバー・タイトル・初期メッセージ等を格納。
  - <ID>/<avatar>: シナリオごとのアバター画像。

- styles/
  - globals.scss: プロジェクト全体のスタイル定義。
    - モデルバッジ用CSSカスタムプロパティ（--badge-color-openai, --badge-color-gemini, --badge-color-ollama等）
    - .avatar に `data-backend`/`data-model` 属性でバッジ表示
    - 印刷用CSSやトースト等の既存ルールも保持

- types/
  - index.ts: TypeScript型定義。Message, Member, Scenario, Backendなどを定義。

---

## 型定義

- types/index.ts
  - 追加: Backend 型
    - export type Backend = "openai" | "gemini" | "ollama";
  - 変更: Message 型にメタ情報を追加
    - backend?: Backend;
    - model?: string;
  - Message: { who: "user" | "system" | `npc:${string}` | "assistant", text: string, backend?: Backend, model?: string }
  - Member: { id: string, name: string, role: string, persona?: string, avatar?: string, supervisorId?: string }
  - Scenario: { id, title, version?, members?, initialMessages?, ...任意プロパティ }

  これにより各メッセージに「どのバックエンド／モデルで生成されたか」を保持できる。

---

## 変更概要・フロントエンド（実装方針・注意）

- モデル選択UIの位置をChatPanel.tsxからMainPanel.tsxのシナリオ選択メニュー直下に移動。
- モデル選択状態（backend, ollamaModel, selectorOpen）を上位ページ（pages/index.tsx）で管理し、全コンポーネントで共有可能に。
- ModelSelectorPanel.tsxは表示と変更UIのみを担当し、選択状態・切替ロジック自体はprops経由でindex.tsxに委譲する。
- ModelSelectorPanel の setBackend 型:
  - 現在は `setBackend: (backend: Backend) => void` にしているが、`Dispatch<SetStateAction<Backend>>` にすると React の setter をそのまま渡せる（関数型アップデータも許容）。
- ChatPanel.tsxはモデル選択関連の状態管理とUIを削除し、propsで受け取る仕様に変更。
- `runMultiAgent` の新規メッセージ追加時に `backend` / `model` をメッセージに付与。
- SSE受信（onDelta）で新規appendする場合も同様に `backend`/`model` を付与。
- アバターの親要素（.avatar）に `data-backend`/`data-model` 属性を付与し、CSSの疑似要素（::after）でバッジ表示。
- styles/globals.scssにCSSカスタムプロパティ（例: --badge-color-openai, --badge-color-gemini, --badge-color-ollama）を定義し、属性セレクタで色切替。
- 属性値をCSSで参照する際のattr()のブラウザ差分に注意。複数属性を組み合わせる場合は、`data-backend-model` のようにフロントで組み立てて1属性化推奨。確実性優先なら`data-badge`に表示文字列をセット。
---

## ページ・状態管理

- pages/index.tsx
  - シナリオ選択（scenarioId）に応じて `/scenarios/${scenarioId}/scenario.json` を取得し、`scenario` / `members` / `initialMessages` を state で管理。
  - モデル選択状態（backend, ollamaModel, selectorOpen）もここで一元管理し、ChatPanelやMainPanelに共通propsとして渡す。
  - モデル選択の状態リフトアップ
    - `pages/index.tsx` が `selectorOpen`, `backend`, `ollamaModel` を保持し、`MainPanel` と `ChatPanel` に渡す。
    - `ModelSelectorPanel` は表示と変更UIを提供し、実際の状態はindex.tsxが管理する。

---

## メッセージへのメタ付与・バッジ表示

- `components/ChatPanel.tsx` の runMultiAgent で新規メッセージに `backend` / `model` を付与。
- SSE受信(onDelta)や新規追加時も同様。
- バッジ表示（UI/CSS）
  - アバター要素（`.avatar`）に `data-backend` / `data-model` 属性でバッジ。
  - CSS（styles/globals.scss）で
    ```
    .avatar[data-backend="openai"]::after { ... }
    ```
    等のスタイルを用意。--badge-color-* 変数で切り替え。
  - `content: attr(data-backend)` は利用可。複数属性併用時のattr()ブラウザ差分に注意。必要なら `data-badge` にバッジ文字列を入れる方式が堅実。
---

## キーボード (Cmd/Ctrl+Enter) 実行時の注意点 / バグ対策

- 問題: 画面上のボタンからのクリック実行では最新の `backend` が参照されるが、グローバルキーイベント（window.addEventListener で登録したハンドラ）経由だと古い `backend` を使うことがある。
- 原因: グローバルキーイベントハンドラがレンダリング時の古いクロージャ（古い runMultiAgent や古い props）を参照しているため。
- 対処推奨:
  - A) runMultiAgent を useRef に入れて最新の関数参照を保持し、ハンドラでは ref.current を呼ぶ（既存コードを大きく変えたくない場合の簡潔な対処）。
  - B) runMultiAgent を useCallback 化し、globalKeyDown を登録する useEffect に runMultiAgent を依存として入れて再登録する（関数を安定化させる方法）。
- デバッグ: runMultiAgent の API POST 前に console.log(payload) を入れて、キー操作時に送られる payload.backend を必ず確認する。
---

## API 側の注意点

- pages/api/scenario-list.ts
  - `public/scenarios` 配下を列挙し、scenario.json から id/title を返す。
- pages/api/multi-agent.ts
  - マルチエージェント対話API。フロントから渡された payload（model/messages/scenario等）を集約し、各プロバイダの callStream に委譲。
  - APIで受け取った`backend`が`PROVIDERS`のキーと一致するか（大小文字）をチェックすること。
  - 必要であれば JSON Schema（スキーマ）を生成し、プロバイダ呼び出しへ付与可能（例: next_speaker の pattern 動的生成など）。
  - スキーマ pattern 生成等は string 値で渡すこと。
  - `structured`フラグで全文取得/JSON抽出/AJV検証/SSE返却
  - JSON抽出: `extractJson(text)` で最初の{}を抽出
  - schema pattern 等は文字列型で指定

---

## プロバイダ

- lib/providers/index.ts
  - Gemini, OpenAI, Ollama 各種 provider の集約。Provider I/F は messages 配列と scenario を受け取る設計。
- lib/providers/openai.ts / gemini.ts / ollama.ts
  - buildMessages: 以下（disclaimer/behavior/npc.persona/knowledge/baseContext）を system prompt に統合。
      - disclaimer (省略可)
      - behavior（配列は join("\n")で文字列化）
      - npc.persona（必須）
      - knowledge（JSONはJSON.stringifyで文字列化）
  - baseContext は { role, content } 配列として OpenAI 互換型で追加。
  - ストリームは OpenAI/Ollama 共通で `choices[0].delta.content` に対応。
    - 例: `if (obj.choices?.[0]?.delta?.content) { yield { text: obj.choices[0].delta.content } }`
  - Geminiは必要時コンテンツ整形。
---

## シナリオ追加手順

1. `public/scenarios/<ID>/scenario.json` を追加
   - 必要な members と initialMessages、および任意の付帯情報（例: ROE, rules, setting など）を JSON で定義
2. 必要な avatar 画像を同じディレクトリに配置し、members[].avatar にファイル名を指定（例: `"commander.png"`）
3. アプリ起動後 `/api/scenario-list` に自動反映。UI側で一覧選択・読み込み可能
---

## Structured モード・JSON Schema/AJV対応（概要）

- 目的: LLM 返答を JSON Schema に準拠（utterance/next_speaker など）。構造化出力に対応。
- シナリオから派生するスキーマの動的生成も将来対応予定（例: next_speaker pattern を members[].id 連動）。
- サーバ実装: `pages/api/multi-agent.ts`
  - `structured` フラグで全文取得/JSON抽出/AJV検証/SSE返却
  - JSON抽出: `extractJson(text)` で最初の{}を抽出
  - schema pattern 等は文字列型で指定

---

## 小さな実装メモ

- ModelSelectorPanel の setBackend 型:
  - 現在は `setBackend: (backend: Backend) => void` にしているが、`Dispatch<SetStateAction<Backend>>` にすると React の setter をそのまま渡せる（関数型アップデータも許容）。
- ATTR 表示の注意:
  - CSS の `content: attr(data-backend)` は使えます。`attr()` で複数属性を並べる場合の互換性に注意。確実性を優先するならフロントで表示文字列を作って `data-badge` に入れる方式が堅実。

---

## 重要な禁止事項（再掲）

- 日本語IME入力に対応する composing/onCompositionStart/onCompositionEnd のロジックは絶対に変更しないこと。

---

## スクリプト・環境

- package.json: AJV など structured 対応追加済み
- tsconfig.json: 型・path 設定
- next.config.js: Next.js設定
- next-env.d.ts: 自動生成。編集禁止
- styles/globals.css(.scss): グローバルCSS・Tailwind等

---

## ドキュメント・運用

- README.md/README_RUN.md: 概要・セットアップ・コマンド解説
- 本ファイル・各 md ファイルに必ず改変履歴/注意事項を追記し、役割・新設機能の明示を徹底

---

Last Updated: 2025-08-27

