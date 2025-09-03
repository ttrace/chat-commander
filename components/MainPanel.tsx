import { useEffect, useState, useCallback, useMemo } from 'react';
import type { Member, Scenario } from '../types';

// 折りたたみセクションコンポーネント
function CollapsibleSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const toggle = useCallback(() => setIsOpen(v => !v), []);
  return (
    <div className="mb-4 border rounded">
      <button
        onClick={toggle}
        className="w-full bg-gray-200 px-4 py-2 text-left font-semibold"
      >
        {title} {isOpen ? '▲' : '▼'}
      </button>
      {isOpen && <div className="p-4 bg-white">{children}</div>}
    </div>
  );
}

type ScenarioListItem = { id: string; title: string };

type MainPanelProps = {
  scenarioId: string;
  onSelectScenario: (id: string) => void;
  scenario?: Scenario;
  members?: Member[];
};

function MainPanel({ scenarioId, onSelectScenario, scenario, members = [] }: MainPanelProps) {
  const [scenarioList, setScenarioList] = useState<ScenarioListItem[]>([]); // シナリオ選択メニュー用

  // シナリオ選択メニュー用のシナリオ一覧取得
  useEffect(() => {
    fetch('/api/scenario-list')
      .then(res => res.ok ? res.json() : Promise.reject(res.statusText))
      .then(setScenarioList)
      .catch(() => setScenarioList([]));
  }, []);

  // 免責（固定の簡単な文言例）
  const disclaimer = useMemo(() => (
    <p className="text-sm text-gray-700">
      ここに免責事項の内容を記載します。会議内容の取り扱いにご注意ください。
    </p>
  ), []);

  // それ以外の情報（ダミー内容）
  const otherInfo = useMemo(() => (
    <p className="text-sm text-gray-700">
      会議に関連するその他の情報をここに表示します。
    </p>
  ), []);

  // タイムライン（ダミー内容）
  const timeline = useMemo(() => (
    <p className="text-sm text-gray-700">
      会議のタイムラインをここに表示します。
    </p>
  ), []);

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

      {/* 会議詳細 折りたたみセクション群 */}
      <div>
        <CollapsibleSection title="1. 免責">
          {disclaimer}
        </CollapsibleSection>

        <CollapsibleSection title="2. 会議メンバー">
          {/* 会議メンバー（既存コードを保持） */}
          {members.length === 0 && <div className="text-gray-500">メンバー情報なし</div>}
          <ul>
            {members.map((m) => (
              <li key={m.id} className="mb-2 flex items-center">
                {m.avatar && <img src={`/scenarios/${scenario?.id}/avatars/${m.avatar}`} alt={m.name} className="w-8 h-8 rounded-full mr-3" />}
                <span className="font-bold">{m.name}</span>
                <span className="ml-2 text-sm text-gray-600">({m.role})</span>
                {m.supervisorId && <span className="ml-2 text-xs text-gray-400">上司: {m.supervisorId}</span>}
              </li>
            ))}
          </ul>
        </CollapsibleSection>

        <CollapsibleSection title="3. それ以外の情報">
          {otherInfo}
        </CollapsibleSection>

        <CollapsibleSection title="4. タイムライン">
          {timeline}
        </CollapsibleSection>
      </div>
    </div>
  );
}

export default MainPanel;
