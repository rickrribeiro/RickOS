import React, { useEffect, useState } from 'react'
import { Rule, ScheduledJob } from '../../../types'
import { t, getLocale } from '../../../i18n'

interface ParamField {
  key: string
  label: string
  min?: number
  max?: number
}
interface RuleDef {
  type: string
  label: string
  describe: (p: Record<string, number>) => string
  defaults: Record<string, number>
  fields: ParamField[]
}

const RULE_DEFS: RuleDef[] = [
  {
    type: 'idle_productive',
    label: t('automations.semFocoProdutivo'),
    describe: (p) => t('automations.seFicarMinSemTarefa', { p0: p.minutes ?? 45, p1: p.startHour ?? 9, p2: p.endHour ?? 18 }),
    defaults: { minutes: 45, startHour: 9, endHour: 18 },
    fields: [
      { key: 'minutes', label: t('automations.minutos'), min: 5 },
      { key: 'startHour', label: t('automations.inicioH'), min: 0, max: 23 },
      { key: 'endHour', label: t('automations.fimH'), min: 1, max: 24 }
    ]
  },
  {
    type: 'budget_threshold',
    label: t('automations.estouroDeOrcamento'),
    describe: (p) => t('automations.seOGastoDeUma', { p0: p.percent ?? 80 }),
    defaults: { percent: 80 },
    fields: [{ key: 'percent', label: t('automations.doOrcamento'), min: 1, max: 100 }]
  },
  {
    type: 'stale_branches',
    label: t('automations.trabalhoEsquecidoEmBranches'),
    describe: (p) =>
      t('automations.seAlgumaBranchWorktreeTiver', { p0: p.days ?? 3 }),
    defaults: { days: 3 },
    fields: [{ key: 'days', label: t('automations.diasParada'), min: 1 }]
  },
  {
    type: 'due_flashcards',
    label: t('automations.flashcardsAcumulando'),
    describe: (p) => t('automations.seHouverMaisDeFlashcards', { p0: p.count ?? 30 }),
    defaults: { count: 30 },
    fields: [{ key: 'count', label: t('automations.qtdVencidos'), min: 1 }]
  }
]

function parseParams(json: string): Record<string, number> {
  try {
    const v = JSON.parse(json)
    return typeof v === 'object' && v ? v : {}
  } catch {
    return {}
  }
}

