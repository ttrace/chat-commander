import { useState, useEffect } from 'react'

export default function MainPanel() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/xml-to-5w1h')
      .then(res => res.ok ? res.json() : Promise.reject(res.statusText))
      .then(json => {
        setData(json)
        setLoading(false)
      })
      .catch(e => {
        setError('情報の取得に失敗しました')
        setLoading(false)
      })
  }, [])

  if (loading) return <div className="text-gray-500">ロード中...</div>
  if (error) return <div className="text-red-500">{error}</div>
  if (!data) return <div>データなし</div>

  return (
    <div className="p-4">
      {/* ヘッダー */}
      <div className="bg-white rounded-lg shadow p-4 mb-4">
        <h2 className="text-xl font-semibold">Mission Statement</h2>
        <div><strong>Mission:</strong> {data.mission_statement}</div>
        <div><strong>Status:</strong> {data.status}</div>
      </div>

      {/* 概要 */}
      <div className="bg-white rounded-lg shadow p-4 mb-4">
        <h3 className="text-lg font-medium mb-2">概要</h3>
        <div className="flex gap-8">
          <div className="w-1/2">
            <div><strong>When:</strong> {data.overview?.when?.time}</div>
            <div><strong>Where:</strong> {[
              data.overview?.where?.country,
              data.overview?.where?.city,
              data.overview?.where?.area,
              data.overview?.where?.precision,
              data.overview?.where?.environment
            ].filter(Boolean).join(' / ')}</div>
            <div><strong>誰（味方）:</strong> {data.overview?.who_friendly?.lead_unit}</div>
            {Array.isArray(data.overview?.who_friendly?.stakeholders) && data.overview.who_friendly.stakeholders.map((s, i) =>
              <div key={i}>
                <span>{s.name} ({s.role}) [{s.invited_status}]</span>
              </div>
            )}
          </div>
          <div className="w-1/2">
            <div><strong>敵:</strong> {data.overview?.who_target?.salute?.unit}</div>
            <div><strong>人数:</strong> {data.overview?.who_target?.salute?.size}</div>
            <div><strong>活動:</strong> {data.overview?.who_target?.salute?.activity}</div>
            <div><strong>兵器/装備:</strong> {data.overview?.who_target?.salute?.equipment}</div>
          </div>
        </div>
      </div>

      {/* 情報 */}
      <div className="bg-white rounded-lg shadow p-4 mb-4">
        <h3 className="text-lg font-medium mb-2">情報</h3>
        <div><strong>What(作戦/目的):</strong> {data.information?.what?.operation_type} / {data.information?.what?.objective}</div>
        <div><strong>Why(意図):</strong> {data.information?.why?.intent}</div>
        <div><strong>How(方法):</strong> {data.information?.how?.primary_method}, {data.information?.how?.platform}, {data.information?.how?.munition?.type}, {data.information?.how?.munition?.notes}</div>
        <div><strong>Risk(リスク):</strong> {data.information?.risk?.collateral_notes?.join(', ')}</div>
        {/* 必要に応じてここに further fields ... */}
      </div>
    </div>
  )
}

