import React, { useCallback, useEffect, useState } from 'react'
import type { FeedbackVerdict, MemorySuggestion, MemoryType, ProposedMemory, SuggestionOp } from '../../../../shared/memory'
import { MEMORY_TYPES, OP_LABEL, SENSITIVITY_LABEL, TYPE_LABEL, VERDICT_LABEL } from '../../../../shared/memory'
import type { LegacyStatus } from '../api'
import { useMemoryStore } from '../store/memoryStore'
import { Empty, JobBanner, Modal, SensChip, errMsg, fmtDate, relTime, useJob, useMemoryRefresh } from './ui'
import { t as tr } from '../../../i18n'

const SOURCE_LABEL: Record<string, string> = {
  migration: tr('memory.migracaoDaBase'),
  text: tr('memory.textoLivre'),
  import: tr('memory.importacao'),
  interview: tr('memory.meConhecaMelhor2'),
  analysis: tr('memory.analiseDasMemorias'),
  consolidation: tr('memory.consolidacao2'),
  producer: tr('memory.outroModuloAutorizado'),
  manual: tr('memory.manual2')
}
const REJECT_VERDICTS: FeedbackVerdict[] = ['rejected', 'irrelevant', 'incorrect', 'duplicate', 'too_personal', 'other']

export function InboxTab({ onPaste }: { onPaste: () => void }): React.ReactElement {
  const { categories, loadPending } = useMemoryStore()
  const [items, setItems] = useState<MemorySuggestion[]>([])
  const [view, setView] = useState<'open' | 'approved' | 'rejected' | 'snoozed'>('open')
  const [op, setOp] = useState<SuggestionOp | ''>('')
  const [legacy, setLegacy] = useState<LegacyStatus | null>(null)
  const [msg, setMsg] = useState('')
  const [editing, setEditing] = useState<MemorySuggestion | null>(null)
  const { job, track, clear } = useJob(() => load())

  const load = useCallback(() => {
    void window.api.memory.suggestions({ status: view, op: op || null, limit: 300 }).then(setItems)
    void window.api.memory.legacyStatus().then(setLegacy)
    void loadPending()
  }, [view, op, loadPending])
  useEffect(load, [load])
  useMemoryRefresh(load)

  async function act(fn: () => Promise<unknown>, ok?: string): Promise<void> {
    setMsg('')
    try {
      await fn()
      if (ok) setMsg(ok)
      load()
    } catch (e) {
      setMsg(`⚠️ ${errMsg(e)}`)
    }
  }

  const safe = items.filter((s) => s.op === 'CREATE' && s.sensitivity === 'NORMAL' && s.reliability !== 'inferred')
  const catName = (slug: string | undefined): string => {
    const c = categories.find((x) => x.slug === slug)
    return c ? `${c.icon} ${c.name}` : tr('memory.semCategoria')
  }

  return (
    <div>
      {legacy?.hasLegacy && legacy.imports.length === 0 && view === 'open' && (
        <div className="mem-banner">
          <span>
            {tr('memory.sua')} <strong>{tr('memory.baseDeConhecimento')}</strong> {tr('memory.antigaTemItemNsMigre', { bullets: legacy.bullets })}
          </span>
          <span className="mem-actions">
            <button className="btn btn-secondary btn-sm" onClick={() => act(() => window.api.memory.migrate({ ai: false }), tr('memory.sugestoesDaMigracaoCriadas'))}>
              {tr('memory.umaPorLinhaSemIa')}
            </button>
            <button
              className="btn btn-primary btn-sm"
              onClick={() =>
                act(async () => {
                  const r = await window.api.memory.migrate({ ai: true })
                  if (r.jobId) track(r.jobId)
                })
              }
            >
              {tr('memory.migrarComIa')}
            </button>
          </span>
        </div>
      )}
      <JobBanner job={job} onClose={clear} />

      <div className="mem-toolbar">
        <div className="mem-seg" role="group" aria-label={tr('memory.situacao')}>
          {(['open', 'snoozed', 'approved', 'rejected'] as const).map((v) => (
            <button key={v} className={view === v ? 'active' : ''} onClick={() => setView(v)}>
              {tr(`memory.inbox.view.${v}`)}
            </button>
          ))}
        </div>
        <select value={op} onChange={(e) => setOp(e.target.value as SuggestionOp | '')} aria-label={tr('memory.operacao')}>
          <option value="">{tr('memory.todasAsOperacoes')}</option>
          {(Object.keys(OP_LABEL) as SuggestionOp[]).map((o) => (
            <option key={o} value={o}>
              {OP_LABEL[o]}
            </option>
          ))}
        </select>
        <span style={{ flex: 1 }} />
        <button className="btn btn-secondary btn-sm" onClick={() => act(async () => track(await window.api.memory.analyze()))} title={tr('memory.revisaAsMemoriasExistentesE')}>
          {tr('memory.analisarMinhasMemorias')}
        </button>
        <button className="btn btn-secondary btn-sm" onClick={onPaste}>
          {tr('memory.colarTexto')}
        </button>
        {view === 'open' && safe.length > 1 && (
          <button
            className="btn btn-primary btn-sm"
            title={tr('memory.soNovasMemoriasDeclaradasPor')}
            onClick={() =>
              act(async () => {
                const r = await window.api.memory.approveMany(safe.map((s) => s.id))
                setMsg(tr('memory.aprovadaS', { count: r.approved.length, p1: r.skipped.length ? ` · ${r.skipped.length} precisam de revisão individual` : '' }))
              })
            }
          >
            {tr('memory.aprovarSeguras', { count: safe.length })}
          </button>
        )}
      </div>
      {msg && <div className="mem-job">{msg}</div>}

      {items.length === 0 ? (
        view === 'open' ? (
          <Empty icon="📭" title={tr('memory.inboxVazio')}>
            {tr('memory.nadaParaRevisarSugestoesChegam')}
          </Empty>
        ) : (
          <Empty icon="—" title={tr('memory.nadaAqui')} />
        )
      ) : (
        <div className="mem-list">
          {items.map((s) => (
            <SuggestionCard key={s.id} s={s} catName={catName} act={act} onEdit={() => setEditing(s)} />
          ))}
        </div>
      )}
      {editing && (
        <EditBeforeApprove
          s={editing}
          onClose={() => setEditing(null)}
          onApprove={(edited) =>
            act(async () => {
              await window.api.memory.approve(editing.id, { edited })
              setEditing(null)
            }, tr('memory.aprovadaComEdicao'))
          }
        />
      )}
    </div>
  )
}

