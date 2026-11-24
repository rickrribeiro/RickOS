import React, { useEffect, useState } from 'react'

interface Rec {
  keyword: string
  items: string[]
}

// Curated (mock) recommendations keyed to profile interests. Real AI-generated
// suggestions (Claude CLI) entram no módulo de IA.
const CATALOG: Rec[] = [
  { keyword: 'café', items: ['% Arabica (Osaka)', 'Blue Bottle Kyoto', 'Cafés de especialidade em Nakameguro'] },
  { keyword: 'anime', items: ['Nakano Broadway', 'Akihabara', 'Ghibli Museum (reserve antes)'] },
  { keyword: 'vida noturna', items: ['Golden Gai (Shinjuku)', 'Bares em Namba', 'Izakayas em Ura-Namba'] },
  { keyword: 'ramen', items: ['Ichiran', 'Ramen de tonkotsu em Hakata', 'Menya Inoichi (Kyoto)'] },
  { keyword: 'izakaya', items: ['Ura-Namba (Osaka)', 'Omoide Yokocho (Tóquio)'] },
  { keyword: 'caminháveis', items: ['Fique em Nakameguro / Shimokitazawa', 'Bairros de Kyoto a pé'] },
  { keyword: 'remotamente', items: ['Cafés com boa Wi-Fi', 'Coworkings em Shibuya'] }
]

const fold = (s: string): string => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

/** Recomendações a partir da Memória Pessoal (integração aprovada `travel.recommendations`, sem LLM). */
export function Recommendations(): React.ReactElement {
  const [bullets, setBullets] = useState<string[]>([])

  useEffect(() => {
    // a consulta é o próprio catálogo: o servidor devolve só as memórias de viagem/interesses que casam
    window.api.memory
      .ctxTravelInterests(CATALOG.map((c) => c.keyword).join(' '))
      .then((r) => setBullets(r.items.map((i) => i.title)))
      .catch(() => setBullets([]))
  }, [])

  const matched = CATALOG.filter((c) => bullets.some((b) => fold(b).includes(fold(c.keyword))))

  return (
    <div className="chart-section">
      <div className="chart-title">⭐ Recomendações</div>
      <p className="travel-muted" style={{ fontSize: 12, margin: '4px 0 10px' }}>
        Baseadas nas suas preferências de viagem e interesses da <strong>Memória Pessoal</strong>. Geração por IA na página IA.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {bullets.map((b) => (
          <span key={b} className="project-chip">{b}</span>
        ))}
      </div>
      {matched.length === 0 ? (
        <div className="empty-hint">Nenhuma recomendação ainda — cadastre preferências de viagem e interesses em Organização → Memória Pessoal.</div>
      ) : (
        <div className="cards-grid">
          {matched.map((c) => (
            <div key={c.keyword} className="stat-card">
              <div className="stat-card-label" style={{ textTransform: 'capitalize' }}>{c.keyword}</div>
              <ul style={{ margin: '8px 0 0', paddingLeft: 16, fontSize: 13, color: 'var(--text-secondary)' }}>
                {c.items.map((it) => <li key={it}>{it}</li>)}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
