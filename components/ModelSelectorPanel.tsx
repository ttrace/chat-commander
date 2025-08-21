import React from 'react';

export default function ModelSelectorPanel({
  open,
  onClose,
  backend,
  setBackend,
  ollamaModel,
  setOllamaModel,
}: {
  open: boolean;
  onClose: () => void;
  backend: string;
  setBackend: (mode: string) => void;
  ollamaModel: string;
  setOllamaModel: (model: string) => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed top-0 left-0 w-full h-full bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow p-6 min-w-[300px] relative">
        <button onClick={onClose} className="absolute top-2 right-2 text-gray-400 text-xl">&times;</button>
        <h2 className="text-lg font-bold mb-4">モデル設定</h2>
        <div className="flex flex-col gap-3">
          <label>
            <input
              type="radio"
              checked={backend === 'openai'}
              onChange={() => setBackend('openai')}
            />
            <span className="ml-1">OpenAI</span>
          </label>
          <label>
            <input
              type="radio"
              checked={backend === 'ollama'}
              onChange={() => setBackend('ollama')}
            />
            <span className="ml-1">Ollama（ローカル）</span>
          </label>
        </div>
        {backend === 'ollama' && (
          <div className="mt-3">
            <label>
              モデル名:
              <input
                className="ml-2 border px-2 rounded"
                value={ollamaModel}
                onChange={e => setOllamaModel(e.target.value)}
                placeholder="llama3"
              />
            </label>
          </div>
        )}
      </div>
    </div>
  );
}
