import ChatWindow from '../pages/chatWindow'

export default function ChatPanel({ children }) {
  return (
    <div className="p-4 flex flex-col h-full">
      {children}
    </div>
  )
}
