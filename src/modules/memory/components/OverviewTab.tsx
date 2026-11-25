import React, { useCallback, useEffect, useState } from 'react'
import type { Overview } from '../api'
import { useMemoryStore } from '../store/memoryStore'
import { Empty, MemoryCard, fmtDate, jobLabel, relTime, useMemoryRefresh } from './ui'
import { t } from '../../../i18n'

export function OverviewTab(): React.ReactElement {
  const { categories, setTab, open, goCategory } = useMemoryStore()
  const [o, setO] = useState<Overview | null>(null)
  const load = useCallback(() => void window.api.memory.overview().then(setO), [])
  useEffect(load, [load])
  useMemoryRefresh(load)

  if (!o) return <p className="mem-muted">{t('memory.carregando')}</p>
  const c = o.counts
  const fresh = c.active === 0 && c.pending === 0

  const maxGrowth = Math.max(1, ...o.growth.map((g) => g.n))
  const topCats = categories.filter((x) => !x.archivedAt && (x.memoryCount ?? 0) > 0).sort((a, b) => (b.memoryCount ?? 0) - (a.memoryCount ?? 0))
  const maxCat = Math.max(1, ...topCats.map((x) => x.memoryCount ?? 0))
  const totalCost = o.cost.reduce((s, x) => s + Number(x.costUsd || 0), 0)

  return (
    <div>
      {fresh && (
        <div className="mem-banner">
          <span>{t('memory.comeceContandoAlgoSobreVoce')}</span>
          <span className="mem-actions">
            <button className="btn btn-secondary btn-sm" onClick={() => setTab('inbox')}>
              {t('memory.migrarABase')}
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => setTab('interview')}>
              {t('memory.meConhecaMelhor')}
            </button>
          </span>
        </div>
      )}

      <div className="mem-grid">
        <button className="mem-stat" onClick={() => setTab('memories')}>
          <div className="v">{c.active}</div>
          <div className="l">{t('memory.memoriasAtivasFixadas', { pinned: c.pinned })}</div>
        </button>
        <button className={`mem-stat${c.pending ? ' warn' : ''}`} onClick={() => setTab('inbox')}>
          <div className="v">{c.pending}</div>
          <div className="l">{t('memory.sugestoesParaRevisar')}{o.suggestions.oldestPendingDays ? t('memory.maisAntigaD', { oldestPendingDays: o.suggestions.oldestPendingDays }) : ''}</div>
        </button>
        <button className={`mem-stat${c.conflicts ? ' warn' : ''}`} onClick={() => setTab('inbox')}>
          <div className="v">{c.conflicts}</div>
          <div className="l">{t('memory.conflitosPendentes')}</div>
        </button>
        <button className={`mem-stat${c.needsReview ? ' warn' : ''}`} onClick={() => setTab('gaps')}>
          <div className="v">{c.needsReview}</div>
          <div className="l">{t('memory.pedemReconfirmacao')}</div>
        </button>
        <button className="mem-stat" onClick={() => setTab('gaps')}>
          <div className="v">{c.openGaps}</div>
          <div className="l">{t('memory.lacunasAbertas')}</div>
        </button>
      </div>

      <div className="mem-two">
        <div className="mem-col">
          <div className="mem-panel">
            <h3>{t('memory.adicionadasRecentemente')}</h3>
            {o.recent.length ? (
              <div className="mem-list">
                {o.recent.map((m) => (
                  <MemoryCard key={m.id} m={m} cats={categories} onOpen={open} />
                ))}
              </div>
            ) : (
              <Empty icon="🗂" title={t('memory.aindaVazio')} />
            )}
          </div>
          {o.review.length > 0 && (
            <div className="mem-panel">
              <h3>
                {t('memory.precisamDeRevisao')}
                <button className="btn btn-secondary btn-sm" onClick={() => setTab('gaps')}>
                  {t('memory.verTodas')}
                </button>
              </h3>
              {o.review.map((r) => (
                <div key={r.memory.id} className="mem-row" style={{ fontSize: 13, padding: '4px 0' }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => open(r.memory.id)}>
                    {r.memory.title}
                  </button>
                  <span className="mem-muted">{r.reason}</span>
                </div>
              ))}
            </div>
          )}
          {o.used.length > 0 && (
            <div className="mem-panel">
              <h3>{t('memory.maisUsadasPorIasAutorizadas')}</h3>
              {o.used.map((m) => (
                <div key={m.id} className="mem-row" style={{ fontSize: 13, padding: '3px 0' }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => open(m.id)}>
                    {m.title}
                  </button>
                  <span className="mem-muted">
                    {t('memory.text', { useCount: m.useCount, p1: relTime(m.lastUsedAt) })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mem-col">
          <div className="mem-panel">
            <h3>{t('memory.porCategoria')}</h3>
            {topCats.length === 0 && <p className="mem-muted">{t('memory.semMemoriasAinda')}</p>}
            {topCats.map((x) => (
              <button key={x.id} className="mem-cat" style={{ width: '100%', flexDirection: 'column', alignItems: 'stretch', gap: 3 }} onClick={() => goCategory(x.id)}>
                <span className="mem-row" style={{ justifyContent: 'space-between' }}>
                  <span>
                    {x.icon} {x.name}
                  </span>
                  <span className="mem-muted">{x.memoryCount}</span>
                </span>
                <span className="mem-bar">
                  <span style={{ width: `${((x.memoryCount ?? 0) / maxCat) * 100}%` }} />
                </span>
              </button>
            ))}
          </div>
          {o.gaps.length > 0 && (
            <div className="mem-panel">
              <h3>{t('memory.lacunasPrioritarias')}</h3>
              {o.gaps.map((g) => (
                <div key={g.id} style={{ fontSize: 13, padding: '3px 0' }}>
                  <strong>{g.topic}</strong>
                  <div className="mem-muted">{g.question}</div>
                </div>
              ))}
            </div>
          )}
          {o.growth.length > 1 && (
            <div className="mem-panel">
              <h3>{t('memory.memoriasRegistradasPorMes')}</h3>
              <div className="mem-spark" aria-label={t('memory.memoriasRegistradasPorMes')}>
                {o.growth.map((g) => (
                  <span key={g.month} title={`${g.month}: ${g.n}`} style={{ height: `${(g.n / maxGrowth) * 100}%` }} />
                ))}
              </div>
              <p className="mem-muted" style={{ marginTop: 4 }}>
                {t('memory.dataDeRegistroNaoDe')}
              </p>
            </div>
          )}
          <div className="mem-panel">
            <h3>{t('memory.memoryAgent')}</h3>
            <p className="mem-sub">
              {o.agentEnabled ? t('memory.ligado') : t('memory.desligado')} {t('memory.consolidacao')} {o.lastConsolidation ? fmtDate(o.lastConsolidation) : t('memory.nunca')} {t('memory.iaHojeChamadas', { n: o.llm.n, limit: o.llm.limit })}
              {totalCost > 0 ? t('memory.30dUs', { p0: totalCost.toFixed(2) }) : ''}
            </p>
            {c.pendingEvents > 0 && <p className="mem-sub">{c.pendingEvents} {t('memory.eventoSAguardandoProcessamento')}</p>}
            {c.failedEvents > 0 && <p className="mem-sub" style={{ color: 'var(--danger)' }}>{c.failedEvents} {t('memory.eventoSFalharam')}</p>}
            {o.jobs.slice(0, 5).map((j) => (
              <div key={j.id} className="mem-muted">
                {j.status === 'done' ? '✅' : j.status === 'failed' ? '⚠️' : '⏳'} {jobLabel(j.kind)} · {relTime(j.finishedAt ?? j.createdAt)}
                {j.error ? ` — ${j.error}` : ''}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
