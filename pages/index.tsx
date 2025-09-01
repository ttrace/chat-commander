import { useState, useEffect } from "react";
import MainPanel from "../components/MainPanel";
import ChatPanel from "../components/ChatPanel";
import type { Message, Member, Scenario } from '../types';

export default function Home() {
  // シナリオID・データ・メンバーリスト用state
  const [scenarioId, setScenarioId] = useState("");
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);

  // シナリオ変更時のデータ取得
  useEffect(() => {
    if (!scenarioId) return;
    fetch(`/scenarios/${scenarioId}/scenario.json`)
      .then((res) => (res.ok ? res.json() : Promise.reject(res.statusText)))
      .then((json: Scenario) => {
        setScenario(json);
        setMembers(json.members ?? []);
        setMessages(json.initialMessages ?? []); // ← 初期メッセージもここでセット
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
            scenario={scenario}
            members={members}
          />
        </div>
        <div className="col-span-2 flex flex-col">
          <h1 className="text-2xl font-bold mb-4">対策会議室</h1>
          <ChatPanel scenario={scenario} messages={messages} setMessages={setMessages} />
        </div>
      </div>
    </div>
  );
}
