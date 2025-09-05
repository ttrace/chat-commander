import { useState, useRef, useEffect, KeyboardEvent } from "react";
import type { Member, Message } from "../types";
import type { Backend } from "../types";

type ChatPanelProps = {
  scenario?: any;
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  backend: Backend;
  ollamaModel: string;
  // 必要なら他のpropsを追加
};

async function startMultiAgentStream(
  payload: any,
  onDelta: (obj: any) => void,
  onDone?: () => void,
  onError?: (error: any) => void
) {
  const res = await fetch("/api/multi-agent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
    const parts = buf.split("\n\n");
    buf = parts.pop() || "";
    for (const part of parts) {
      const line = part.trim();
      if (!line) continue;
      const m = line.match(/^data: (.*)$/s);
      if (!m) continue;
      try {
        const payload = JSON.parse(m[1]);
        if (payload.type === "done") {
          onDone?.();
        } else {
          onDelta(payload);
        }
      } catch (e) {
        console.error("invalid SSE data", e);
      }
    }
  }
  onDone?.();
}

export default function ChatPanel({ scenario, messages, setMessages, backend, ollamaModel }: ChatPanelProps) {
  const initialMessages: Message[] =
    scenario &&
    Array.isArray(scenario.initialMessages) &&
    scenario.initialMessages.length > 0
      ? scenario.initialMessages
      : [
          {
            who: "system",
            text: "シリア暫定政府から、テロリストの目標がダマスカス市内のモスクであると伝えられた。想定される死者数は400人。夕礼拝で避難も難しい。英国の治安維持部隊が監視しているテロリストを排除してほしい、という要請があった。",
          },
        ];
  const NPCS = scenario?.members ?? [];

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [text, setText] = useState("");
  const [isComposing, setIsComposing] = useState(false);
  const isComposingRef = useRef(false);
  const justComposedRef = useRef(false);
  const [isLoading, setIsLoading] = useState(false);
  const [highlightNpcId, setHighlightNpcId] = useState<string | null>(null);
  const [isInputFocused, setIsInputFocused] = useState(false);

  useEffect(() => {
    function globalKeyDown(e: KeyboardEvent) {
      if (isInputFocused) return;
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        if (highlightNpcId) {
          runMultiAgent([highlightNpcId], 1);
          setHighlightNpcId(null);
        }
      }
    }
    window.addEventListener("keydown", globalKeyDown as any);
    return () => window.removeEventListener("keydown", globalKeyDown as any);
  }, [isInputFocused, highlightNpcId]);

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
      } else if (typeof m.who === "string" && m.who.startsWith("npc:")) {
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

    setIsLoading(true);
    try {
      await startMultiAgentStream(
        {
          npcIds: selectedNpcIds,
          rounds,
          context: messagesArray,
          backend,
          model:
            backend === "ollama"
              ? ollamaModel
              : backend === "gemini"
              ? "gemini-2.5-flash"
              : undefined,
          structured: true,
          scenario
        },
        (evt) => {
          if (evt.error) {
            setMessages((prev) => [
              ...prev,
              { who: "system", text: `エラー: ${evt.error}` },
            ]);
            setIsLoading(false);
            return;
          }
          if (evt.done || evt.type === "done") {
            setIsLoading(false);
            return;
          }
          let delta: string | undefined = undefined;
          let who: string = "";
          if (evt.delta && evt.agentId) {
            delta = evt.delta;
            who = `npc:${evt.agentId}`;
          } else if (
            evt.message &&
            typeof evt.message.content === "string" &&
            evt.message.role === "assistant"
          ) {
            delta = evt.message.content;
            who = "assistant";
          } else if (
            evt.type === "structured" &&
            evt.utterance != null &&
            evt.next_speaker
          ) {
            delta = evt.utterance;
            if (evt.next_speaker === "player") {
              who = "user";
              setHighlightNpcId(null);
            } else {
              who = `npc:${evt.agentId}`;
              setHighlightNpcId(evt.next_speaker);
            }
          }
          if (delta !== undefined && who) {
            setMessages((prev) => {
              const idx = prev.map((m) => m.who).lastIndexOf(who as Message["who"]);
              if (idx >= 0 && idx === prev.length - 1) {
                const copy = [...prev];
                copy[idx] = {
                  ...copy[idx],
                  text: copy[idx].text + delta,
                };
                return copy;
              }
              return [...prev, { who: who as Message['who'], text: delta! }];
            });
          }
        },
        () => {
          setIsLoading(false);
        },
        (err) => {
          setMessages((prev) => [
            ...prev,
            { who: "system", text: "通信でエラーが発生しました。" },
          ]);
          setIsLoading(false);
        }
      );
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { who: "system", text: "通信でエラーが発生しました。" },
      ]);
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
        className="chatpanel flex-1 bg-black mb-4 overflow-y-auto max-h-[60vh] p-2 border rounded"
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
              src={`/scenarios/${scenario.id}/avatars/${NPCS.find((n: Member) => `npc:${n.id}` === m.who)?.avatar}`}
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
          onFocus={() => setIsInputFocused(true)}
          onBlur={() => setIsInputFocused(false)}
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
        {NPCS.map((n: Member) => (
          <button
            key={n.id}
            onClick={() => {
              runMultiAgent([n.id], 1);
              setHighlightNpcId(null);
            }}
            className={
              `px-2 py-1 border rounded flex items-center gap-2` +
              (highlightNpcId === n.id
                ? " bg-yellow-300 border-yellow-500 next-speaker"
                : "")
            }
          >
            <img src={`/scenarios/${scenario.id}/avatars/${n.avatar}`} className="w-6 h-6 rounded-full" />
            <span>{n.name}に喋らせる</span>
          </button>
        ))}
      </div>
      </div>
  );
}