function SuggestionCard({
  s,
  catName,
  act,
  onEdit
}: {
  s: MemorySuggestion
  catName: (slug?: string) => string
  act: (fn: () => Promise<unknown>, ok?: string) => Promise<void>
  onEdit: () => void
}): React.ReactElement {
  const open = useMemoryStore((st) => st.open)
  const [rejecting, setRejecting] = useState(false)
  const [asking, setAsking] = useState(false)
  const [note, setNote] = useState('')
  const [answer, setAnswer] = useState('')
  const [showEv, setShowEv] = useState(false)
  const isOpen = s.status === 'pending' || s.status === 'snoozed' || s.status === 'needs_info'
  const p = s.proposed
  const inferred = s.reliability === 'inferred'
  const cls = `mem-sug${inferred ? ' inferred' : ''}${s.sensitivity !== 'NORMAL' ? ' sensitive' : ''}`
  const targets = s.targets ?? []
  const snapshotOf = (id: number): string => (s.targetSnapshot.find((t) => t.id === id)?.content as string | undefined) ?? ''

  return (
    <div className={cls}>
      <div className="mem-sug-head">
        <span className="mem-chip accent">{OP_LABEL[s.op]}</span>
        {p && <span className="mem-chip">{catName(p.category)}</span>}
        {p && <span className={`mem-chip${p.type === 'INFERENCE' || p.type === 'LEARNING' ? ' warn' : ''}`}>{TYPE_LABEL[p.type]}</span>}
        {inferred ? <span className="mem-chip warn">{tr('memory.inferenciaDaIa')}</span> : s.sourceKind !== 'import' && <span className="mem-chip ok">{tr('memory.voceDisse')}</span>}
        <SensChip s={s.sensitivity} />
        {s.extractionConfidence != null && <span className="mem-muted">{tr('memory.confiancaDaExtracao2', { p0: Math.round(s.extractionConfidence * 100) })}</span>}
        {s.status === 'needs_info' && <span className="mem-chip warn">{tr('memory.pediuMaisInformacoes')}</span>}
        <span className="mem-muted" style={{ marginLeft: 'auto' }}>
          {SOURCE_LABEL[s.sourceKind] ?? s.sourceKind} · {relTime(s.createdAt)}
        </span>
      </div>

      {s.op === 'ASK' && <div className="mem-sug-content">❓ {s.question}</div>}
      {(s.op === 'CREATE' || ((s.op === 'MERGE' || s.op === 'RESOLVE') && p)) && p && <div className="mem-sug-content">{p.content}</div>}
      {s.op === 'UPDATE' && p && targets[0] && (
        <div className="mem-diff">
          <div className="before">
            <span className="lbl">{tr('memory.atual')}</span>
            {targets[0].content}
          </div>
          <div className="after">
            <span className="lbl">{tr('memory.proposto')}</span>
            {p.content}
          </div>
        </div>
      )}
      {(s.op === 'MERGE' || s.op === 'ARCHIVE' || s.op === 'RESOLVE') && (
        <div style={{ margin: '6px 0' }}>
          <div className="mem-muted">{s.op === 'MERGE' ? tr('memory.consolidaAsOriginaisFicamComo') : s.op === 'ARCHIVE' ? tr('memory.arquivar3') : tr('memory.memoriasEmConflito')}</div>
          {targets.map((t) => (
            <div key={t.id} className="mem-row" style={{ fontSize: 13, padding: '2px 0' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => open(t.id)}>
                #{t.id}
              </button>
              <span>{t.content}</span>
              {snapshotOf(t.id) && snapshotOf(t.id) !== t.content && <span className="mem-chip warn">{tr('memory.mudouDesdeASugestao')}</span>}
            </div>
          ))}
          {targets.length < s.targetIds.length && <div className="mem-muted">{tr('memory.algumaMemoriaAlvoNaoExiste')}</div>}
        </div>
      )}
      {s.rationale && <div className="mem-why">💡 {s.rationale}</div>}
      {s.benefit && <div className="mem-why">🎯 {s.benefit}</div>}
      {s.evidence.length > 0 && (
        <button className="btn btn-secondary btn-sm" style={{ marginTop: 6 }} onClick={() => setShowEv((v) => !v)}>
          {showEv ? tr('memory.esconder') : tr('memory.ver')} {tr('memory.evidencia', { count: s.evidence.length })}
        </button>
      )}
      {showEv &&
        s.evidence.map((e) => (
          <div key={e.id} className="mem-ev" style={{ marginTop: 6 }}>
            {s.sourceKind === 'import' ? e.excerpt : `“${e.excerpt}”`}<div className="mem-muted">{e.sourceRef ?? e.sourceKind}</div>
          </div>
        ))}

      {isOpen && (
        <div className="mem-sug-actions">
          {s.op === 'ASK' ? (
            <>
              <input style={{ flex: 1, minWidth: 180 }} placeholder={tr('memory.suaResposta')} value={answer} onChange={(e) => setAnswer(e.target.value)} aria-label={tr('memory.resposta')} />
              <button
                className="btn btn-primary btn-sm"
                disabled={!answer.trim()}
                onClick={() =>
                  act(async () => {
                    await window.api.memory.extractText(`Pergunta: ${s.question}\nResposta: ${answer}`)
                    await window.api.memory.reject(s.id, 'other', 'respondida')
                  }, tr('memory.respostaEnviadaAsSugestoesAparecem'))
                }
              >
                {tr('memory.responder')}
              </button>
            </>
          ) : s.op === 'RESOLVE' ? (
            <>
              {targets.map((t) => (
                <button key={t.id} className="btn btn-secondary btn-sm" onClick={() => act(() => window.api.memory.approve(s.id, { resolution: { mode: 'keep', keepId: t.id } }), tr('memory.conflitoResolvido'))}>
                  {tr('memory.manter', { id: t.id })}
                </button>
              ))}
              {p && (
                <button className="btn btn-primary btn-sm" onClick={() => act(() => window.api.memory.approve(s.id, { resolution: { mode: 'proposed' } }), tr('memory.resolucaoAplicada'))}>
                  {tr('memory.usarAResolucaoProposta')}
                </button>
              )}
              <button className="btn btn-secondary btn-sm" onClick={() => act(() => window.api.memory.reject(s.id, 'other', 'as duas valem em contextos diferentes'), tr('memory.mantidasAsDuas'))}>
                {tr('memory.asDuasValemContextosDiferentes')}
              </button>
            </>
          ) : (
            <>
              <button className="btn btn-primary btn-sm" onClick={() => act(() => window.api.memory.approve(s.id), tr('memory.aprovada2'))}>
                {tr('memory.aprovar')}
              </button>
              {p && (
                <button className="btn btn-secondary btn-sm" onClick={onEdit}>
                  {tr('memory.editarEAprovar')}
                </button>
              )}
            </>
          )}
          <button className="btn btn-secondary btn-sm" onClick={() => act(() => window.api.memory.snooze(s.id, 7), tr('memory.adiadaPor7Dias'))}>
            {tr('memory.adiar')}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => setAsking((v) => !v)}>
            {tr('memory.maisInformacoes')}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => setRejecting((v) => !v)}>
            {tr('memory.rejeitar')}
          </button>
        </div>
      )}
      {asking && isOpen && (
        <div className="mem-sug-actions">
          <input style={{ flex: 1, minWidth: 180 }} placeholder={tr('memory.oQueFaltaFicaRegistrado')} value={note} onChange={(e) => setNote(e.target.value)} />
          <button className="btn btn-secondary btn-sm" onClick={() => act(() => window.api.memory.needsInfo(s.id, note), tr('memory.marcada')).then(() => setAsking(false))}>
            {tr('memory.marcar')}
          </button>
        </div>
      )}
      {rejecting && isOpen && (
        <div className="mem-sug-actions">
          <span className="mem-muted">{tr('memory.porQueAjudaAIa')}</span>
          {REJECT_VERDICTS.map((v) => (
            <button key={v} className="btn btn-secondary btn-sm" onClick={() => act(() => window.api.memory.reject(s.id, v), tr('memory.rejeitada'))}>
              {VERDICT_LABEL[v]}
            </button>
          ))}
        </div>
      )}
      {s.status === 'approved' && (
        <div className="mem-sug-actions">
          <span className="mem-muted">{tr('memory.aprovada')} {fmtDate(s.resolvedAt, true)}</span>
          {s.resultMemoryIds.map((id) => (
            <button key={id} className="btn btn-secondary btn-sm" onClick={() => open(id)}>
              {tr('memory.ver2', { id })}
            </button>
          ))}
          <button className="btn btn-secondary btn-sm" onClick={() => act(() => window.api.memory.undo(s.id), tr('memory.desfeita'))}>
            {tr('memory.desfazer')}
          </button>
        </div>
      )}
    </div>
  )
}

