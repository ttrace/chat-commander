# プロジェクトファイル一覧および役割の引き継ぎドキュメント

このプロジェクトは、多人数エージェントによる会議型RPGチャットアプリ（Next.js, TypeScript, OpenAI/Ollama/Gemini LLM連携）です。

**注意: 日本語IME入力に対応するための composing および onCompositionStart/onCompositionEnd のロジックは絶対に変更しないこと。**
---

## データ設計の要点（現行）

- シナリオは XML を廃止し、`public/scenarios/<ID>/scenario.json` 形式に統一（可搬化）。
- シナリオは柔軟なフィールド追加（例: ROE、ルール定義 等）が可能。型（`types/index.ts` の `Scenario`）は拡張性あり。
- 登場人物（members）は scenario.json の members 配列管理。`lib/npcs.ts` は廃止。
- アバター画像は各シナリオフォルダに格納し、avatar フィールドにファイル名（例: `"commander.png"`）を指定。UI 側は `/scenarios/<ID>/<avatar>` で参照。
- 生成モデルプロバイダ（OpenAI, Gemini, Ollama）はシナリオ（scenario）オブジェクトごとフロントから渡す方式で、API サーバ側でディスクI/O再読み込みしない。
---

## ディレクトリ・ファイル構成と主な役割

### フロントエンド

- `components/ChatPanel.tsx`
  - メインチャットUI・ロジック。エージェント選択、発言送信、返信ストリーム受信、backend種別切替に対応。
  - API との対話は `startMultiAgentStream` を通じ、`/api/multi-agent` へ JSON POST + SSE。
  - ストリーム受信は "\n\n" 区切りの `data: ...` 行を JSON パースして onDelta に逐次転送。type: "done" で完了扱い。
  - **IME対応の composing/onCompositionStart/onCompositionEnd のロジックは絶対に変更禁止。**

- `components/MainPanel.tsx`
  - シナリオ選択やメンバーリスト。avatar は `/scenarios/${scenarioId}/${m.avatar}` で表示。

### ページ・状態管理

- `pages/index.tsx`
  - シナリオ選択（scenarioId）に応じて `/scenarios/${scenarioId}/scenario.json` を取得し、`scenario` / `members` / `initialMessages` を state で管理。
  - ChatPanel に scenario, messages, setMessages を渡す。
  - MainPanel に scenarioId, scenario, members を渡す。

### API

- `pages/api/scenario-list.ts`
  - `public/scenarios` 配下を列挙し、scenario.json から id/title を返す。

- `pages/api/multi-agent.ts`
  - マルチエージェント対話API。フロントから渡された payload（model/messages/scenario等）を集約し、各プロバイダの callStream に委譲。
  - 必要であれば JSON Schema（スキーマ）を生成し、プロバイダ呼び出しへ付与可能（例: next_speaker の pattern 動的生成など）。
  - スキーマ pattern 生成等は string 値で渡すこと。

### プロバイダ

- `lib/providers/index.ts`
  - Gemini, OpenAI, Ollama 各種 provider の集約。Provider I/F は messages 配列と scenario を受け取る設計。

- `lib/providers/openai.ts` / `gemini.ts` / `ollama.ts`
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

## 型定義

- `types/index.ts`
  - Message: { who: "user" | "system" | `npc:${string}` | "assistant", text: string }
  - Member: { id: string, name: string, role: string, persona?: string, avatar?: string, supervisorId?: string }
  - Scenario: { id, title, version?, members, initialMessages, ...（任意プロパティ追加可: 例 ROE, rules 等） }
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

