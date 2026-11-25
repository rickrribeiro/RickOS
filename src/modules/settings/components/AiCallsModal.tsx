import React, { useEffect, useMemo, useState } from 'react'
import { CATALOGO_IA, type ChamadaIa, type ConfigIa, type IdChamadaIa, type ModuloIa, type MotorIa } from '../../../../shared/prompts/catalogo'
import { t as tr, type MessageKey } from '../../../i18n'
import { CONV_EFFORTS } from '../../../../shared/aiConversations'

const MOTORES: Record<MotorIa, string> = { 'claude-code': 'Claude Code', codex: 'Codex', gemini: 'Gemini' }

const nomeChamada = (id: IdChamadaIa): string => tr(`settings.iaChamada.${id}` as MessageKey)
const nomeModulo = (m: ModuloIa): string => tr(`settings.iaModulo.${m}` as MessageKey)

/** Valor efetivo de um modelo/effort: salvo nas Configurações → padrão → padrão do CLI. */
function efetivo(cfg: ConfigIa | null, saved: Record<string, string>): { valor: string; origem: string } {
  if (!cfg) return { valor: tr('settings.padraoDoCli'), origem: '' }
  const v = cfg.setting ? (saved[cfg.setting] ?? '').trim() : ''
  const raw = v || cfg.padrao
  const valor = CONV_EFFORTS.find((e) => e.v === raw)?.label ?? (raw || tr('settings.padraoDoCli'))
  return { valor, origem: cfg.setting ? tr('settings.configuracaoKey', { key: cfg.setting }) : tr('settings.fixoNoCodigo') }
}

function montar(c: ChamadaIa): string {
  try {
    return c.prompt()
  } catch (e) {
    return tr('settings.erroAoMontarPrompt', { msg: e instanceof Error ? e.message : String(e) })
  }
}

const badge: React.CSSProperties = {
  display: 'inline-block',
  fontSize: 11,
  padding: '2px 8px',
  borderRadius: 999,
  border: '1px solid var(--border)',
  background: 'var(--bg-tertiary, var(--bg-secondary))',
  color: 'var(--text-secondary)',
  whiteSpace: 'nowrap'
}

