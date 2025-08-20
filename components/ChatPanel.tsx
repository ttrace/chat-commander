import { useState, useRef, useEffect, KeyboardEvent } from 'react'

type Message = { who: 'user' | 'system'; text: string }

export default function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>([
    { who: 'system', text: 'ようこそ、冒険者よ。まず名前を教えてくれ。' },
  ])
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [text, setText] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isComposing, setIsComposing] = useState(false)
  const isComposingRef = useRef(false)
  const justComposedRef = useRef(false)

  const sendMessage = async () => {
    if (!text.trim()) return
    const userMsg: Message = { who: 'user', text }
    setMessages(prev => [...prev, userMsg])
    setText('')

    setIsLoading(true)
    try {
      const payload = { messages: [...messages, userMsg] }
      // start streaming request
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.body) throw new Error('No response body')

      // append a placeholder assistant message and update it as fragments arrive
      setMessages(prev => [...prev, { who: 'system', text: '' }])
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let acc = ''
      let finished = false

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        acc += decoder.decode(value, { stream: true })

        // Debug: show raw accumulated chunk
        console.debug('[stream] chunk', acc)

        // Split SSE-like chunks separated by double newline
        const parts = acc.split('\n\n')
        acc = parts.pop() || ''

        for (const part of parts) {
          const line = part.trim()
          if (!line) continue
          const m = line.match(/^data: (.*)$/s)
          if (!m) continue
          const payloadStr = m[1].trim()
          if (payloadStr === '[DONE]') {
            finished = true
            break
          }
          try {
            const data = JSON.parse(payloadStr)
            const delta = data.delta || ''
            if (delta) {
              // update the last assistant message
              setMessages(prev => {
                const copy = [...prev]
                // find last assistant message index
                const idx = copy.map(m => m.who).lastIndexOf('system')
                if (idx >= 0) {
                  copy[idx] = { ...copy[idx], text: copy[idx].text + delta }
                }
                return copy
              })
            }
          } catch (e) {
            console.error('[stream] JSON parse error for payload:', payloadStr, e)
          }
        }

        if (finished) break
      }
    } catch (err) {
      setMessages(prev => [...prev, { who: 'system', text: '通信でエラーが発生しました。' }])
    } finally {
      setIsLoading(false)
    }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const nativeComposing = (e as any).nativeEvent && (e as any).nativeEvent.isComposing
      console.log('[debug] onKeyDown: key=Enter, isComposingRef=', isComposingRef.current, 'isComposing=', isComposing, 'native.isComposing=', nativeComposing, 'justComposed=', justComposedRef.current)
      if (isComposingRef.current || isComposing || nativeComposing || justComposedRef.current) return
      e.preventDefault()
      sendMessage()
    }
  }

  const onCompositionStart = () => {
    console.log('[debug] compositionstart -> true')
    isComposingRef.current = true
    setIsComposing(true)
  }
  const onCompositionEnd = () => {
    console.log('[debug] compositionend -> false')
    isComposingRef.current = false
    setIsComposing(false)
    justComposedRef.current = true
    setTimeout(() => { justComposedRef.current = false }, 0)
  }

  // auto-scroll to bottom when messages change
  useEffect(() => {
    const el = containerRef.current
    if (el) {
      // scroll to bottom
      el.scrollTop = el.scrollHeight
    }
  }, [messages])

  return (
    <div className="h-full flex flex-col">
      <div ref={containerRef} className="flex-1 mb-4 overflow-scroll p-2 border rounded bg-white">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.who === 'user' ? 'justify-end' : 'justify-start'} mb-2`}>
            <div className={`${m.who === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-900'} px-4 py-2 rounded-lg max-w-[80%]`}>{m.text}</div>
          </div>
        ))}
        {isLoading && <div className="text-sm text-gray-500">思案中...</div>}
      </div>

      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          onCompositionStart={onCompositionStart}
          onCompositionEnd={onCompositionEnd}
          className="flex-1 border rounded px-3 py-2"
          placeholder="メッセージを入力..."
        />
        <button onClick={sendMessage} className="bg-blue-600 text-white px-4 py-2 rounded">
          送信
        </button>
      </div>
    </div>
  )
}
