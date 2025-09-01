import { useEffect, useState } from 'react';
import type { Member, Scenario } from '../types';

type ScenarioListItem = { id: string; title: string };

type MainPanelProps = {
  scenarioId: string;
  onSelectScenario: (id: string) => void;
  scenario?: Scenario;
  members?: Member[];
};

function MainPanel({ scenarioId, onSelectScenario, scenario, members = [] }: MainPanelProps) {
  const [scenarioList, setScenarioList] = useState<ScenarioListItem[]>([]);

  useEffect(() => {
    fetch('/api/scenario-list')
      .then(res => res.ok ? res.json() : Promise.reject(res.statusText))
      .then(setScenarioList)
      .catch(() => setScenarioList([]));
  }, []);

  return (
    <div className="main-panel p-4">
      {/* シナリオ選択メニュー（最上部） */}
      <div className="mb-3">
        <label htmlFor="scenario-select" className="font-bold mr-2">シナリオ選択: </label>
        <select
          id="scenario-select"
          value={scenarioId || ''}
          onChange={e => onSelectScenario(e.target.value)}
        >
          <option value="" disabled>シナリオを選択</option>
          {scenarioList.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
      </div>

      {/* Membersパネル：型安全な情報表示 */}
      <div className="bg-white rounded shadow p-4">
        <h2 className="text-lg font-semibold mb-4">会議メンバー</h2>
        {members.length === 0 && <div className="text-gray-500">メンバー情報なし</div>}
        <ul>
          {members.map((m) => (
            <li key={m.id} className="mb-2 flex items-center">
              {m.avatar && <img src={m.avatar} alt={m.name} className="w-8 h-8 rounded-full mr-3" />}
              <span className="font-bold">{m.name}</span>
              <span className="ml-2 text-sm text-gray-600">({m.role})</span>
              {m.supervisorId && <span className="ml-2 text-xs text-gray-400">上司: {m.supervisorId}</span>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default MainPanel;
