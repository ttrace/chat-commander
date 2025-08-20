import type { NextApiRequest, NextApiResponse } from 'next'
import { NPCS } from '../../lib/npcs'

const OPENAI_API = process.env.OPENAI_API_KEY
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini'

function sseWrite(res: NextApiResponse, obj: any) {
  res.write(`data: ${JSON.stringify(obj)}\n\n`)
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  if (!OPENAI_API) {
    res.status(500).json({ error: 'OPENAI_API_KEY not configured' })
    return
  }

  const { npcIds = [], rounds = 1, context = [] } = req.body as { npcIds?: string[]; rounds?: number; context?: Array<{ role: string; content: string }> }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders?.()

  if (!Array.isArray(npcIds) || npcIds.length === 0) {
    sseWrite(res, { type: 'error', message: 'npcIds required' })
    res.end()
    return
  }

  const baseContext = Array.isArray(context) ? context.slice() : []

  try {
    for (let r = 0; r < rounds; r++) {
      for (const id of npcIds) {
        const npc = NPCS.find(n => n.id === id)
        if (!npc) continue

        const messages = [
          { role: 'system', content: npc.persona },
          ...baseContext.map(m => ({ role: m.role, content: m.content }))
        ]

        // call OpenAI
        const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENAI_API}`,
          },
          body: JSON.stringify({ model: OPENAI_MODEL, messages, max_tokens: 200 }),
        })

        if (!openaiRes.ok) {
          const text = await openaiRes.text()
          console.error('OpenAI error', openaiRes.status, text)
          sseWrite(res, { type: 'error', message: text })
          continue
        }

        const data = await openaiRes.json()
        const text = data.choices?.[0]?.message?.content ?? ''
        baseContext.push({ role: 'assistant', content: text })
        sseWrite(res, { type: 'utterance', agentId: id, name: npc.name, text })
      }
    }

    sseWrite(res, { type: 'done' })
    res.end()
    return
  } catch (err: any) {
    console.error('multi-agent error', err)
    sseWrite(res, { type: 'error', message: err.message || String(err) })
    res.end()
    return
  }
}
