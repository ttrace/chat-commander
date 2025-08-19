import { useState, useRef } from "react";

function ChatMessage({ who, text }) {
  const isUser = who === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-2`}>
      <div
        className={`${
          isUser ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-900"
        } px-4 py-2 rounded-lg max-w-[80%]`}
      >
        {text}
      </div>
    </div>
  );
}

export default function Home() {
  const [messages, setMessages] = useState([
    { who: "system", text: "ようこそ、冒険者よ。まず名前を教えてくれ。" },
  ]);
  const [text, setText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isComposing, setIsComposing] = useState(false);
  const isComposingRef = useRef(false);
  const justComposedRef = useRef(false);

  const sendMessage = async () => {
    if (!text.trim()) return;
    const userMsg = { who: "user", text };
    setMessages((prev) => [...prev, userMsg]);
    setText("");

    setIsLoading(true);
    try {
      const payload = { messages: [...messages, userMsg] };
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      const botReply = data.reply || "...";
      setMessages((prev) => [...prev, { who: "system", text: botReply }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { who: "system", text: "通信でエラーが発生しました。" },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const onKeyDown = (e) => {
    // 入力中（IME composing）の Enter は送信しない
    if (e.key === "Enter") {
      // React の合成イベントでは nativeEvent.isComposing が使えるブラウザが多い
      const nativeComposing = e.nativeEvent && e.nativeEvent.isComposing;
      console.log(
        "[debug] onKeyDown: key=Enter, isComposingRef=",
        isComposingRef.current,
        "isComposing=",
        isComposing,
        "native.isComposing=",
        nativeComposing,
        "justComposed=",
        justComposedRef.current
      );
      if (
        isComposingRef.current ||
        isComposing ||
        nativeComposing ||
        justComposedRef.current
      )
        return;
      e.preventDefault();
      sendMessage();
    }
  };

  const onCompositionStart = () => {
    console.log("[debug] compositionstart -> true");
    isComposingRef.current = true;
    setIsComposing(true);
  };
  const onCompositionEnd = () => {
    console.log("[debug] compositionend -> false");
    isComposingRef.current = false;
    setIsComposing(false);
    // 同一イベントループ内に発生する Enter を抑止する
    justComposedRef.current = true;
    setTimeout(() => {
      justComposedRef.current = false;
    }, 0);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-100 to-white p-8">
      <div className="max-w-2xl mx-auto bg-white rounded-xl shadow p-6">
        <h1 className="text-2xl font-bold mb-4">チャットRPG</h1>

        <div className="mb-4 h-[60vh] overflow-auto p-2 border rounded">
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
          <button
            onClick={sendMessage}
            className="bg-blue-600 text-white px-4 py-2 rounded"
          >
            送信
          </button>
        </div>
      </div>
    </div>
  );
}
