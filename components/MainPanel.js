import { useState } from 'react'

export default function MainPanel() {
  const [player, setPlayer] = useState({ name: '冒険者', level: 1, hp: 30, maxHp: 30, mp: 5, maxMp: 5, gold: 12 })
  const [inventory, setInventory] = useState(['短剣', '薬草'])

  const heal = () => {
    setPlayer(p => ({ ...p, hp: Math.min(p.maxHp, p.hp + 10) }))
  }

  const gainGold = () => {
    setPlayer(p => ({ ...p, gold: p.gold + 5 }))
  }

  return (
    <div className="p-4">
      <div className="bg-white rounded-lg shadow p-4 mb-4">
        <h2 className="text-xl font-semibold">ステータス</h2>
        <div className="mt-2">
          <div>名前: <strong>{player.name}</strong></div>
          <div>レベル: {player.level}</div>
          <div>HP: {player.hp} / {player.maxHp}</div>
          <div>MP: {player.mp} / {player.maxMp}</div>
          <div>所持金: {player.gold}G</div>
        </div>
        <div className="mt-3 flex gap-2">
          <button onClick={heal} className="px-3 py-1 bg-green-500 text-white rounded">回復</button>
          <button onClick={gainGold} className="px-3 py-1 bg-yellow-400 text-black rounded">稼ぐ</button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-4 mb-4">
        <h3 className="text-lg font-medium">所持品</h3>
        <ul className="mt-2 list-disc list-inside">
          {inventory.map((it, i) => <li key={i}>{it}</li>)}
        </ul>
      </div>

      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="text-lg font-medium">クエスト</h3>
        <p className="mt-2 text-sm text-gray-600">村人からの依頼を受けて、魔物討伐に出かけよう。</p>
      </div>
    </div>
  )
}
