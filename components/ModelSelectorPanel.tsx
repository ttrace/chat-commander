import type { Dispatch, SetStateAction } from "react";

type Backend = "openai" | "gemini" | "ollama";

function ModelSelectorPanel({
  open,
  onClose,
  backend,
  setBackend,
  ollamaModel,
  setOllamaModel,
}: {
  open: boolean;
  onClose: () => void;
  backend: Backend;
  setBackend: Dispatch<SetStateAction<Backend>>;
  ollamaModel: string;
  setOllamaModel: (model: string) => void;
}) {
  if (!open) return null;

  return (
    <div className="model-selector-panel fixed top-0 left-0 w-full h-full bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow p-6 min-w-[320px] relative">
        <button
          onClick={onClose}
          className="absolute top-2 right-2 text-gray-400 text-xl"
          aria-label="Close"
        >
          &times;
        </button>

        <h2 className="text-lg font-bold mb-4">モデル設定</h2>

        <fieldset className="">
          <legend className="font-semibold">Backend:</legend>
          <label className="flex items-center gap-2 my-1">
            <input
              type="radio"
              name="backend"
              value="openai"
              checked={backend === 'openai'}
              onChange={() => setBackend('openai')}
            />
            OpenAI
          </label>
          <label className="flex items-center gap-2 my-1">
            <input
              type="radio"
              name="backend"
              value="gemini"
              checked={backend === 'gemini'}
              onChange={() => setBackend('gemini')}
            />
            Gemini
          </label>
          <label className="flex items-center gap-2 my-1">
            <input
              type="radio"
              name="backend"
              value="ollama"
              checked={backend === 'ollama'}
              onChange={() => setBackend('ollama')}
            />
            Ollama（ローカル）
          </label>
        </fieldset>

        {backend === 'ollama' && (
          <div className="mb-2">
            <label htmlFor="ollama-model-input" className="font-semibold block mb-1">
              Ollama Model Name:
            </label>
            <input
              id="ollama-model-input"
              type="text"
              value={ollamaModel}
              onChange={(e) => setOllamaModel(e.target.value)}
              placeholder="Enter Ollama model name"
              className="border rounded px-2 py-1 w-full"
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default ModelSelectorPanel;
