import React, { useCallback, useEffect, useState } from 'react'
import type { MemoryContext, PolicyView, TraceView } from '../api'
import { useMemoryStore } from '../store/memoryStore'
import { Empty, errMsg, fmtDate, useMemoryRefresh } from './ui'
import { t as tr } from '../../../i18n'

const LAYER: Record<string, string> = {
  core: tr('memory.layer.core'),
  domain: tr('memory.layer.domain'),
  semantic: tr('memory.layer.semantic'),
  recent: tr('memory.layer.recent'),
  restricted: tr('memory.layer.restricted')
}

/** Context Inspector: o que cada funcionalidade recebeu (ou receberia) e por quê. */
export function InspectorTab(): React.ReactElement {
  const open = useMemoryStore((s) => s.open)
  const [policies, setPolicies] = useState<PolicyView[]>([])
  const [useCase, setUseCase] = useState('assistant.trip_itinerary')
  const [query, setQuery] = useState('')
  const [sim, setSim] = useState<MemoryContext | null>(null)
  const [traces, setTraces] = useState<TraceView[]>([])
  const [sel, setSel] = useState<TraceView | null>(null)
  const [err, setErr] = useState('')
  const [hideSim, setHideSim] = useState(false)

  const load = useCallback(() => {
    void window.api.memory.traces(100).then(setTraces)
  }, [])
  useEffect(() => {
    void window.api.memory.policies().then(setPolicies)
    load()
  }, [load])
  useMemoryRefresh(load)

  const consumers = policies.filter((p) => p.consume)
  const pol = policies.find((p) => p.useCase === useCase)

  async function simulate(): Promise<void> {
    setErr('')
    try {
      setSim(await window.api.memory.simulate(useCase, query))
      load()
    } catch (e) {
      setErr(errMsg(e))
    }
  }

  const shown = traces.filter((t) => !hideSim || !t.simulated)

  return (
    <div className="mem-col">
      <div className="mem-panel">
        <h3>{tr('memory.simularRecuperacaoSemChamarIa')}</h3>
        <div className="mem-toolbar">
          <select value={useCase} onChange={(e) => setUseCase(e.target.value)} aria-label={tr('memory.casoDeUso')}>
            {consumers.map((p) => (
              <option key={p.useCase} value={p.useCase}>
                {p.label}
                {p.internal ? '' : p.approved ? '' : tr('memory.aguardandoAprovacao2')}
              </option>
            ))}
          </select>
          <input type="search" placeholder={tr('memory.consultaIntencaoExRoteiroDe')} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void simulate()} />
          <button className="btn btn-primary btn-sm" onClick={simulate}>
            {tr('memory.simular')}
          </button>
        </div>
        {pol && pol.consume && (
          <p className="mem-muted" style={{ marginTop: 0 }}>
            {tr('memory.politicaCategorias', { purpose: pol.purpose })} {pol.consume.categories === '*' ? tr('memory.todas3') : pol.consume.categories.join(', ')} {tr('memory.ate2', { p0: pol.consume.maxSensitivity.toLowerCase() })}{' '}
            {tr('memory.tokensItens', { maxTokens: pol.consume.maxTokens, maxItems: pol.consume.maxItems })}{pol.consume.instructions ? tr('memory.aceitaInstrucoesPessoais') : ''}
          </p>
        )}
        {err && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{err}</p>}
        {sim && (
          <div>
            <div className="mem-meta">
              <span className={`mem-chip ${sim.allowed ? 'ok' : 'danger'}`}>{sim.allowed ? tr('memory.permitido') : tr('memory.bloqueado2', { blockedReason: sim.blockedReason })}</span>
              <span className="mem-chip">
                {tr('memory.tokens2', { tokens: sim.tokens, budget: sim.budget })}
              </span>
              <span className="mem-chip">{sim.items.length} {tr('memory.memoriaS2')}</span>
              <span className="mem-chip">{sim.durationMs} {tr('memory.ms')}</span>
              <span className="mem-chip">{tr('memory.vetorial')} {sim.vector ? tr('memory.sim') : tr('memory.naoSemProvedorDeEmbeddings')}</span>
            </div>
            {sim.allowed && sim.items.length === 0 && <p className="mem-sub">{tr('memory.nenhumaMemoriaAgregariaValorA')}</p>}
            {sim.items.length > 0 && (
              <div className="mem-scroll">
                <table className="mem-table">
                  <thead>
                    <tr>
                      <th>{tr('memory.memoria')}</th>
                      <th>{tr('memory.camada')}</th>
                      <th>{tr('memory.score')}</th>
                      <th>{tr('memory.motivo')}</th>
                      <th>{tr('memory.tokens')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sim.items.map((i) => (
                      <tr key={i.id}>
                        <td>
                          <button className="btn btn-secondary btn-sm" onClick={() => open(i.id)}>
                            {i.title}
                          </button>
                        </td>
                        <td>{LAYER[i.layer] ?? i.layer}</td>
                        <td>{i.score}</td>
                        <td>{i.reason}</td>
                        <td>{i.tokens}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {(sim.text || sim.instructions) && (
              <details style={{ marginTop: 8 }}>
                <summary className="mem-sub" style={{ cursor: 'pointer' }}>
                  {tr('memory.verOBlocoExatoQue')}
                </summary>
                <pre className="mem-pre">{[sim.instructions, sim.text].filter(Boolean).join('\n\n')}</pre>
              </details>
            )}
          </div>
        )}
      </div>

      <div className="mem-panel">
        <h3>
          {tr('memory.recuperacoesRegistradas')}
          <label className="mem-row mem-sub" style={{ cursor: 'pointer', fontWeight: 400 }}>
            <input type="checkbox" checked={hideSim} onChange={(e) => setHideSim(e.target.checked)} /> {tr('memory.esconderSimulacoes')}
          </label>
        </h3>
        <p className="mem-muted" style={{ marginTop: 0 }}>
          {tr('memory.guardamosSoIdsScoresE')}
        </p>
        {shown.length === 0 ? (
          <Empty icon="🔍" title={tr('memory.nenhumaRecuperacaoAinda')}>
            {tr('memory.nenhumaFuncionalidadeExternaEstaAutorizada')}
          </Empty>
        ) : (
          <div className="mem-scroll">
            <table className="mem-table">
              <thead>
                <tr>
                  <th>{tr('memory.quando')}</th>
                  <th>{tr('memory.funcionalidade')}</th>
                  <th>{tr('memory.resultado')}</th>
                  <th>{tr('memory.tokens')}</th>
                  <th>{tr('memory.ms')}</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((t) => (
                  <tr key={t.id} onClick={() => setSel(t)} style={{ cursor: 'pointer', background: sel?.id === t.id ? 'var(--bg-tertiary)' : undefined }}>
                    <td>{fmtDate(t.createdAt, true)}</td>
                    <td>
                      {t.policy}
                      {t.simulated ? tr('memory.simulacao') : ''}
                    </td>
                    <td>{t.blocked ? <span className="mem-chip danger">{tr('memory.bloqueado')}</span> : tr('memory.memoriaS3', { count: t.selected.length })}</td>
                    <td>
                      {t.tokens}/{t.budget}
                    </td>
                    <td>{t.durationMs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {sel && (
          <div className="mem-ev" style={{ marginTop: 10 }}>
            <strong>{sel.policy}</strong> {tr('memory.politicaVVetorial', { useCase: sel.useCase, policyVersion: sel.policyVersion })} {sel.vector ? tr('memory.sim') : tr('memory.nao')}
            {sel.purpose && <div>{tr('memory.finalidade')} {sel.purpose}</div>}
            {sel.queryPreview && <div>{tr('memory.consulta', { queryPreview: sel.queryPreview })}</div>}
            {sel.blocked && <div>{tr('memory.bloqueio')} {sel.blocked}</div>}
            {sel.selected.length > 0 && <div style={{ marginTop: 6, fontWeight: 600 }}>{tr('memory.selecionadas')}</div>}
            {sel.selected.map((s) => (
              <div key={s.id}>
                • {s.exists && !s.restricted ? <button className="btn btn-secondary btn-sm" onClick={() => open(s.id)}>{s.title}</button> : s.title} {tr('memory.scoreTokens', { p0: LAYER[s.layer] ?? s.layer, score: s.score, tokens: s.tokens })}
              </div>
            ))}
            {sel.discarded.length > 0 && <div style={{ marginTop: 6, fontWeight: 600 }}>{tr('memory.descartadas')}</div>}
            {sel.discarded.map((s) => (
              <div key={s.id} className="mem-muted">
                • {s.title} — {s.reason}
              </div>
            ))}
            {Object.keys(sel.policyFiltered).length > 0 && (
              <div className="mem-muted" style={{ marginTop: 6 }}>
                {tr('memory.barradasPelaPoliticaSoContagem')} {Object.entries(sel.policyFiltered).map(([k, v]) => `${k}: ${v}`).join(' · ')}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
