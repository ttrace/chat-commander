import React, { useEffect, useState, useCallback, useMemo } from "react";
import type { Member, Scenario, Backend } from "../types";
import ModelSelectorPanel from "./ModelSelectorPanel";

function CollapsibleSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const toggle = useCallback(() => setIsOpen((v) => !v), []);
  return (
    <div className="mb-4 border rounded">
      <button
        onClick={toggle}
        className="w-full bg-gray-200 px-4 py-2 text-left font-semibold"
      >
        {title} {isOpen ? "▲" : "▼"}
      </button>
      {isOpen && <div className="p-4">{children}</div>}
    </div>
  );
}

type ScenarioListItem = { id: string; title: string };

type MainPanelProps = {
  theme: string;
  setTheme: (theme: string) => void;
  scenarioId: string;
  onSelectScenario: (id: string) => void;
  scenario?: Scenario;
  members?: Member[];
  selectorOpen: boolean;
  setSelectorOpen: (v: boolean) => void;
  backend: Backend;
  setBackend: (b: Backend) => void;
  ollamaModel: string;
  setOllamaModel: (m: string) => void;
};

export default function MainPanel({
  theme,
  setTheme,
  scenarioId,
  onSelectScenario,
  scenario,
  members = [],
  selectorOpen,
  setSelectorOpen,
  backend,
  setBackend,
  ollamaModel,
  setOllamaModel,
}: MainPanelProps) {
  const [scenarioList, setScenarioList] = useState<ScenarioListItem[]>([]);

  useEffect(() => {
    fetch("/api/scenario-list")
      .then((res) => (res.ok ? res.json() : Promise.reject(res.statusText)))
      .then(setScenarioList)
      .catch(() => setScenarioList([]));
  }, []);

  const disclaimer = useMemo(
    () => (
      <p className="text-sm">
        {scenario?.disclaimer ??
          "ここに免責事項の内容を記載します。会議内容の取り扱いにご注意ください。"}
      </p>
    ),
    [scenario?.disclaimer]
  );

  const otherInfo = useMemo(
    () => (
      <p className="text-sm">
        会議に関連するその他の情報をここに表示します。
      </p>
    ),
    []
  );

  const timeline = useMemo(
    () => (
      <p className="text-sm">
        会議のタイムラインをここに表示します。
      </p>
    ),
    []
  );

  return (
    <div className="main-panel p-4">
      {/* シナリオ選択メニュー（最上部） */}
      <div className="flex items-center mt-2 mb-3">
        <label htmlFor="scenario-select" className="font-bold mr-2">
          シナリオ選択:{" "}
        </label>
        <div className="select-wrapper">
          <select
            id="scenario-select"
            value={scenarioId || ""}
            onChange={(e) => onSelectScenario(e.target.value)}
          >
            <option value="" disabled>
              シナリオを選択
            </option>
            {scenarioList.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <button
          className="border px-2 py-1 rounded mr-4"
          onClick={() => setSelectorOpen(true)}
        >
          モデル選択
        </button>
        <ModelSelectorPanel
          open={selectorOpen}
          onClose={() => setSelectorOpen(false)}
          backend={backend}
          setBackend={setBackend}
          ollamaModel={ollamaModel}
          setOllamaModel={setOllamaModel}
        />
        <label htmlFor="theme-select">テーマ切替：</label>
        <div className="select-wrapper">
          <select
            id="theme-select"
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
          >
            <option value="default">デフォルト</option>
            <option value="cyberpunk">サイバーパンク風</option>
            <option value="hollywood">ハリウッド風</option>
            {/* 必要に応じて追加 */}
          </select>
        </div>
      </div>

      {/* 会議詳細 折りたたみセクション群 */}
      <div className="main-panel-items">
        <CollapsibleSection title="1. 免責">{disclaimer}</CollapsibleSection>

        <CollapsibleSection title="2. 会議メンバー">
          {members.length === 0 && (
            <div className="text-gray-500">メンバー情報なし</div>
          )}
          <ul>
            {members.map((m) => (
              <li key={m.id} className="mb-2 flex items-center">
                {m.avatar && (
                  <img
                    src={`/scenarios/${scenario?.id}/avatars/${m.avatar}`}
                    alt={m.name}
                    className="w-8 h-8 rounded-full mr-3"
                  />
                )}
                <span className="font-bold">{m.name}</span>
                <span className="ml-2 text-sm text-gray-600">({m.role})</span>
                {m.supervisorId && (
                  <span className="ml-2 text-xs text-gray-400">
                    上司: {m.supervisorId}
                  </span>
                )}
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
