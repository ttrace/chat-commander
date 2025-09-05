# プロジェクトファイル一覧および役割の引き継ぎドキュメント

このプロジェクトは、多人数エージェントによる会議型RPGチャットアプリ（Next.js, TypeScript, OpenAI/Ollama/Gemini LLM連携）です。

**注意: 日本語IME入力に対応するための composing および onCompositionStart/onCompositionEnd のロジックは絶対に変更しないこと。**

---

## ディレクトリ・ファイル構成と主な役割

- components/
  - MainPanel.tsx: シナリオ選択メニュー、会議メンバー表示などのメインUIパネルを提供。折りたたみ式の会議詳細セクションも含む。
    - モデル選択ボタンおよびModelSelectorPanelをシナリオ選択メニュー直下に移設し、状態は上位のpages/index.tsxで一元管理するよう改修。
  - ModelSelectorPanel.tsx: モデル選択に関するUIパネルを提供。バックエンドやモデル種別の切り替えを管理。
  - ChatPanel.tsx: メインチャットUI・ロジック。APIとの通信やメッセージ表示を担当。モデル選択に関する状態管理は削除し、propsで上位管理の状態を受け取るよう変更。

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

- types/
  - index.ts: TypeScript型定義。Message, Member, Scenario, Backendなどを定義。

---

## 型定義

- types/index.ts
  - Message: { who: "user" | "system" | `npc:${string}` | "assistant", text: string }
  - Member: { id: string, name: string, role: string, persona?: string, avatar?: string, supervisorId?: string }
  - Backend: "openai" | "gemini" | "ollama"  // 本変更で追加。モデル選択のバックエンド種別管理用
  - Scenario: { id, title, version?, members?, initialMessages?, ...任意プロパティ }

---


## 変更概要

- モデル選択UIの位置をChatPanel.tsxからMainPanel.tsxのシナリオ選択メニュー直下に移動。
- モデル選択状態（backend, ollamaModel, selectorOpen）を上位ページ（pages/index.tsx）で管理し、全コンポーネントで共有可能に。
- ChatPanel.tsxはモデル選択関連の状態管理とUIを削除し、propsで受け取る仕様に変更。
- ModelSelectorPanel.tsxの型定義でsetBackendをReactのDispatch<SetStateAction<Backend>>から単純な関数型(setBackend: (backend: Backend) => void)に変更（利用側の使いやすさに合わせて調整可能）。
---


## フロントエンド

- components/ChatPanel.tsx
  - メインチャットUI・ロジック。エージェント選択、発言送信、返信ストリーム受信、backend種別切替に対応。
  - API との対話は `startMultiAgentStream` を通じ、`/api/multi-agent` へ JSON POST + SSE。
  - ストリーム受信は "\n\n" 区切りの `data: ...` 行を JSON パースして onDelta に逐次転送。type: "done" で完了扱い。
  - **IME対応の composing/onCompositionStart/onCompositionEnd のロジックは絶対に変更禁止。**
  - モデル選択関連の状態とUIは削除され、propsとして上位から受け取るのみ。

- components/MainPanel.tsx
  - シナリオ選択やメンバーリスト。avatar は `/scenarios/${scenarioId}/${m.avatar}` で表示。
  - モデル選択ボタン/ModelSelectorPanelをシナリオ選択メニュー直下に配置し、状態管理はprops経由で親に委譲。

### ページ・状態管理

- pages/index.tsx
  - シナリオ選択（scenarioId）に応じて `/scenarios/${scenarioId}/scenario.json` を取得し、`scenario` / `members` / `initialMessages` を state で管理。
  - モデル選択状態（backend, ollamaModel, selectorOpen）もここで一元管理し、ChatPanelやMainPanelに共通propsとして渡す。

### API

- pages/api/scenario-list.ts
  - `public/scenarios` 配下を列挙し、scenario.json から id/title を返す。

- pages/api/multi-agent.ts
  - マルチエージェント対話API。フロントから渡された payload（model/messages/scenario等）を集約し、各プロバイダの callStream に委譲。
  - 必要であれば JSON Schema（スキーマ）を生成し、プロバイダ呼び出しへ付与可能（例: next_speaker の pattern 動的生成など）。
  - スキーマ pattern 生成等は string 値で渡すこと。

### プロバイダ

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

## 実装ポリシー（重要）

- **IME 対応コード（composing/onCompositionStart/onCompositionEnd）は絶対に変更しないこと。**
- シナリオデータは `public/scenarios/<ID>/scenario.json` に集約管理。`lib/npcs.ts` は廃止済み。
- アバター画像は各シナリオのローカルファイル名とし、UI 側で `/scenarios/${scenarioId}/${avatar}` へ解決する。
- シナリオの任意情報（ROE, 分岐ルール等）は scenario オブジェクトの任意プロパティとして直接保持。system prompt や knowledge 用に動的に差し込める。
- 各プロバイダには scenario オブジェクトを payload に含めて都度渡す。API サーバ側で都度ファイルアクセスしない。
- モデルプロバイダ（OpenAI/Gemini/Ollama）のストリームは SSE 利用、OpenAI 形式の delta（choices[0].delta.content）中心に扱う（Geminiは適宜変換）。
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
