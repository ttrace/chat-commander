import type { NextApiRequest, NextApiResponse } from 'next'

// This endpoint proxies a streaming request to OpenAI and exposes it as a Server-Sent Events (SSE) stream.
// The client should read the response body as a stream and append incoming 'delta' fragments.

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  const { messages } = req.body as { messages?: Array<{ who?: string; text?: string }> }
  if (!messages || !Array.isArray(messages)) {
    res.status(400).json({ error: 'messages required' })
    return
  }

  if (!process.env.OPENAI_API_KEY) {
    res.status(500).json({ error: 'OPENAI_API_KEY is not set on the server' })
    return
  }

  try {
    // Map frontend 'who' to OpenAI roles. Treat anything not 'user' as 'assistant'.
    const chatMessages = messages.map(m => ({ role: m.who === 'user' ? 'user' : 'assistant', content: m.text || '' }))
    // Prepend a system prompt for RPG behavior.
    const systemPrompt = process.env.OPENAI_SYSTEM_PROMPT || 'あなたは対話型シナリオを提供するゲームマスターです。ユーザーから与えられるプロンプトを整理しなさい'
    chatMessages.unshift({ role: 'system', content: systemPrompt })

    // Start proxying as SSE
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    res.flushHeaders?.()

    const model = process.env.OPENAI_MODEL || 'gpt-5-nano'

    // Call OpenAI Chat Completions streaming API via fetch
    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({ model, messages: chatMessages, stream: true }),
    })

  if (!openaiRes.ok || !openaiRes.body) {
      const text = await openaiRes.text()
      console.error('OpenAI non-OK:', openaiRes.status, text)
      res.write(`data: ${JSON.stringify({ error: 'OpenAI error', status: openaiRes.status, body: text })}\n\n`)
  res.end()
  return
    }

    const reader = openaiRes.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      // OpenAI streams 'data: {...}\n\n' chunks. Split by double newline.
      const parts = buffer.split('\n\n')
      buffer = parts.pop() || ''

      for (const part of parts) {
        const line = part.trim()
        if (!line) continue
        // Each line may be like: data: {json}
        const m = line.match(/^data: (.*)$/s)
        if (!m) continue
        const data = m[1].trim()
        if (data === '[DONE]') {
          res.write(`event: done\ndata: [DONE]\n\n`)
          res.end()
          return
        }
        try {
          const parsed = JSON.parse(data)
          // delta can be in different fields depending on API
          const delta = parsed.choices?.[0]?.delta?.content || parsed.choices?.[0]?.delta?.text || ''
          if (delta) {
            // Send fragment to client as SSE data event
            res.write(`data: ${JSON.stringify({ delta })}\n\n`)
          }
        } catch (e) {
          // ignore JSON parse errors
        }
      }
    }

    // finish
    res.write(`event: done\ndata: [DONE]\n\n`)
    res.end()
    return
  } catch (err) {
    console.error(err)
    // if headers already sent, stream an error event
    try {
      res.write(`data: ${JSON.stringify({ error: 'OpenAI error', details: String(err) })}\n\n`)
      res.end()
      return
    } catch (_) {
      // fallback
      res.status(500).json({ error: 'OpenAI error', details: String(err) })
      return
    }
  }
}
