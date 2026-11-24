import React, { useCallback, useEffect, useState } from 'react'
import type { MemoryContext, PolicyView, TraceView } from '../api'
import { useMemoryStore } from '../store/memoryStore'
import { Empty, errMsg, fmtDate, useMemoryRefresh } from './ui'

const LAYER: Record<string, string> = { core: 'Core', domain: 'Domínio', semantic: 'Semântica', recent: 'Recente', restricted: 'Restrita' }

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
        <h3>🧪 Simular recuperação (sem chamar IA)</h3>
        <div className="mem-toolbar">
          <select value={useCase} onChange={(e) => setUseCase(e.target.value)} aria-label="Caso de uso">
            {consumers.map((p) => (
              <option key={p.useCase} value={p.useCase}>
                {p.label}
                {p.internal ? '' : p.approved ? '' : ' (aguardando aprovação)'}
              </option>
            ))}
          </select>
          <input type="search" placeholder="Consulta / intenção (ex.: roteiro de 5 dias em Seoul)" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void simulate()} />
          <button className="btn btn-primary btn-sm" onClick={simulate}>
            Simular
          </button>
        </div>
        {pol && pol.consume && (
          <p className="mem-muted" style={{ marginTop: 0 }}>
            Política: {pol.purpose} · categorias {pol.consume.categories === '*' ? 'todas' : pol.consume.categories.join(', ')} · até {pol.consume.maxSensitivity.toLowerCase()} ·{' '}
            {pol.consume.maxTokens} tokens / {pol.consume.maxItems} itens{pol.consume.instructions ? ' · aceita instruções pessoais' : ''}
          </p>
        )}
        {err && <p style={{ color: 'var(--danger)', fontSize: 13 }}>{err}</p>}
        {sim && (
          <div>
            <div className="mem-meta">
              <span className={`mem-chip ${sim.allowed ? 'ok' : 'danger'}`}>{sim.allowed ? 'permitido' : `bloqueado: ${sim.blockedReason}`}</span>
              <span className="mem-chip">
                {sim.tokens}/{sim.budget} tokens
              </span>
              <span className="mem-chip">{sim.items.length} memória(s)</span>
              <span className="mem-chip">{sim.durationMs} ms</span>
              <span className="mem-chip">vetorial: {sim.vector ? 'sim' : 'não (sem provedor de embeddings)'}</span>
            </div>
            {sim.allowed && sim.items.length === 0 && <p className="mem-sub">Nenhuma memória agregaria valor a esta consulta — o contexto ficaria vazio (correto).</p>}
            {sim.items.length > 0 && (
              <div className="mem-scroll">
                <table className="mem-table">
                  <thead>
                    <tr>
                      <th>Memória</th>
                      <th>Camada</th>
                      <th>Score</th>
                      <th>Motivo</th>
                      <th>Tokens</th>
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
                  Ver o bloco exato que seria enviado
                </summary>
                <pre className="mem-pre">{[sim.instructions, sim.text].filter(Boolean).join('\n\n')}</pre>
              </details>
            )}
          </div>
        )}
      </div>

      <div className="mem-panel">
        <h3>
          📜 Recuperações registradas
          <label className="mem-row mem-sub" style={{ cursor: 'pointer', fontWeight: 400 }}>
            <input type="checkbox" checked={hideSim} onChange={(e) => setHideSim(e.target.checked)} /> esconder simulações
          </label>
        </h3>
        <p className="mem-muted" style={{ marginTop: 0 }}>
          Guardamos só ids, scores e motivos — nunca o conteúdo. Consultas de funcionalidades ficam como hash; memórias restritas aparecem mascaradas.
        </p>
        {shown.length === 0 ? (
          <Empty icon="🔍" title="Nenhuma recuperação ainda">
            Nenhuma funcionalidade externa está autorizada ainda; use o simulador acima.
          </Empty>
        ) : (
          <div className="mem-scroll">
            <table className="mem-table">
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Funcionalidade</th>
                  <th>Resultado</th>
                  <th>Tokens</th>
                  <th>ms</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((t) => (
                  <tr key={t.id} onClick={() => setSel(t)} style={{ cursor: 'pointer', background: sel?.id === t.id ? 'var(--bg-tertiary)' : undefined }}>
                    <td>{fmtDate(t.createdAt, true)}</td>
                    <td>
                      {t.policy}
                      {t.simulated ? ' · simulação' : ''}
                    </td>
                    <td>{t.blocked ? <span className="mem-chip danger">bloqueado</span> : `${t.selected.length} memória(s)`}</td>
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
            <strong>{sel.policy}</strong> · {sel.useCase} · política v{sel.policyVersion} · vetorial: {sel.vector ? 'sim' : 'não'}
            {sel.purpose && <div>Finalidade: {sel.purpose}</div>}
            {sel.queryPreview && <div>Consulta: “{sel.queryPreview}”</div>}
            {sel.blocked && <div>Bloqueio: {sel.blocked}</div>}
            {sel.selected.length > 0 && <div style={{ marginTop: 6, fontWeight: 600 }}>Selecionadas</div>}
            {sel.selected.map((s) => (
              <div key={s.id}>
                • {s.exists && !s.restricted ? <button className="btn btn-secondary btn-sm" onClick={() => open(s.id)}>{s.title}</button> : s.title} — {LAYER[s.layer] ?? s.layer}, score {s.score}, {s.tokens} tokens
              </div>
            ))}
            {sel.discarded.length > 0 && <div style={{ marginTop: 6, fontWeight: 600 }}>Descartadas</div>}
            {sel.discarded.map((s) => (
              <div key={s.id} className="mem-muted">
                • {s.title} — {s.reason}
              </div>
            ))}
            {Object.keys(sel.policyFiltered).length > 0 && (
              <div className="mem-muted" style={{ marginTop: 6 }}>
                Barradas pela política (só contagem): {Object.entries(sel.policyFiltered).map(([k, v]) => `${k}: ${v}`).join(' · ')}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
