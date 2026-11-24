import React, { useEffect, useState } from 'react'
import '../memory.css'
import { useMemoryStore, type MemoryTab } from '../store/memoryStore'
import { useMemoryRefresh } from '../components/ui'
import { MemoryDetailModal } from '../components/MemoryDetail'
import { MemoryEditor } from '../components/MemoryEditor'
import { TextInputModal } from '../components/TextInputModal'
import { OverviewTab } from '../components/OverviewTab'
import { MemoriesTab } from '../components/MemoriesTab'
import { InboxTab } from '../components/InboxTab'
import { GapsTab } from '../components/GapsTab'
import { InterviewTab } from '../components/InterviewTab'
import { TimelineTab } from '../components/TimelineTab'
import { ConnectionsTab } from '../components/ConnectionsTab'
import { InspectorTab } from '../components/InspectorTab'
import { SettingsTab } from '../components/SettingsTab'

const TABS: { key: MemoryTab; label: string }[] = [
  { key: 'overview', label: '✨ Visão geral' },
  { key: 'memories', label: '🗂 Memórias' },
  { key: 'inbox', label: '📥 Inbox' },
  { key: 'gaps', label: '🧩 Lacunas' },
  { key: 'interview', label: '💬 Me conheça melhor' },
  { key: 'timeline', label: '🕰 Linha do tempo' },
  { key: 'connections', label: '🕸 Conexões' },
  { key: 'inspector', label: '🔍 Inspector' },
  { key: 'settings', label: '⚙️ Configurações' }
]

export function MemoryPage(): React.ReactElement {
  const { tab, setTab, pending, openId, open, loadCategories, loadPending } = useMemoryStore()
  const [creating, setCreating] = useState(false)
  const [pasting, setPasting] = useState(false)

  useEffect(() => {
    void loadCategories()
    void loadPending()
  }, [loadCategories, loadPending])
  useMemoryRefresh(() => {
    void loadCategories()
    void loadPending()
  })

  return (
    <div className="module-page">
      <div className="mem-hero">
        <div>
          <h2>🧬 Memória Pessoal</h2>
          <p>
            O que a IA sabe sobre você — em memórias pequenas, com origem e histórico. A IA só <strong>sugere</strong>; nada entra sem a sua aprovação, e nenhuma
            outra funcionalidade usa estas memórias sem autorização explícita.
          </p>
        </div>
        <div className="mem-actions">
          <button className="btn btn-secondary btn-sm" onClick={() => setPasting(true)}>
            📝 Colar texto sobre mim
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>
            + Nova memória
          </button>
        </div>
      </div>

      <div className="mem-tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} className={tab === t.key ? 'active' : ''} onClick={() => setTab(t.key)}>
            {t.label}
            {t.key === 'inbox' && pending > 0 && <span className="mem-count">{pending}</span>}
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab />}
      {tab === 'memories' && <MemoriesTab onNew={() => setCreating(true)} />}
      {tab === 'inbox' && <InboxTab onPaste={() => setPasting(true)} />}
      {tab === 'gaps' && <GapsTab />}
      {tab === 'interview' && <InterviewTab />}
      {tab === 'timeline' && <TimelineTab />}
      {tab === 'connections' && <ConnectionsTab />}
      {tab === 'inspector' && <InspectorTab />}
      {tab === 'settings' && <SettingsTab />}

      {creating && <MemoryEditor onClose={() => setCreating(false)} onSaved={(m) => open(m.id)} />}
      {pasting && (
        <TextInputModal
          onClose={() => setPasting(false)}
          onStarted={() => {
            setPasting(false)
            setTab('inbox')
          }}
        />
      )}
      {openId != null && <MemoryDetailModal id={openId} onClose={() => open(null)} />}
    </div>
  )
}