export function AutomationsPage(): React.ReactElement {
  const [rules, setRules] = useState<Rule[]>([])
  const [drafts, setDrafts] = useState<Record<number, Record<string, number>>>({})
  const [jobs, setJobs] = useState<ScheduledJob[]>([])
  const [jobName, setJobName] = useState('')
  const [jobPrompt, setJobPrompt] = useState('')
  const [jobHour, setJobHour] = useState(7)

  async function refresh(): Promise<void> {
    const r = await window.api.rules.getAll()
    setRules(r)
    setDrafts(Object.fromEntries(r.map((x) => [x.id, parseParams(x.params)])))
    setJobs(await window.api.jobs.getAll())
  }
  useEffect(() => {
    refresh()
  }, [])

  async function addJob(): Promise<void> {
    if (!jobName.trim() || !jobPrompt.trim()) return
    await window.api.jobs.create(jobName.trim(), jobPrompt.trim(), jobHour)
    setJobName('')
    setJobPrompt('')
    setJobHour(7)
    refresh()
  }

  async function activate(def: RuleDef): Promise<void> {
    await window.api.rules.create(def.type, JSON.stringify(def.defaults))
    refresh()
  }
  async function save(rule: Rule): Promise<void> {
    await window.api.rules.update(rule.id, rule.enabled, JSON.stringify(drafts[rule.id] ?? {}))
    refresh()
  }
  async function toggle(rule: Rule): Promise<void> {
    await window.api.rules.update(rule.id, rule.enabled ? 0 : 1, rule.params)
    refresh()
  }

  return (
    <div className="module-page">
      <div className="module-header">
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>{t('automations.automacoes')}</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {t('automations.regrasCondicaoAcaoAvaliadasDe')}
          </p>
        </div>
      </div>

      <h3 className="dash-heading">{t('automations.regras')}</h3>
      <div className="list-stack">
        {RULE_DEFS.map((def) => {
          const rule = rules.find((r) => r.type === def.type)
          const p = rule ? drafts[rule.id] ?? {} : def.defaults
          return (
            <div key={def.type} className="chart-section" style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {rule && (
                  <input type="checkbox" checked={rule.enabled === 1} onChange={() => toggle(rule)} title={t('automations.ativarDesativar')} />
                )}
                <strong style={{ flex: 1 }}>{def.label}</strong>
                {rule ? (
                  <>
                    <button className="btn btn-primary btn-sm" onClick={() => save(rule)}>{t('automations.salvar')}</button>
                    <button className="btn btn-danger btn-sm" onClick={() => window.api.rules.delete(rule.id).then(refresh)}>✕</button>
                  </>
                ) : (
                  <button className="btn btn-secondary btn-sm" onClick={() => activate(def)}>{t('automations.ativar')}</button>
                )}
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '6px 0' }}>{def.describe(p)}</p>
              {rule && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {def.fields.map((f) => (
                    <div key={f.key} className="editor-field" style={{ maxWidth: 120 }}>
                      <label>{f.label}</label>
                      <input
                        type="number"
                        min={f.min}
                        max={f.max}
                        value={p[f.key] ?? def.defaults[f.key]}
                        onChange={(e) =>
                          setDrafts((d) => ({ ...d, [rule.id]: { ...d[rule.id], [f.key]: Number(e.target.value) } }))
                        }
                      />
                    </div>
                  ))}
                  {rule.lastFiredAt && (
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', alignSelf: 'flex-end' }}>
                      {t('automations.ultimoDisparo')} {new Date(rule.lastFiredAt).toLocaleString(getLocale(), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <h3 className="dash-heading">{t('automations.agendadorInbox')}</h3>
      <div className="chart-section" style={{ marginBottom: 8 }}>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 8px' }}>
          {t('automations.todoDiaNoHorarioDefinido')}
        </p>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <input placeholder={t('automations.nomeExRevisaoMatinal')} value={jobName} onChange={(e) => setJobName(e.target.value)} style={{ minWidth: 160 }} />
          <input placeholder={t('automations.promptExReviseMeusTodos')} value={jobPrompt} onChange={(e) => setJobPrompt(e.target.value)} style={{ flex: 1, minWidth: 220 }} />
          <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('automations.as')}</label>
          <input type="number" min={0} max={23} value={jobHour} onChange={(e) => setJobHour(Number(e.target.value) || 0)} style={{ width: 64 }} />
          <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('automations.h')}</label>
          <button className="btn btn-primary btn-sm" onClick={addJob}>{t('automations.agendar')}</button>
        </div>
      </div>
      <div className="list-stack">
        {jobs.length === 0 && <div className="empty-hint">{t('automations.nenhumAgendamento')}</div>}
        {jobs.map((j) => (
          <div key={j.id} className="list-row">
            <input type="checkbox" checked={j.enabled === 1} onChange={() => window.api.jobs.update(j.id, j.name, j.prompt, j.hour, j.enabled ? 0 : 1).then(refresh)} />
            <span className="list-row-title">
              {j.name} <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>· {String(j.hour).padStart(2, '0')}{t('automations.h')}</span>
            </span>
            {j.lastRunAt && <span className="project-chip">{t('automations.ultimo')} {j.lastRunAt}</span>}
            <button className="btn btn-danger btn-sm" onClick={() => window.api.jobs.delete(j.id).then(refresh)}>✕</button>
          </div>
        ))}
      </div>
    </div>
  )
}
