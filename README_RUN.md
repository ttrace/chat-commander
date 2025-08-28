# Chat RPG - Multi-Agent Meeting Simulator

## 環境セットアップとローカル実行
依存をインストールして起動します:

```bash
npm install
cp .env.example .env.local
# .env.local に OPENAI_API_KEY と GEMINI_API_KEY を設定
# 例:
# OPENAI_API_KEY=sk-xxxxxx
# GEMINI_API_KEY=your_gemini_api_key_here
npm run dev
```

ブラウザで http://localhost:3000 を開きます。
