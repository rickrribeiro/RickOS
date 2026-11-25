import React, { useCallback, useEffect, useState } from 'react'
import type { CoverageRow, CoverageState, FreshnessItem, KnowledgeGap } from '../api'
import { useMemoryStore } from '../store/memoryStore'
import { Empty, JobBanner, SensChip, errMsg, useJob, useMemoryRefresh } from './ui'
import { t } from '../../../i18n'

const STATE: Record<CoverageState, { label: string; cls: string }> = {
  pouco_explorado: { label: t('memory.poucoExplorado'), cls: '' },
  parcial: { label: t('memory.parcialmenteConhecido'), cls: 'accent' },
  bem_documentado: { label: t('memory.bemDocumentado'), cls: 'ok' },
  revisar: { label: t('memory.necessitaRevisao'), cls: 'warn' }
}

export function GapsTab(): React.ReactElement {
  const { open, goCategory, setTab } = useMemoryStore()
  const [gaps, setGaps] = useState<KnowledgeGap[]>([])
  const [cov, setCov] = useState<{ version: string; criteria: string[]; rows: CoverageRow[] } | null>(null)
  const [fresh, setFresh] = useState<FreshnessItem[]>([])
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [msg, setMsg] = useState('')
  const [showCriteria, setShowCriteria] = useState(false)
  const { job, track, clear } = useJob(() => load())

  const load = useCallback(() => {
    void window.api.memory.gaps('open').then(setGaps)
    void window.api.memory.coverage().then(setCov)
    void window.api.memory.freshness().then(setFresh)
  }, [])
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

  return (
    <div className="mem-two">
      <div className="mem-col">
        <div className="mem-panel">
          <h3>
            {t('memory.lacunasRelevantes')}
            <button className="btn btn-secondary btn-sm" onClick={() => act(async () => track(await window.api.memory.detectGaps()))}>
              {t('memory.procurarLacunas')}
            </button>
          </h3>
          <p className="mem-muted" style={{ marginTop: 0 }}>
            {t('memory.soOQueMelhorariaAlguma')}
          </p>
          <JobBanner job={job} onClose={clear} />
          {msg && <div className="mem-job">{msg}</div>}
          {gaps.length === 0 ? (
            <Empty icon="🧩" title={t('memory.nenhumaLacunaAberta')}>
              {t('memory.pecaUmaBuscaDeLacunas')}
            </Empty>
          ) : (
            <div className="mem-list">
              {gaps.map((g) => (
                <div key={g.id} className="mem-sug">
                  <div className="mem-sug-head">
                    <span className="mem-chip accent">{'●'.repeat(g.priority)} {t('memory.prioridade')}</span>
                    {g.category && <span className="mem-chip">{g.category}</span>}
                    <SensChip s={g.sensitivity} />
                  </div>
                  <div className="mem-sug-content">
                    <strong>{g.topic}</strong>
                  </div>
                  <div className="mem-why">💡 {g.why}</div>
                  {g.beneficiaries.length > 0 && <div className="mem-why">{t('memory.ajudaria')} {g.beneficiaries.join(', ')}</div>}
                  <div className="mem-sug-content">❓ {g.question}</div>
                  <div className="mem-sug-actions">
                    <input
                      style={{ flex: 1, minWidth: 180 }}
                      placeholder={t('memory.responderViraSugestaoNoInbox')}
                      value={answers[g.id] ?? ''}
                      onChange={(e) => setAnswers((a) => ({ ...a, [g.id]: e.target.value }))}
                      aria-label={t('memory.respostaPara', { topic: g.topic })}
                    />
                    <button
                      className="btn btn-primary btn-sm"
                      disabled={!answers[g.id]?.trim()}
                      onClick={() => act(async () => track(await window.api.memory.answerGap(g.id, answers[g.id])), t('memory.respostaEnviada'))}
                    >
                      {t('memory.responder')}
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => act(() => window.api.memory.gapStatus(g.id, 'dismissed'))}>
                      {t('memory.dispensar')}
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => act(() => window.api.memory.gapStatus(g.id, 'irrelevant'))}>
                      {t('memory.naoERelevante')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mem-panel">
          <h3>{t('memory.precisamDeReconfirmacao', { count: fresh.length })}</h3>
          <p className="mem-muted" style={{ marginTop: 0 }}>
            {t('memory.criterioDeterministicoPorEstabilidadeE')}
          </p>
          {fresh.length === 0 && <p className="mem-sub">{t('memory.tudoEmDia')}</p>}
          {fresh.map((f) => (
            <div key={f.memory.id} className="mem-row" style={{ fontSize: 13, padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
              <span className={`mem-chip${f.severity === 'alta' ? ' danger' : f.severity === 'media' ? ' warn' : ''}`}>{f.severity}</span>
              <button className="btn btn-secondary btn-sm" onClick={() => open(f.memory.id)} style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {f.memory.title}
              </button>
              <span className="mem-muted" style={{ flex: 1 }}>
                {f.reason}
              </span>
              <button className="btn btn-primary btn-sm" onClick={() => act(() => window.api.memory.confirm(f.memory.id))}>
                {t('memory.continuaValendo')}
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => act(() => window.api.memory.setStatus(f.memory.id, 'outdated'))}>
                {t('memory.mudou')}
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="mem-col">
        <div className="mem-panel">
          <h3>
            {t('memory.coberturaPorDominio')}
            <button className="btn btn-secondary btn-sm" onClick={() => setShowCriteria((v) => !v)}>
              {t('memory.criterios')}
            </button>
          </h3>
          {showCriteria && cov && (
            <div className="mem-ev">
              <strong>{cov.version}</strong>
              {cov.criteria.map((c) => (
                <div key={c}>• {c}</div>
              ))}
              <div className="mem-muted" style={{ marginTop: 4 }}>
                {t('memory.mostraOQueEstaRegistrado')}
              </div>
            </div>
          )}
          <div className="mem-cov">
            {cov?.rows.map((r) => (
              <button key={r.categoryId} className="mem-cov-item mem-card" onClick={() => goCategory(r.categoryId)}>
                <div className="mem-row" style={{ justifyContent: 'space-between' }}>
                  <b>
                    {r.icon} {r.name}
                  </b>
                  <span className={`mem-chip ${STATE[r.state].cls}`}>{STATE[r.state].label}</span>
                </div>
                <div className="mem-muted">{r.why}</div>
                {r.usedBy.length > 0 && <div className="mem-muted">{t('memory.usadaPor')} {r.usedBy.join(', ')}</div>}
              </button>
            ))}
          </div>
          <button className="btn btn-secondary btn-sm" style={{ marginTop: 10 }} onClick={() => setTab('interview')}>
            {t('memory.explorarUmDominioEmMe')}
          </button>
        </div>
      </div>
    </div>
  )
}
