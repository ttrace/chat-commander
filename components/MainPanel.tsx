import { useEffect, useState } from 'react';

function MainPanel({ scenarioId, onSelectScenario, scenario, members }) {
  // シナリオ一覧を取得
  const [scenarioList, setScenarioList] = useState<{ id: string; title: string }[]>([]);

  useEffect(() => {
    fetch('/api/scenario-list')
      .then(res => res.ok ? res.json() : Promise.reject(res.statusText))
      .then(setScenarioList)
      .catch(() => setScenarioList([]));
  }, []);

  return (
    <div className="main-panel p-4">
      {/* シナリオ選択メニュー（最上部に追加） */}
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
      {/* ここから下は既存の各種パネルUI … */}
      {/* 例: メンバー/ルール/キーワード/タイムライン表示を追加 */}
    </div>
  );
}

export default MainPanel;

