import { useState, useRef, KeyboardEvent } from 'react'
import MainPanel from '../components/MainPanel'

type Message = { who: 'user' | 'system'; text: string }

function ChatMessage({ who, text }: Message) {
  const isUser = who === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-2`}>
      <div className={`${isUser ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-900'} px-4 py-2 rounded-lg max-w-[80%]`}>{text}</div>
    </div>
  )
}

function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>([
    { who: 'system', text: 'ようこそ、冒険者よ。まず名前を教えてくれ。' },
  ])
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
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.body) throw new Error('No response body')

      // append a placeholder assistant message and update progressively
      setMessages(prev => [...prev, { who: 'system', text: '' }])
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let acc = ''
      let finished = false

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        acc += decoder.decode(value, { stream: true })
        console.debug('[stream] chunk', acc)

        const parts = acc.split('\n\n')
        acc = parts.pop() || ''

        for (const part of parts) {
          const line = part.trim()
          if (!line) continue
          const m = line.match(/^data: (.*)$/s)
          if (!m) continue
          const payloadStr = m[1].trim()
          if (payloadStr === '[DONE]') { finished = true; break }
          try {
            const data = JSON.parse(payloadStr)
            const delta = data.delta || ''
            if (delta) {
              setMessages(prev => {
                const copy = [...prev]
                const idx = copy.map(m => m.who).lastIndexOf('system')
                if (idx >= 0) copy[idx] = { ...copy[idx], text: copy[idx].text + delta }
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

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 mb-4 overflow-auto p-2 border rounded bg-white">
        {messages.map((m, i) => (
          <ChatMessage key={i} who={m.who} text={m.text} />
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

export default function Home() {
  return (
    <div className="app-container">
      <div className="card" style={{height: '80vh'}}>
        <div className="col-span-2 overflow-auto">
          <MainPanel />
        </div>
        <div className="col-span-1 flex flex-col">
          <h1 className="text-2xl font-bold mb-4">チャットRPG</h1>
          <ChatPanel />
        </div>
      </div>
    </div>
  )
}