function EditBeforeApprove({ s, onClose, onApprove }: { s: MemorySuggestion; onClose: () => void; onApprove: (p: Partial<ProposedMemory>) => void }): React.ReactElement {
  const cats = useMemoryStore((st) => st.categories).filter((c) => !c.archivedAt)
  const [p, setP] = useState<ProposedMemory>(s.proposed!)
  return (
    <Modal title={tr('memory.editarAntesDeAprovar')} onClose={onClose}>
      <div className="mem-form" style={{ marginTop: 10 }}>
        <label className="full">
          {tr('memory.conteudo')}
          <textarea value={p.content} onChange={(e) => setP({ ...p, content: e.target.value })} />
        </label>
        <label className="full">
          {tr('memory.titulo')}
          <input value={p.title} onChange={(e) => setP({ ...p, title: e.target.value })} />
        </label>
        <label>
          {tr('memory.categoria')}
          <select value={p.category} onChange={(e) => setP({ ...p, category: e.target.value })}>
            <option value="">{tr('memory.semCategoria')}</option>
            {cats.map((c) => (
              <option key={c.id} value={c.slug}>
                {c.icon} {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {tr('memory.tipo')}
          <select value={p.type} onChange={(e) => setP({ ...p, type: e.target.value as MemoryType })}>
            {MEMORY_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </label>
        <label>
          {tr('memory.importancia2', { p0: p.importance ?? 3 })}
          <input type="range" min={1} max={5} value={p.importance ?? 3} onChange={(e) => setP({ ...p, importance: Number(e.target.value) })} />
        </label>
        <label>
          {tr('memory.sensibilidade')}
          <select value={p.sensitivity ?? 'NORMAL'} onChange={(e) => setP({ ...p, sensitivity: e.target.value as ProposedMemory['sensitivity'] })}>
            {(['NORMAL', 'PRIVATE', 'RESTRICTED'] as const).map((x) => (
              <option key={x} value={x}>
                {SENSITIVITY_LABEL[x]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="modal-actions">
        <button className="btn btn-secondary" onClick={onClose}>
          {tr('memory.cancelar')}
        </button>
        <button className="btn btn-primary" disabled={!p.content.trim()} onClick={() => onApprove(p)}>
          {tr('memory.aprovar')}
        </button>
      </div>
    </Modal>
  )
}
