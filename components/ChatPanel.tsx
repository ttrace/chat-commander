import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { NPCS } from "../lib/npcs";
import ModelSelectorPanel from "./ModelSelectorPanel";

type Message = { who: string; text: string };

export default function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>([
    { who: "system", text: "状況を教えてください" },
  ]);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [text, setText] = useState("");
  const [isComposing, setIsComposing] = useState(false);
  const isComposingRef = useRef(false);
  const justComposedRef = useRef(false);
  const [isLoading, setIsLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [backend, setBackend] = useState<'openai' | 'ollama'>('openai');
  const [ollamaModel, setOllamaModel] = useState('gemma3:4b');

  const sendMessage = () => {
    if (!text.trim()) return;
    const userMsg: Message = { who: "user", text };
    setMessages((prev) => [...prev, userMsg]);
    setText("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      const nativeComposing =
        (e as any).nativeEvent && (e as any).nativeEvent.isComposing;
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
    isComposingRef.current = true;
    setIsComposing(true);
  };
  const onCompositionEnd = () => {
    isComposingRef.current = false;
    setIsComposing(false);
    justComposedRef.current = true;
    setTimeout(() => {
      justComposedRef.current = false;
    }, 0);
  };

  const runMultiAgent = async (selectedNpcIds: string[], rounds = 1) => {
    setMessages((prev) => {
      const toAdd = selectedNpcIds
        .map((id) => {
          const who = `npc:${id}`;
          if (prev.length > 0 && prev[prev.length - 1].who === who) return null;
          return { who, text: "" };
        })
        .filter(Boolean);
      return [...prev, ...(toAdd as Message[])];
    });

    const messagesArray = messages.map((m) => {
      if (m.who === "user") {
        return {
          role: "user",
          content: `【ゲームプレイヤー発言】${m.text}`,
          who: "user",
        };
      } else if (m.who.startsWith("npc:")) {
        return {
          role: "assistant",
          content: m.text,
          who: m.who,
        };
      } else {
        return {
          role: "system",
          content: m.text,
          who: m.who,
        };
      }
    });

    const apiUrl = '/api/multi-agent';
    const openaiPayload = {
      npcIds: selectedNpcIds,
      rounds,
      context: messagesArray,
    };
    const ollamaPayload = {
      npcIds: selectedNpcIds,
      model: ollamaModel,
      messages: messagesArray,
      stream: true,
      backend: 'ollama',
    };

    const payload = backend === 'ollama' ? ollamaPayload : openaiPayload;
    try {
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.body) throw new Error("No response body");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop() || '';
        for (const part of parts) {
          const line = part.trim();
          if (!line) continue;
          const m = line.match(/^data: (.*)$/s);
          if (!m) continue;
          try {
            const evt = JSON.parse(m[1]);
            const delta =
              evt.delta ??
              (evt.message && typeof evt.message.content === 'string'
                ? evt.message.content
                : '');
            if (delta) {
              setMessages((prev) => {
                const who = evt.agentId ? `npc:${evt.agentId}` : (evt.message?.role === "assistant" ? 'assistant' : '');
                  const idx = prev.map((m) => m.who).lastIndexOf(who);
                  if (idx >= 0 && idx === prev.length - 1) {
                    const copy = [...prev];
                    copy[idx] = {
                      ...copy[idx],
                    text: copy[idx].text + delta,
                    };
                    return copy;
                  }
                return [...prev, { who, text: delta }];
                });
              }
          } catch (e) {
            console.error('parse sse', e);
          }
        }
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { who: "system", text: "通信でエラーが発生しました。" },
      ]);
    }
  };

  useEffect(() => {
    const el = containerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="flex flex-col h-full max-h-full">
      <div
        ref={containerRef}
        className="flex-1 bg-black mb-4 overflow-y-auto max-h-[60vh] p-2 border rounded"
      >
        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex ${
              m.who === "user" ? "justify-end" : "justify-start"
            } mb-2 items-end`}
          >
            {typeof m.who === "string" && m.who.startsWith("npc:") && (
              <img
                src={NPCS.find((n) => `npc:${n.id}` === m.who)?.avatar}
                alt="avatar"
                className="w-24 h-24 rounded-md mr-2"
              />
            )}
            <div
              className={`${
                m.who === "user"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-900"
              } px-4 py-2 rounded-lg max-w-[80%]`}
            >
              {m.text === "" ? (
                <span className="text-gray-400 animate-pulse">...</span>
              ) : (
                m.text
              )}
            </div>
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
        <button
          onClick={sendMessage}
          className="bg-blue-600 text-white px-4 py-2 rounded"
        >
          送信
        </button>
      </div>

      <div className="mt-3 flex gap-2 flex-wrap items-center">
        {NPCS.map((n) => (
          <button
            key={n.id}
            onClick={() => runMultiAgent([n.id], 1)}
            className="px-2 py-1 border rounded flex items-center gap-2"
          >
            <img src={n.avatar} className="w-6 h-6 rounded-full" />
            <span>{n.name}に喋らせる</span>
          </button>
        ))}
        <button
          onClick={() =>
            runMultiAgent(
              NPCS.map((n) => n.id),
              1
            )
          }
          className="px-2 py-1 bg-green-500 text-white rounded"
        >
          全員で会議
        </button>
      </div>

      <div className="flex items-center mt-2">
        <button
          className="ml-auto mr-2 text-gray-500 hover:text-gray-700"
          onClick={() => setModalOpen(true)}
        >
          <svg width="28" height="28" fill="none" viewBox="0 0 24 24">
            <path
              fill="currentColor"
              d="M11.8 9.1a2.9 2.9 0 1 1 0 5.8 2.9 2.9 0 0 1 0-5.8zm7.7 2.9c0-.4 0-.7-.1-1.1l1.6-1.3a.4.4 0 0 0 .1-.5l-1.5-2.7a.5.5 0 0 0-.5-.2l-1.9.8c-.3-.2-.6-.4-.9-.6l-.3-2a.4.4 0 0 0-.4-.3h-3a.4.4 0 0 0-.4.3l-.3 2c-.3.2-.6.4-.9.6l-1.9-.8a.5.5 0 0 0-.5.2l-1.5 2.7c-.1.2 0 .5.1.5l1.6 1.3a6 6 0 0 0-.1 1.1c0 .4 0 .7.1 1.1l-1.6 1.3a.4.4 0 0 0-.1.5l1.5 2.7c.1.2.3.3.5.2l1.9-.8c.3.2.6.4.9.6l.3 2a.4.4 0 0 0 .4.3h3a.4.4 0 0 0 .4-.3l.3-2c.3-.2.6-.4.9-.6l1.9.8a.5.5 0 0 0 .5-.2l1.5-2.7a.4.4 0 0 0-.1-.5l-1.6-1.3c.1-.4.1-.7.1-1.1z"
            />
          </svg>
        </button>
      </div>
      <ModelSelectorPanel
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        backend={backend}
        setBackend={setBackend}
        ollamaModel={ollamaModel}
        setOllamaModel={setOllamaModel}
      />
    </div>
  );
}

