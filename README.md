# Chat RPG (Next.js + React + react-chat-ui + Tailwind + OpenAI)

このリポジトリは、OpenAI を使ったシンプルなチャットベースのロールプレイングゲームの雛形です。

セットアップ:

```bash
# ルートで依存をインストール
npm install

# ローカルで起動
cp .env.example .env.local
# .env.local に OpenAI の API KEY をセット
npm run dev
```

ファイル要約:
- `pages/index.js` - フロントエンドのチャット UI
- `pages/api/chat.js` - OpenAI を呼び出す API ルート
- `tailwind.config.js`, `postcss.config.js`, `styles/globals.css` - Tailwind 設定

注意: 実行前に `.env.local` に `OPENAI_API_KEY` を設定してください。
