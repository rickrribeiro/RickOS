import React, { useEffect, useState } from 'react'
import { downloadText, pickFile } from '../../../api/files'
import type { LegacyStatus, MemorySettings, PolicyOverride, PolicyView } from '../api'
import { useMemoryStore } from '../store/memoryStore'
import { JobBanner, errMsg, fmtDate, useJob } from './ui'
import { t } from '../../../i18n'

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
  if (!s) return <p className="mem-muted">{t('memory.carregando')}</p>
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
      setMsg(t('memory.criadaSNoInboxIgnorada', { created: r.created, suggested: r.suggested, skipped: r.skipped }))
    } catch (e) {
      setMsg(`⚠️ ${errMsg(e)}`)
    }
  }

  return (
    <div className="mem-two">
      <div className="mem-col">
        {msg && <div className="mem-job">{msg}</div>}
        <div className="mem-panel">
          <h3>{t('memory.memoryAgentEJobs')}</h3>
          <label className="mem-switch">
            <input type="checkbox" checked={bool('memory_agent_enabled')} onChange={(e) => save({ memory_agent_enabled: e.target.checked })} />
            <span>
              {t('memory.processarEventosDeFontesAutorizadas')}
              <small>{t('memory.desligadoPorPadraoHojeNenhuma')}</small>
            </span>
          </label>
          <div className="mem-form">
            <label>
              {t('memory.frequenciaDoAgenteMin')}
              <input type="number" min={15} max={1440} defaultValue={v.memory_agent_interval_min} onBlur={(e) => save({ memory_agent_interval_min: e.target.value })} />
            </label>
            <label>
              {t('memory.eventosPorLote')}
              <input type="number" min={1} max={50} defaultValue={v.memory_batch_size} onBlur={(e) => save({ memory_batch_size: e.target.value })} />
            </label>
          </div>
          <label className="mem-switch">
            <input type="checkbox" checked={bool('memory_consolidation_enabled')} onChange={(e) => save({ memory_consolidation_enabled: e.target.checked })} />
            <span>
              {t('memory.consolidacaoPeriodica')}
              <small>{t('memory.agrupaMemoriasParecidasEPropoe')}</small>
            </span>
          </label>
          <div className="mem-form">
            <label>
              {t('memory.aCadaDias')}
              <input type="number" min={1} max={90} defaultValue={v.memory_consolidation_days} onBlur={(e) => save({ memory_consolidation_days: e.target.value })} />
            </label>
            <label>
              {t('memory.rodarAgora')}
              <button className="btn btn-secondary btn-sm" onClick={async () => track(await window.api.memory.consolidateNow())}>
                {t('memory.consolidarAgora')}
              </button>
            </label>
          </div>
          <JobBanner job={job} onClose={clear} />
          <label className="mem-switch">
            <input type="checkbox" checked={bool('memory_notifications')} onChange={(e) => save({ memory_notifications: e.target.checked })} />
            <span>
              {t('memory.notificacoesAgrupadas')}
              <small>{t('memory.umaPorExecucaoNovasSugestoes')}</small>
            </span>
          </label>
        </div>

        <div className="mem-panel">
          <h3>{t('memory.custosELimites')}</h3>
          <div className="mem-form">
            <label>
              {t('memory.chamadasDeIaPorDia')}
              <input type="number" min={0} max={500} defaultValue={v.memory_max_llm_calls_day} onBlur={(e) => save({ memory_max_llm_calls_day: e.target.value })} />
            </label>
            <label>
              {t('memory.modeloTextoMigracaoAnalise')}
              <input placeholder={t('memory.sonnet')} defaultValue={v.memory_ai_model} onBlur={(e) => save({ memory_ai_model: e.target.value })} />
            </label>
            <label>
              {t('memory.modeloRapidoAgenteLacunasEntrevista')}
              <input placeholder={t('memory.haiku')} defaultValue={v.memory_ai_model_fast} onBlur={(e) => save({ memory_ai_model_fast: e.target.value })} />
            </label>
          </div>
        </div>

        <div className="mem-panel">
          <h3>{t('memory.privacidadeERetencao')}</h3>
          <label className="mem-switch">
            <input type="checkbox" checked={bool('memory_consumers_enabled')} onChange={(e) => save({ memory_consumers_enabled: e.target.checked })} />
            <span>
              {t('memory.permitirQueFuncionalidadesAutorizadasRecebam')}
              <small>{t('memory.desligarBloqueiaTodoConsumoDe')}</small>
            </span>
          </label>
          <div className="mem-form">
            <label>
              {t('memory.tracesDoInspectorDias')}
              <input type="number" min={1} max={365} defaultValue={v.memory_trace_retention_days} onBlur={(e) => save({ memory_trace_retention_days: e.target.value })} />
            </label>
            <label>
              {t('memory.conteudoDeEventosProcessadosDias')}
              <input type="number" min={1} max={365} defaultValue={v.memory_event_retention_days} onBlur={(e) => save({ memory_event_retention_days: e.target.value })} />
            </label>
          </div>
          <div className="mem-section">
            <h4>{t('memory.categoriasQueAIaPode')}</h4>
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
          <h3>{t('memory.consumersEProducers')}</h3>
          <p className="mem-muted" style={{ marginTop: 0 }}>
            {t('memory.aPoliticaViveNoCodigo')} <strong>{t('memory.restringir')}</strong>{t('memory.desligarReduzirOrcamentoOuSensibilidade')}
          </p>
          <div className="mem-scroll">
            <table className="mem-table">
              <thead>
                <tr>
                  <th>{t('memory.casoDeUso')}</th>
                  <th>{t('memory.consome')}</th>
                  <th>{t('memory.produz')}</th>
                  <th>{t('memory.tokens')}</th>
                  <th>{t('memory.ativo')}</th>
                </tr>
              </thead>
              <tbody>
                {policies.map((p) => {
                  const o = s.overrides[p.useCase] ?? {}
                  return (
                    <tr key={p.useCase}>
                      <td>
                        <strong>{p.label}</strong>
                        <div className="mem-muted">{p.internal ? t('memory.interno') : p.approved ? p.module : t('memory.aguardandoAprovacao', { module: p.module })}</div>
                      </td>
                      <td>{p.consume ? t('memory.ate', { p0: p.consume.maxSensitivity.toLowerCase() }) : '—'}</td>
                      <td>{p.produce ? (o.produceDisabled ? t('memory.desligado2') : t('memory.sim')) : '—'}</td>
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
                            aria-label={t('memory.orcamentoDe', { label: p.label })}
                          />
                          )
                        })() : (
                          '—'
                        )}
                      </td>
                      <td>
                        {p.approved || p.internal ? (
                          <input type="checkbox" checked={!o.disabled} onChange={(e) => setOverride(p.useCase, { disabled: e.target.checked ? undefined : true })} aria-label={t('memory.ativar', { label: p.label })} />
                        ) : (
                          <span className="mem-chip warn">{t('memory.bloqueado')}</span>
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
          <h3>{t('memory.exportarEImportar')}</h3>
          <label className="mem-switch">
            <input type="checkbox" checked={includeRestricted} onChange={(e) => setIncludeRestricted(e.target.checked)} />
            <span>
              {t('memory.incluirMemoriasRestritasNaExportacao')}
              <small>{t('memory.oArquivoFicaNoSeu')}</small>
            </span>
          </label>
          <div className="mem-actions">
            <button className="btn btn-secondary btn-sm" onClick={() => exportAs('json')}>
              {t('memory.jsonCompleto')}
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => exportAs('md')}>
              {t('memory.markdown')}
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => importFile('review')} title={t('memory.cadaMemoriaViraSugestaoNo')}>
              {t('memory.importarJsonRevisar')}
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => window.confirm(t('memory.criarAsMemoriasDiretoSem')) && importFile('direct')}>
              {t('memory.importarJsonDireto')}
            </button>
          </div>
        </div>

        <div className="mem-panel">
          <h3>{t('memory.baseDeConhecimentoAntiga')}</h3>
          {legacy?.hasLegacy ? (
            <>
              <p className="mem-sub">
                {t('memory.caracteresItensDeListaO', { chars: legacy.chars, bullets: legacy.bullets })}
              </p>
              <p className="mem-muted">
                {t('memory.migracaoSugestaoOesPendentesAprovadas', { pending: legacy.pending, approved: legacy.approved })}
                {legacy.imports.length ? t('memory.ultimaExecucao', { p0: fmtDate(legacy.imports[0].createdAt, true) }) : t('memory.nuncaExecutada')}
              </p>
              <div className="mem-actions">
                <button className="btn btn-secondary btn-sm" onClick={async () => setMsg(JSON.stringify((await window.api.memory.migrate({ ai: false, force: true })).result))}>
                  {t('memory.reprocessarPorLinha')}
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={async () => {
                    const r = await window.api.memory.migrate({ ai: true, force: true })
                    if (r.jobId) track(r.jobId)
                  }}
                >
                  {t('memory.reprocessarComIa')}
                </button>
              </div>
              <p className="mem-muted">{t('memory.reprocessarNaoDuplicaOQue')}</p>
            </>
          ) : (
            <p className="mem-sub">{t('memory.vazia')}</p>
          )}
        </div>
      </div>
    </div>
  )
}