/** Catálogo de todas as chamadas de IA do app (shared/prompts/catalogo.ts). */
export function AiCallsModal({ onClose }: { onClose: () => void }): React.ReactElement {
  const [saved, setSaved] = useState<Record<string, string>>({})
  const [query, setQuery] = useState('')
  const [modulo, setModulo] = useState<ModuloIa | ''>('')
  const [motor, setMotor] = useState<MotorIa | ''>('')
  const [open, setOpen] = useState<IdChamadaIa | null>(null)
  const [copied, setCopied] = useState<IdChamadaIa | null>(null)

  useEffect(() => {
    const keys = [...new Set(CATALOGO_IA.flatMap((c) => [c.modelo.setting, c.effort?.setting]).filter((k): k is string => !!k))]
    let alive = true
    Promise.all(keys.map((k) => window.api.settings.get(k).then((v) => [k, v ?? ''] as const, () => [k, ''] as const))).then((pairs) => {
      if (alive) setSaved(Object.fromEntries(pairs))
    })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const modulos = useMemo(() => [...new Set(CATALOGO_IA.map((c) => c.modulo))], [])
  const motores = useMemo(() => [...new Set(CATALOGO_IA.map((c) => c.motor))], [])

  const lista = useMemo(() => {
    const q = query.trim().toLowerCase()
    return CATALOGO_IA.filter((c) => {
      if (modulo && c.modulo !== modulo) return false
      if (motor && c.motor !== motor) return false
      if (!q) return true
      const hay = [nomeChamada(c.id), nomeModulo(c.modulo), c.id, c.arquivo ?? '', c.usadoEm, efetivo(c.modelo, saved).valor, MOTORES[c.motor]].join(' ').toLowerCase()
      return hay.includes(q)
    })
  }, [query, modulo, motor, saved])

  const grupos = useMemo(() => {
    const m = new Map<ModuloIa, ChamadaIa[]>()
    for (const c of lista) m.set(c.modulo, [...(m.get(c.modulo) ?? []), c])
    return [...m.entries()]
  }, [lista])

  async function copiar(c: ChamadaIa): Promise<void> {
    try {
      await navigator.clipboard.writeText(montar(c))
      setCopied(c.id)
      setTimeout(() => setCopied((x) => (x === c.id ? null : x)), 1500)
    } catch {
      // sem clipboard: o texto continua selecionável no <pre>
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(980px, calc(100vw - 24px))', maxWidth: 'none', maxHeight: 'calc(100dvh - 24px)', overflowY: 'auto' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <h2 style={{ margin: 0 }}>{tr('settings.ondeAIaEUsada')}</h2>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>{tr('settings.fechar')}</button>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '6px 0 12px' }}>
          {tr('settings.ondeAIaEUsadaDesc', { count: CATALOGO_IA.length })}
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          <input
            placeholder={tr('settings.buscarChamadaDeIa')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ flex: '2 1 220px', minWidth: 0 }}
          />
          <select value={modulo} onChange={(e) => setModulo(e.target.value as ModuloIa | '')} style={{ flex: '1 1 140px', minWidth: 0 }}>
            <option value="">{tr('settings.todosOsModulos')}</option>
            {modulos.map((m) => (
              <option key={m} value={m}>{nomeModulo(m)}</option>
            ))}
          </select>
          <select value={motor} onChange={(e) => setMotor(e.target.value as MotorIa | '')} style={{ flex: '1 1 140px', minWidth: 0 }}>
            <option value="">{tr('settings.todosOsMotores')}</option>
            {motores.map((m) => (
              <option key={m} value={m}>{MOTORES[m]}</option>
            ))}
          </select>
        </div>

        {grupos.length === 0 && <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>{tr('settings.nenhumaChamadaEncontrada')}</p>}

        {grupos.map(([mod, chamadas]) => (
          <div key={mod} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--text-muted)', margin: '0 0 6px' }}>
              {nomeModulo(mod)} · {chamadas.length}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {chamadas.map((c) => {
                const modelo = efetivo(c.modelo, saved)
                const effort = efetivo(c.effort, saved)
                const aberto = open === c.id
                return (
                  <div key={c.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', background: 'var(--bg-secondary)' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
                      <div style={{ flex: '1 1 200px', minWidth: 0, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{nomeChamada(c.id)}</div>
                      <span style={badge} title={tr('settings.motor')}>{MOTORES[c.motor]}</span>
                      <span style={badge} title={`${tr('settings.modelo')} · ${modelo.origem}`}>{tr('settings.modelo')}: {modelo.valor}</span>
                      <span style={badge} title={`${tr('settings.effort')}${effort.origem ? ` · ${effort.origem}` : ''}`}>{tr('settings.effort')}: {effort.valor}</span>
                      <button className="btn btn-secondary btn-sm" onClick={() => setOpen(aberto ? null : c.id)}>
                        {aberto ? tr('settings.ocultarPrompt') : tr('settings.verPrompt')}
                      </button>
                    </div>
                    {aberto && (
                      <div style={{ marginTop: 8 }}>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'grid', gap: 2, marginBottom: 6, overflowWrap: 'anywhere' }}>
                          <div>
                            {tr('settings.arquivoDoPrompt')}: <code>{c.arquivo ? `shared/prompts/${c.arquivo}` : tr('settings.textoDoUsuario')}</code>
                          </div>
                          <div>
                            {tr('settings.usadoEm')}: <code>{c.usadoEm}</code>
                          </div>
                          <div>
                            {tr('settings.modelo')}: {modelo.origem}
                            {c.effort ? ` · ${tr('settings.effort')}: ${effort.origem}` : ''}
                          </div>
                        </div>
                        <div style={{ position: 'relative' }}>
                          <button className="btn btn-secondary btn-sm" style={{ position: 'absolute', top: 6, right: 6 }} onClick={() => void copiar(c)}>
                            {copied === c.id ? tr('settings.copiado') : tr('settings.copiarPrompt')}
                          </button>
                          <pre
                            style={{
                              margin: 0,
                              padding: '10px 12px',
                              paddingTop: 36,
                              maxHeight: 420,
                              overflow: 'auto',
                              whiteSpace: 'pre-wrap',
                              overflowWrap: 'anywhere',
                              fontSize: 12,
                              lineHeight: 1.45,
                              borderRadius: 6,
                              border: '1px solid var(--border)',
                              background: 'var(--bg-primary)',
                              color: 'var(--text-primary)'
                            }}
                          >
                            {montar(c)}
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
