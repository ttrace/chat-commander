import type { NextApiRequest, NextApiResponse } from 'next'
import fs from 'fs'
import path from 'path'
import { OpenAI } from 'openai'

// LLMプロンプト（直接埋め込みます・用途に応じて別ファイルでも可）
const LLM_PROMPT = `あなたは厳密なデータ変換器です。与えられた作戦シナリオXMLから、作戦指揮室の情報表示パネル用に厳格なJSONを生成します。推測や脚色は禁止です。XMLに無い情報は追加せず、未知は "不明" と記入します。出力はJSONのみで、前後に説明文やコードフェンスを付けないでください。
目的（UIレイアウト）
UIは次の3エリアで構成されます。
ヘッダー：Mission Statement（1行）＋ status
概要：左＝When/Where & Who（味方/関係省庁）、右＝Who（対象＝敵）
情報：What / Why / How / Risk / Legal / Intel / Unknowns
出力スキーマ（固定キー、未知は"不明"）
 "mission_statement": "string", "status": "string", "overview": { "when": { "time": "string" }, "where": { "country": "string", "city": "string", "area": "string", "precision": "string", "environment": "string" }, "who_friendly": { "lead_unit": "string", "stakeholders": [ { "name": "string", "role": "string", "invited_status": "string" } ] }, "who_target": { "salute": { "size": "number|string", "activity": "string", "location": "string", "unit": "string", "time": "string", "equipment": "string" } } }, "information": { "what": { "operation_type": "string", "objective": "string" }, "why": { "intent": "string" }, "how": { "primary_method": "string", "platform": "string", "munition": { "type": "string", "notes": "string" } }, "risk": { "collateral_notes": ["string"], "casualty_estimates": { "if_attack_executes": { "scenario": "string", "civilians_min": "number|string", "civilians_max": "number|string", "units": "string" }, "if_drone_strike": { "enemy_combatants": "number|string", "civilians_noncombatants_note": "string", "civilians_count": "number|string", "units": "string" } } }, "legal": { "roe": "string", "approval": "string" }, "intel": { "confidence": "string", "facts": ["string"] }, "unknowns": ["string"] }, "provenance": { "scenario_id": "string", "version": "string", "lang": "string" } }
マッピング規則
Mission Statementは、XMLの unit（味方）、setting/location（国・都市・エリア）、adversary/group（敵）、mission/method（主手段）、mission/objective（目的）、mission/objective@intent（意図）、setting/time（時刻）から日本語平文を組み立てる。ただし不明要素は「不明」とする。
例：「〈味方〉は〈場所〉において〈敵〉に対し、〈手段〉により〈目的〉を達成し、〈意図〉を図る。（時刻：〈不明/値〉）」
status は mission/status@value。無ければ "不明"。
overview.when.time は setting/time（@unknown／テキスト）。無ければ "不明"。
overview.where.* は setting/location と setting/environment の属性を対応付け。不在は "不明"。
who_friendly.lead_unit は stakeholders/unit@name。無ければ "不明"。
who_friendly.stakeholders[] は stakeholders/ministry を列挙（name/role/invited をそのまま格納。不存在は "不明"）。
who_target.salute は以下に対応：
size = adversary/group@size_estimate
activity = adversary/activity@type（可能なら target を文中に併記）
location = setting/location の要約（例：「ダマスカス郊外／標的：市内モスク」など）
unit = adversary/group@affiliation と type
time = setting/time（不明可）
equipment = adversary/activity に関連する装備や mission/method/munition@type 等のうち「敵側が用いるもの」。該当不明なら "不明"
information.what.operation_type = scenario@type
information.what.objective = mission/objective@type
information.why.intent = mission/objective@intent
information.how.* は mission/method とその子要素を反映。破片等の備考は munition@fragmentationを notes に落とす（存在しなければ "不明"）。
risk.collateral_notes[] は risk_assessment/collateral/note を列挙。
risk.casualty_estimates.if_attack_executes は risk_assessment/casualty_estimates/if_attack_executes の属性を写経。
risk.casualty_estimates.if_drone_strike は risk_assessment/casualty_estimates/if_drone_strikeの子要素から敵・民間人の数を抽出。民間人に説明（例：「協力者」）があれば civilians_noncombatants_note に文字列で保存。
legal.* は unknowns に法的承認やROEが列挙されていれば "不明" としつつその項目は unknowns に残す。明示値があれば格納。
intel は intel_summary@confidence と fact を列挙。
unknowns は unknowns/item を列挙。
provenance は scenario@id、@version、xml:lang を格納。
正規化ルール
数値は可能なら数値型、それ以外は文字列。数値化できない場合は原文のまま文字列。
不在・不明は必ず "不明"（null やキー欠落は禁止）。
出力は有効なJSONで、キー順は上記スキーマ順を推奨。
余計なキー・推測・解釈は追加しない。
変換対象XML
【ここにXML全文を貼り付ける】
出力はJSONのみ。説明・注釈・コードフェンスを付けないこと。`

// OpenAI APIキーはdotenv経由（Next.jsサーバ環境で設定必須）
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // (将来の拡張用にname指定も対応)
    const scenarioFile = req.query.name || 'op_damascus_suburb.xml';
    const scenarioPath = path.join(process.cwd(), 'scenarios', scenarioFile as string);
    const xmlString = fs.readFileSync(scenarioPath, 'utf-8');

    const systemPrompt = LLM_PROMPT;
    const userPrompt = xmlString;

    // Chat Completions APIでプロンプト送信
    const completion = await client.chat.completions.create({
      model: 'gpt-4o', // 本番ではgpt-5等に。要API確認。
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 2048,
      temperature: 0.0,
    });

    // 応答はJSONオンリーで返す前提
    const output = completion.choices[0].message.content;
    if (!output) {
      res.status(500).json({ error: "No content in LLM response" });
      return;
    }

    // 有効なJSONとして返す
    res.setHeader('Content-Type', 'application/json');
    res.status(200).send(output);
  } catch (error: any) {
    res.status(500).json({ error: error.message || String(error) });
  }
}
