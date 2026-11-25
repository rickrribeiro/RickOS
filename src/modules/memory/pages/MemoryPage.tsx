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
import { t as tr } from '../../../i18n'

const TABS: { key: MemoryTab; label: string }[] = [
  { key: 'overview', label: tr('memory.visaoGeral') },
  { key: 'memories', label: tr('memory.memorias') },
  { key: 'inbox', label: tr('memory.inbox2') },
  { key: 'gaps', label: tr('memory.lacunas') },
  { key: 'interview', label: tr('memory.meConhecaMelhor') },
  { key: 'timeline', label: tr('memory.linhaDoTempo') },
  { key: 'connections', label: tr('memory.conexoes') },
  { key: 'inspector', label: tr('memory.inspector') },
  { key: 'settings', label: tr('memory.configuracoes') }
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
          <h2>{tr('memory.memoriaPessoal')}</h2>
          <p>
            {tr('memory.oQueAIaSabe')} <strong>{tr('memory.sugere')}</strong>{tr('memory.nadaEntraSemASua')}
          </p>
        </div>
        <div className="mem-actions">
          <button className="btn btn-secondary btn-sm" onClick={() => setPasting(true)}>
            {tr('memory.colarTextoSobreMim')}
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>
            {tr('memory.novaMemoria')}
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
