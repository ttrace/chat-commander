import React, { useState, useEffect } from "react";
import MainPanel from "../components/MainPanel";
import ChatPanel from "../components/ChatPanel";
import { Scenario, Member, Message, Backend } from "../types";

// import ModelSelectorPanel from "../components/ModelSelectorPanel"; // ← 未使用のため削除
// import OpenAI from "openai"; // ← 未使用のため削除

export default function Home() {
  // シナリオID・データ・メンバーリスト用state
  const [scenarioId, setScenarioId] = useState("");
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);

  // モデル選択関連 state（index.tsx にて管理）
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [backend, setBackend] = useState<Backend>("openai");
  const [ollamaModel, setOllamaModel] = useState("ollama:latest");

  // シナリオ変更時のデータ取得
  useEffect(() => {
    if (!scenarioId) return;
    fetch(`/scenarios/${scenarioId}/scenario.json`)
      .then((res) => (res.ok ? res.json() : Promise.reject(res.statusText)))
      .then((json: Scenario) => {
        setScenario(json);
        setMembers(json.members ?? []);
        setMessages(json.initialMessages ?? []);
      })
      .catch(() => {
        setScenario(null);
        setMembers([]);
      });
  }, [scenarioId]);

  return (
    <div className="app-container">
      <div className="card">
        <div className="col-span-1 overflow-auto">
          <MainPanel
            scenarioId={scenarioId}
            onSelectScenario={setScenarioId}
            scenario={scenario ?? undefined}
            members={members}
            selectorOpen={selectorOpen}
            setSelectorOpen={setSelectorOpen}
            backend={backend}
            setBackend={setBackend}
            ollamaModel={ollamaModel}
            setOllamaModel={setOllamaModel}
          />
        </div>
        <div className="col-span-2 flex flex-col">
          <h1 className="text-2xl font-bold mb-4">対策会議室</h1>
          <ChatPanel
            scenario={scenario}
            messages={messages}
            setMessages={setMessages}
            backend={backend}          // 追加: ChatPanelへ渡す
            ollamaModel={ollamaModel}  // 追加: ChatPanelへ渡す
            members={members}         // 追加: ChatPanelへ渡す
          />
        </div>
      </div>
    </div>
  );
}
