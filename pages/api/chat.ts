import type { NextApiRequest, NextApiResponse } from 'next'
import OpenAI from 'openai'

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const { messages } = req.body as { messages?: Array<{ who?: string; text?: string }> }
  if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: 'messages required' })

  try {
    const chatMessages = messages.map(m => ({ role: m.who === 'user' ? 'user' : 'system', content: m.text || '' }))
    chatMessages.unshift({ role: 'system', content: 'あなたは日本語で振る舞うファンタジーRPGのゲームマスターです。短く具体的に返答し、プレイヤーの選択を促してください。' })

    const response = await client.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: chatMessages,
      max_tokens: 300,
    } as any)

    const reply = (response as any).choices?.[0]?.message?.content || (response as any).choices?.[0]?.text || ''
    res.status(200).json({ reply })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'OpenAI error', details: String(err) })
  }
}
