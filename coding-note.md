# プロジェクトファイル一覧および役割の引き継ぎドキュメント

このプロジェクトは、多人数エージェントによる会議型RPGチャットアプリ（Next.js, TypeScript, OpenAI/Ollama LLM連携）です。
**日本語IME入力に対応するための`composing`扱い部分のコードは絶対に変更しないでください。**

---

## ディレクトリ・ファイル構成と主な役割

### 主要フロントエンド

- `components/ChatPanel.tsx`  
  メインチャットUI・ロジック。エージェント選択、発言送信、返信ストリーム受信、backend種別切り替えも担当。  
  **注意**: 日本語IME対応のための`composing`と`onCompositionStart`/`onCompositionEnd`部のコードは変更を加えないでください。

- `lib/npcs.ts`  
  NPCの定義・共通プロンプト・キャラXML出力ロジック。`NPCS`配列に全エージェント情報とpersona(XML形式含む)が保存されています。

### バックエンド(API)

- `pages/api/multi-agent.ts`  
  NPC複数会話処理のAPI。OpenAIおよびOllama両方のストリーム生成・分岐、プロンプト合成、セーフな履歴管理など。  
  deltaストリーミング・Ollamaのthinkブロックの抑制・systemプロンプト合成ロジックもここに含まれます。

- `pages/api/chat.ts`  
  一般的なチャットAPI（詳細はコードおよび仕様参照）。

- `pages/api/xml-to-5w1h.ts`  
  シナリオXMLから5W1Hフォーマットを生成するAPI。OpenAI API呼び出しと出力JSON返却等。

### ページ・UI

- `pages/_app.tsx`  
  Next.jsのトップラップファイル。

### 設定・依存

- `package.json`  
  依存パッケージ・スクリプト管理。

- `tsconfig.json`  
  TypeScript構成ファイル。

- `next.config.js`  
  Next.jsビルド・実行設定ファイル。`pageExtensions`指定など。

- `next-env.d.ts`  
  Next.js型補助ファイル。

- `styles/globals.css` / `styles/globals.scss`  
  Tailwind等グローバルスタイル指定。

### シナリオ・データ

- `scenarios/` ディレクトリ  
  シナリオXMLファイルを格納（例: `op_damascus_suburb.xml`）。ゲーム会議ロールプレイの元情報。

### ドキュメント

- `README.md`, `README_RUN.md`  
  プロジェクト概要・導入解説・実行手順。

---

## 注意事項

- **日本語 IME 対応のための `composing` に関するコードは編集禁止です。**  
  これに該当する`ChatPanel.tsx`の`onCompositionStart`/`onCompositionEnd`、`isComposingRef`, `justComposedRef`、発言送信制御等は絶対に手を加えないでください。

- 新たなファイルやAPI追加時は、上記の役割と整合が取れるように保守してください。

---

_Last updated: 2025-08_20