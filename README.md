# Chat commander - Multi-Agent Meeting Simulator

このリポジトリは、OpenAIおよび Google Gemini、Ollamaを活用した多人数チャット会議シミュレーターです。  
Next.js + React + TypeScript + Tailwind CSS構成で、シナリオはjsonで管理し、複数NPC＋プレイヤーが独立したコンテキスト/権限で会議できます。

![Chat-commander起動画面](resources/images/chat-commander.png)

---

## 主要機能

- 多人数NPCのロールプレイによる対話シミュレーション
- OpenAI/Gemini/OllamaのチャットAPIに対応
- シナリオの切り替え、任意の会議設定に対応
- 日本語IME対応の入力環境
- ストリーム形式のレスポンス逐次表示
- チャットタイムラインの印刷機能

---

## シナリオ管理

- シナリオは現在 `public/scenarios/` 以下にJSON形式で配置
- 各シナリオ内の `members` には、NPCのID、役割、バックエンド（`backend`）、モデル（`model`）指定を含む
- 複数LLMバックエンドを同時に利用可能で、多様な対話シミュレーションを実現

---

## メッセージ構造とコンテキスト構築

- LLM APIに渡すメッセージは、`lib/providers/` 配下の各プロバイダーの `buildMessages` 関数で構築
- システムメッセージにはシナリオの免責事項（`disclaimer`）、NPCのペルソナ（`persona`）、行動指針（`behavior`）、知識情報などを含む
- 会話履歴の発言は発言者ID（`who`）を明記し、発言内容の先頭に `<who>の発言:` を付加して区別

---

## 利用方法

### 1. リポジトリをクローンする

```bash
git clone https://github.com/ttrace/chat-commander.git
cd chat-commander
```

### 2. 依存パッケージをインストールする（npmを使用）

```bash
npm install
```

### 3. 開発サーバーを起動する

```bash
npm run dev
```

Next.js開発サーバーがデフォルトで http://localhost:3000 にて起動します。

### 4. ブラウザでアクセス

お好きなブラウザで以下のURLにアクセスしてください。

```
http://localhost:3000
```

---

## 現在のシナリオ管理

- **シナリオはすべて `public/scenarios/<ID>/scenario.json` に定義** されています。  
  - NPCメンバー情報、初期メッセージやシナリオ固有の付帯情報（例：ROE）もここに記述します。  
  - シナリオJSON配下の画像ファイル（avatar）は同フォルダ内に格納し、ファイル名のみをJSONに記載します。

---

## シナリオ切り替えと追加

- サイドバーからシナリオ一覧を取得し、選択することで現在のシナリオを切り替え可能です。

- 新規シナリオ追加手順:
  1. `public/scenarios/` に新しいID名のフォルダを作成します。
  2. その中に `scenario.json` を新規に作成し、membersやinitialMessagesなど必要なデータを記述します。
  3. ナビゲーションのシナリオ一覧API(`/api/scenario-list`)が自動で検知し反映します。
  4. 必要に応じてavatar画像ファイルを同フォルダに配置し、membersのavatarプロパティにファイル名を指定します。
  
---

## scenario.jsonの編集例

```json
{
  "id": "battle_of_town",
  "title": "町の戦い",
  "members": [
    { "id": "commander", "name": "司令官", "role": "作戦指揮", "avatar": "commander.png" },
    { "id": "scout", "name": "偵察兵", "role": "情報収集", "avatar": "scout.png" }
  ],
  "initialMessages": [
    { "who": "system", "text": "作戦開始。全員配置につけ。" }
  ],
  "ROE": "攻撃は上官の許可がある場合のみ実施すること。",
  "version": "1.0"
}
```

--- 

## 参考情報

- 型定義はTypeScriptで管理
- シナリオ切り替えやメンバープロフィール編集は `components/MainPanel.tsx`、モデル選択は `ModelSelectorPanel.tsx` で管理
- API `/api/multi-agent` がバックエンドLLMとの通信を担当、チャットストリーム受信は `components/ChatPanel.tsx` の `startMultiAgentStream` 関数で行う

--- 

## 開発上の注意

- 日本語IME対応の入力処理の部分は必ず維持してください（`composing`扱いのコード）。
- シナリオ情報はすべてJSONで管理し、拡張性を意識した形式を心がけてください。
- 画像はシナリオフォルダ配下のローカルファイルを指定し、UIコンポーネントが動的に読み込みます。

---

## 今後の展望

- LLM側へのスキーマ制約対応の強化
- シナリオ編集用UIの追加
- シナリオのバージョン管理や共有機能の拡充

---

以上、現状の構成と運用の概要となります。何かご不明点・ご相談ありましたらご連絡ください。
