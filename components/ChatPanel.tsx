import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { NPCS } from "../lib/npcs";
import ModelSelectorPanel from "./ModelSelectorPanel";

type Message = { who: string; text: string };

export default function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>([
    {
      who: "system",
      text: "シリア暫定政府から、テロリストの目標がダマスカス市内のモスクであると伝えられた。想定される死者数は400人。夕礼拝で避難も難しい。英国の治安維持部隊が監視しているテロリストを排除してほしい、という要請があった。",
    },
  ]);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [text, setText] = useState("");
  const [isComposing, setIsComposing] = useState(false);
  const isComposingRef = useRef(false);
  const justComposedRef = useRef(false);
  const [isLoading, setIsLoading] = useState(false);

  const [backend, setBackend] = useState<"openai" | "gemini" | "ollama">(
    "openai"
  );
  const [ollamaModel, setOllamaModel] = useState<string>("llama3.1");
  const [selectorOpen, setSelectorOpen] = useState(false);

  const sendMessage = async () => {
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

  async function runMultiAgent(selectedNpcIds: string[], rounds = 1) {
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

    console.log("Received messages:", messagesArray);
    if (!messagesArray) {
      setMessages((prev) => [
        ...prev,
        { who: "system", text: "エラー: messages missing in request body" },
      ]);
      return;
    }

    setIsLoading(true);
    try {
      const payload = {
        backend,
        messages,
        ollamaModel: backend === "ollama" ? ollamaModel : undefined,
      };

      console.groupCollapsed("POST /api/multi-agent payload");
      console.dir(payload);
      console.groupEnd();

      const res = await fetch("/api/multi-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          npcIds: selectedNpcIds,
          rounds,
          context: messagesArray,
          backend,
          model: backend === "ollama" ? ollamaModel : undefined,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        setMessages((prev) => [
          ...prev,
          { who: "system", text: `エラー: ${res.status} ${errorText}` },
        ]);
        setIsLoading(false);
        return;
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) {
        setIsLoading(false);
        return;
      }

      let buf = "";
      let done = false;
      while (!done) {
        const { value, done: streamDone } = await reader.read();
        if (streamDone) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() || "";
        for (const part of parts) {
          const trimmed = part.trim();
          if (!trimmed.startsWith("data:")) continue;
          const json = trimmed.slice(5).trim();
          if (!json) continue;
          try {
            const evt = JSON.parse(json);
            if (evt.error) {
              setMessages((prev) => [
                ...prev,
                { who: "system", text: `エラー: ${evt.error}` },
              ]);
              done = true;
              break;
            } else if (evt.done) {
              done = true;
              break;
            } else if (
              evt.delta ||
              (evt.message && typeof evt.message.content === "string")
            ) {
              const delta =
                evt.delta ??
                (evt.message && typeof evt.message.content === "string"
                  ? evt.message.content
                  : "");
              if (delta) {
                setMessages((prev) => {
                  const who = evt.agentId
                    ? `npc:${evt.agentId}`
                    : evt.message?.role === "assistant"
                    ? "assistant"
                    : "";
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
            }
          } catch (e) {
            setMessages((prev) => [
              ...prev,
              { who: "system", text: "SSE parse error." },
            ]);
            done = true;
          }
        }
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { who: "system", text: "通信でエラーが発生しました。" },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

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
        {/* <button
          onClick={() =>
            runMultiAgent(
              NPCS.map((n) => n.id),
              1
            )
          }
          className="px-2 py-1 bg-green-500 text-white rounded"
        >
          全員で会議
        </button> */}
      </div>

      <div className="flex items-center mt-2">
        <button
          className="border px-2 py-1 rounded"
          onClick={() => setSelectorOpen(true)}
        >
          モデル選択
        </button>
      </div>
      <ModelSelectorPanel
        open={selectorOpen}
        onClose={() => setSelectorOpen(false)}
        backend={backend}
        setBackend={setBackend}
        ollamaModel={ollamaModel}
        setOllamaModel={setOllamaModel}
      />
    </div>
  );
}

