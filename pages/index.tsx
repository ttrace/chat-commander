import { useState, useRef, KeyboardEvent } from 'react'
import MainPanel from '../components/MainPanel'
import ChatPanel from '../components/ChatPanel'

type Message = { who: 'user' | 'system'; text: string }

function ChatMessage({ who, text }: Message) {
  const isUser = who === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-2`}>
      <div className={`${isUser ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-900'} px-4 py-2 rounded-lg max-w-[80%]`}>{text}</div>
    </div>
  )
}

// Use the shared ChatPanel component (includes NPC buttons)

export default function Home() {
  return (
    <div className="app-container">
      <div className="card">
        <div className="col-span-1 overflow-auto">
          <MainPanel />
        </div>
        <div className="col-span-2 flex flex-col">
          <h1 className="text-2xl font-bold mb-4">対策会議室</h1>
          <ChatPanel />
        </div>
      </div>
    </div>
  )
}
