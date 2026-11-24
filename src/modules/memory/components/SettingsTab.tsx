import React, { useEffect, useState } from 'react'
import { downloadText, pickFile } from '../../../api/files'
import type { LegacyStatus, MemorySettings, PolicyOverride, PolicyView } from '../api'
import { useMemoryStore } from '../store/memoryStore'
import { JobBanner, errMsg, fmtDate, useJob } from './ui'

/** Configurações com efeito real no servidor. Nada aqui amplia a política de acesso do código. */
export function SettingsTab(): React.ReactElement {
  const categories = useMemoryStore((s) => s.categories)
  const [s, setS] = useState<MemorySettings | null>(null)
  const [policies, setPolicies] = useState<PolicyView[]>([])
  const [legacy, setLegacy] = useState<LegacyStatus | null>(null)
  const [msg, setMsg] = useState('')
  const [includeRestricted, setIncludeRestricted] = useState(false)
  const { job, track, clear } = useJob()

  const load = (): void => {
    void window.api.memory.settings().then(setS)
    void window.api.memory.policies().then(setPolicies)
    void window.api.memory.legacyStatus().then(setLegacy)
  }
  useEffect(load, [])

  async function save(patch: Record<string, unknown>, ok = 'Salvo.'): Promise<void> {
    setMsg('')
    try {
      await window.api.memory.saveSettings(patch)
      setMsg(`✅ ${ok}`)
      load()
    } catch (e) {
      setMsg(`⚠️ ${errMsg(e)}`)
    }
  }
  if (!s) return <p className="mem-muted">Carregando…</p>
  const v = s.values
  const bool = (k: string): boolean => v[k] === '1'
  const setOverride = (uc: string, patch: Partial<PolicyOverride>): void => {
    const cur = { ...(s.overrides[uc] ?? {}), ...patch }
    for (const k of Object.keys(cur) as (keyof PolicyOverride)[]) if (cur[k] === undefined || cur[k] === false || (cur[k] as unknown) === '') delete cur[k]
    void save({ overrides: { ...s.overrides, [uc]: cur } })
  }
  let extraction: string[] | null = null
  try {
    extraction = v.memory_extraction_categories ? JSON.parse(v.memory_extraction_categories) : null
  } catch {
    extraction = null
  }

  async function exportAs(kind: 'json' | 'md'): Promise<void> {
    const date = new Date().toISOString().slice(0, 10)
    if (kind === 'json') {
      const b = await window.api.memory.exportJson({ includeArchived: true, includeRestricted })
      downloadText({ name: `memoria-pessoal-${date}.json`, mime: 'application/json', content: JSON.stringify(b, null, 2) })
    } else {
      downloadText({ name: `memoria-pessoal-${date}.md`, mime: 'text/markdown', content: await window.api.memory.exportMarkdown({ includeRestricted }) })
    }
  }
  async function importFile(mode: 'direct' | 'review'): Promise<void> {
    const f = await pickFile('.json,application/json')
    if (!f) return
    try {
      const r = await window.api.memory.importJson(await f.text(), mode)
      setMsg(`✅ ${r.created} criada(s), ${r.suggested} no Inbox, ${r.skipped} ignorada(s).`)
    } catch (e) {
      setMsg(`⚠️ ${errMsg(e)}`)
    }
  }

  return (
    <div className="mem-two">
      <div className="mem-col">
        {msg && <div className="mem-job">{msg}</div>}
        <div className="mem-panel">
          <h3>🤖 Memory Agent e jobs</h3>
          <label className="mem-switch">
            <input type="checkbox" checked={bool('memory_agent_enabled')} onChange={(e) => save({ memory_agent_enabled: e.target.checked })} />
            <span>
              Processar eventos de fontes autorizadas
              <small>Desligado por padrão. Hoje nenhuma funcionalidade externa está autorizada a enviar eventos.</small>
            </span>
          </label>
          <div className="mem-form">
            <label>
              Frequência do agente (min)
              <input type="number" min={15} max={1440} defaultValue={v.memory_agent_interval_min} onBlur={(e) => save({ memory_agent_interval_min: e.target.value })} />
            </label>
            <label>
              Eventos por lote
              <input type="number" min={1} max={50} defaultValue={v.memory_batch_size} onBlur={(e) => save({ memory_batch_size: e.target.value })} />
            </label>
          </div>
          <label className="mem-switch">
            <input type="checkbox" checked={bool('memory_consolidation_enabled')} onChange={(e) => save({ memory_consolidation_enabled: e.target.checked })} />
            <span>
              Consolidação periódica
              <small>Agrupa memórias parecidas e propõe aprendizados/conflitos. Sem nada parecido, não chama a IA.</small>
            </span>
          </label>
          <div className="mem-form">
            <label>
              A cada (dias)
              <input type="number" min={1} max={90} defaultValue={v.memory_consolidation_days} onBlur={(e) => save({ memory_consolidation_days: e.target.value })} />
            </label>
            <label>
              Rodar agora
              <button className="btn btn-secondary btn-sm" onClick={async () => track(await window.api.memory.consolidateNow())}>
                Consolidar agora
              </button>
            </label>
          </div>
          <JobBanner job={job} onClose={clear} />
          <label className="mem-switch">
            <input type="checkbox" checked={bool('memory_notifications')} onChange={(e) => save({ memory_notifications: e.target.checked })} />
            <span>
              Notificações agrupadas
              <small>Uma por execução (novas sugestões, resultado da consolidação). Nunca uma por memória.</small>
            </span>
          </label>
        </div>

        <div className="mem-panel">
          <h3>💸 Custos e limites</h3>
          <div className="mem-form">
            <label>
              Chamadas de IA por dia
              <input type="number" min={0} max={500} defaultValue={v.memory_max_llm_calls_day} onBlur={(e) => save({ memory_max_llm_calls_day: e.target.value })} />
            </label>
            <label>
              Modelo (texto, migração, análise)
              <input placeholder="sonnet" defaultValue={v.memory_ai_model} onBlur={(e) => save({ memory_ai_model: e.target.value })} />
            </label>
            <label>
              Modelo rápido (agente, lacunas, entrevista)
              <input placeholder="haiku" defaultValue={v.memory_ai_model_fast} onBlur={(e) => save({ memory_ai_model_fast: e.target.value })} />
            </label>
          </div>
        </div>

        <div className="mem-panel">
          <h3>🔐 Privacidade e retenção</h3>
          <label className="mem-switch">
            <input type="checkbox" checked={bool('memory_consumers_enabled')} onChange={(e) => save({ memory_consumers_enabled: e.target.checked })} />
            <span>
              Permitir que funcionalidades autorizadas recebam memórias
              <small>Desligar bloqueia todo consumo de uma vez (inclusive as internas que leem memórias para comparar).</small>
            </span>
          </label>
          <div className="mem-form">
            <label>
              Traces do Inspector (dias)
              <input type="number" min={1} max={365} defaultValue={v.memory_trace_retention_days} onBlur={(e) => save({ memory_trace_retention_days: e.target.value })} />
            </label>
            <label>
              Conteúdo de eventos processados (dias)
              <input type="number" min={1} max={365} defaultValue={v.memory_event_retention_days} onBlur={(e) => save({ memory_event_retention_days: e.target.value })} />
            </label>
          </div>
          <div className="mem-section">
            <h4>Categorias que a IA pode sugerir</h4>
            <div className="mem-seg">
              {categories
                .filter((c) => !c.archivedAt)
                .map((c) => {
                  const on = !extraction || extraction.includes(c.slug)
                  return (
                    <button
                      key={c.id}
                      className={on ? 'active' : ''}
                      onClick={() => {
                        const all = categories.filter((x) => !x.archivedAt).map((x) => x.slug)
                        const cur = extraction ?? all
                        const next = on ? cur.filter((x) => x !== c.slug) : [...cur, c.slug]
                        void save({ memory_extraction_categories: next.length === all.length ? null : next })
                      }}
                    >
                      {c.icon} {c.name}
                    </button>
                  )
                })}
            </div>
          </div>
        </div>
      </div>

      <div className="mem-col">
        <div className="mem-panel">
          <h3>🧭 Consumers e producers</h3>
          <p className="mem-muted" style={{ marginTop: 0 }}>
            A política vive no código e é deny-by-default. Aqui você só pode <strong>restringir</strong>: desligar, reduzir orçamento ou sensibilidade. Integrações com
            outros módulos aparecem como “aguardando aprovação” e não recebem nada.
          </p>
          <div className="mem-scroll">
            <table className="mem-table">
              <thead>
                <tr>
                  <th>Caso de uso</th>
                  <th>Consome</th>
                  <th>Produz</th>
                  <th>Tokens</th>
                  <th>Ativo</th>
                </tr>
              </thead>
              <tbody>
                {policies.map((p) => {
                  const o = s.overrides[p.useCase] ?? {}
                  return (
                    <tr key={p.useCase}>
                      <td>
                        <strong>{p.label}</strong>
                        <div className="mem-muted">{p.internal ? 'interno' : p.approved ? p.module : `${p.module} · aguardando aprovação`}</div>
                      </td>
                      <td>{p.consume ? `até ${p.consume.maxSensitivity.toLowerCase()}` : '—'}</td>
                      <td>{p.produce ? (o.produceDisabled ? 'desligado' : 'sim') : '—'}</td>
                      <td>
                        {p.consume ? (() => {
                          const ceiling = p.consume.maxTokens
                          return (
                          <input
                            type="number"
                            min={0}
                            max={p.consume.maxTokens}
                            style={{ width: 80 }}
                            defaultValue={o.maxTokens ?? p.consume.maxTokens}
                            onBlur={(e) => setOverride(p.useCase, { maxTokens: Number(e.target.value) < ceiling ? Number(e.target.value) : undefined })}
                            aria-label={`Orçamento de ${p.label}`}
                          />
                          )
                        })() : (
                          '—'
                        )}
                      </td>
                      <td>
                        {p.approved || p.internal ? (
                          <input type="checkbox" checked={!o.disabled} onChange={(e) => setOverride(p.useCase, { disabled: e.target.checked ? undefined : true })} aria-label={`Ativar ${p.label}`} />
                        ) : (
                          <span className="mem-chip warn">bloqueado</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mem-panel">
          <h3>📦 Exportar e importar</h3>
          <label className="mem-switch">
            <input type="checkbox" checked={includeRestricted} onChange={(e) => setIncludeRestricted(e.target.checked)} />
            <span>
              Incluir memórias restritas na exportação
              <small>O arquivo fica no seu dispositivo; guarde com cuidado.</small>
            </span>
          </label>
          <div className="mem-actions">
            <button className="btn btn-secondary btn-sm" onClick={() => exportAs('json')}>
              ⬇ JSON (completo)
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => exportAs('md')}>
              ⬇ Markdown
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => importFile('review')} title="Cada memória vira sugestão no Inbox">
              ⬆ Importar JSON (revisar)
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => window.confirm('Criar as memórias direto, sem revisão? Use só com arquivos exportados por você.') && importFile('direct')}>
              ⬆ Importar JSON (direto)
            </button>
          </div>
        </div>

        <div className="mem-panel">
          <h3>📚 Base de Conhecimento antiga</h3>
          {legacy?.hasLegacy ? (
            <>
              <p className="mem-sub">
                {legacy.chars} caracteres · {legacy.bullets} itens de lista. O documento continua intacto (página “Base (legado)”) e as funcionalidades antigas seguem lendo
                dele até a migração delas ser aprovada.
              </p>
              <p className="mem-muted">
                Migração: {legacy.pending} sugestão(ões) pendentes · {legacy.approved} aprovadas
                {legacy.imports.length ? ` · última execução ${fmtDate(legacy.imports[0].createdAt, true)}` : ' · nunca executada'}
              </p>
              <div className="mem-actions">
                <button className="btn btn-secondary btn-sm" onClick={async () => setMsg(JSON.stringify((await window.api.memory.migrate({ ai: false, force: true })).result))}>
                  Reprocessar por linha
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={async () => {
                    const r = await window.api.memory.migrate({ ai: true, force: true })
                    if (r.jobId) track(r.jobId)
                  }}
                >
                  Reprocessar com IA
                </button>
              </div>
              <p className="mem-muted">Reprocessar não duplica: o que já virou memória ou foi rejeitado é ignorado.</p>
            </>
          ) : (
            <p className="mem-sub">Vazia.</p>
          )}
        </div>
      </div>
    </div>
  )
}
