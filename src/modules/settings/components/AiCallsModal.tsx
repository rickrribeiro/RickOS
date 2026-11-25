import React, { useEffect, useMemo, useState } from 'react'
import { CATALOGO_IA, exemploMontado, type ChamadaIa, type ConfigIa, type IdChamadaIa, type ModuloIa, type MotorIa } from '../../../../shared/prompts/catalogo'
import { motoresPermitidos, padraoDoMotor, variaveisDoTemplate } from '../../../../shared/prompts/definicao'
import { EFFORTS_DO_MOTOR, MODELOS_SUGERIDOS } from '../../../../shared/prompts/motores'
import { CONV_EFFORTS } from '../../../../shared/aiConversations'
import type { AiChamadaConfig } from '../../../types'
import { t as tr, type MessageKey } from '../../../i18n'

const MOTORES: Record<MotorIa, string> = { 'claude-code': 'Claude Code', codex: 'Codex', gemini: 'Gemini' }

const nomeChamada = (id: IdChamadaIa): string => tr(`settings.iaChamada.${id}` as MessageKey)
const nomeModulo = (m: ModuloIa): string => tr(`settings.iaModulo.${m}` as MessageKey)

type PadroesCodex = { modelo: string | null; effort: string | null }

const rotuloEffort = (v: string): string => (v === 'minimal' ? tr('settings.iaEffort.minimal') : CONV_EFFORTS.find((e) => e.v === v)?.label ?? v)

interface Valor {
  /** Valor cru ('' = padrão do CLI). */
  raw: string
  valor: string
  origem: string
}

/** Padrão de um modelo/effort: salvo nas Configurações → padrão do catálogo → config do Codex → padrão do CLI. */
function padrao(cfg: ConfigIa | null, motor: MotorIa, campo: 'modelo' | 'effort', saved: Record<string, string>, codex: PadroesCodex): Valor {
  const v = cfg?.setting ? (saved[cfg.setting] ?? '').trim() : ''
  const raw = v || cfg?.padrao || ''
  if (raw) return { raw, valor: campo === 'effort' ? rotuloEffort(raw) : raw, origem: cfg?.setting ? tr('settings.configuracaoKey', { key: cfg.setting }) : tr('settings.fixoNoCodigo') }
  const doCodex = motor === 'codex' ? codex[campo] : null
  if (doCodex) return { raw: '', valor: campo === 'effort' ? rotuloEffort(doCodex) : doCodex, origem: tr('settings.iaModelo.configCodex') }
  return { raw: '', valor: tr('settings.padraoDoCli'), origem: cfg?.setting ? tr('settings.configuracaoKey', { key: cfg.setting }) : '' }
}

/** Motor, modelo e effort em uso numa chamada (escolhas do usuário por cima dos padrões). */
function execucao(c: ChamadaIa, cfg: AiChamadaConfig | undefined, saved: Record<string, string>, codex: PadroesCodex) {
  const motor = motorEfetivo(c, cfg)
  const pm = padraoDoMotor(c, motor) ?? { modelo: c.modelo, effort: c.effort }
  const modeloPadrao = padrao(pm.modelo, motor, 'modelo', saved, codex)
  const effortPadrao = padrao(pm.effort, motor, 'effort', saved, codex)
  const temEffort = EFFORTS_DO_MOTOR[motor].length > 0
  const modelo: Valor = cfg?.modelo ? { raw: cfg.modelo, valor: cfg.modelo, origem: tr('settings.iaModelo.escolhido') } : modeloPadrao
  const effort: Valor = !temEffort
    ? { raw: '', valor: '—', origem: '' }
    : cfg?.effort
      ? { raw: cfg.effort, valor: rotuloEffort(cfg.effort), origem: tr('settings.iaModelo.escolhido') }
      : effortPadrao
  return { motor, modelo, effort, modeloPadrao, effortPadrao, temEffort }
}

function montar(c: ChamadaIa, cfg: AiChamadaConfig | undefined): string {
  try {
    return exemploMontado(c, cfg ? { template: cfg.template, sistema: cfg.sistema } : null)
  } catch (e) {
    return tr('settings.erroAoMontarPrompt', { msg: e instanceof Error ? e.message : String(e) })
  }
}

const personalizado = (cfg: AiChamadaConfig | undefined): boolean => !!cfg && (cfg.template != null || cfg.sistema != null)

/** Motor em uso: o escolhido (se a chamada aceita) ou o padrão. */
function motorEfetivo(c: ChamadaIa, cfg: AiChamadaConfig | undefined): MotorIa {
  return cfg?.motor && motoresPermitidos(c).includes(cfg.motor) ? cfg.motor : c.motor
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

const pre: React.CSSProperties = {
  margin: 0,
  padding: '10px 12px',
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
}

const area: React.CSSProperties = { ...pre, width: '100%', minHeight: 220, maxHeight: 'none', resize: 'vertical', fontFamily: 'var(--font-mono, ui-monospace, monospace)', boxSizing: 'border-box' }

/** Editor do prompt de uma chamada: template com {{variáveis}}; salvar grava no banco. */
function EditorPrompt({ c, cfg, onSalvo, onCancelar }: { c: ChamadaIa; cfg: AiChamadaConfig | undefined; onSalvo: (cfg: AiChamadaConfig | null) => void; onCancelar: () => void }): React.ReactElement {
  const [sistema, setSistema] = useState(cfg?.sistema ?? c.sistema ?? '')
  const [template, setTemplate] = useState(cfg?.template ?? c.template)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const usadas = new Set([...variaveisDoTemplate(sistema), ...variaveisDoTemplate(template)])
  const faltando = c.variaveis.filter((v) => !usadas.has(v))

  async function salvar(): Promise<void> {
    setSalvando(true)
    setErro('')
    try {
      const r = await window.api.iaChamadas.salvarPrompt(c.id, template, c.sistema != null ? sistema : null)
      onSalvo(r)
    } catch (e) {
      setErro(tr('settings.iaPrompt.erro', { msg: e instanceof Error ? e.message : String(e) }))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
        {tr('settings.iaPrompt.variaveis')}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
          {c.variaveis.map((v) => (
            <code key={v} style={{ ...badge, fontFamily: 'var(--font-mono, ui-monospace, monospace)' }}>{`{{${v}}}`}</code>
          ))}
        </div>
      </div>
      {c.sistema != null && (
        <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--text-secondary)' }}>
          {tr('settings.iaPrompt.sistema')}
          <textarea value={sistema} onChange={(e) => setSistema(e.target.value)} style={area} spellCheck={false} />
        </label>
      )}
      <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--text-secondary)' }}>
        {tr('settings.iaPrompt.prompt')}
        <textarea value={template} onChange={(e) => setTemplate(e.target.value)} style={area} spellCheck={false} />
      </label>
      {faltando.length > 0 && (
        <div style={{ fontSize: 12, color: 'var(--warning, var(--accent))' }}>{tr('settings.iaPrompt.faltando', { lista: faltando.map((v) => `{{${v}}}`).join(', ') })}</div>
      )}
      {erro && <div style={{ fontSize: 12, color: 'var(--danger, #e5484d)' }}>{erro}</div>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        <button className="btn btn-primary btn-sm" disabled={salvando || !template.trim()} onClick={() => void salvar()}>{tr('settings.iaPrompt.salvar')}</button>
        <button className="btn btn-secondary btn-sm" onClick={onCancelar}>{tr('settings.iaPrompt.cancelar')}</button>
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => {
            setSistema(c.sistema ?? '')
            setTemplate(c.template)
          }}
        >
          {tr('settings.iaPrompt.usarPadrao')}
        </button>
      </div>
    </div>
  )
}

const OUTRO = '__outro__'

/** Motor, modelo e effort de uma chamada (o padrão aparece como primeira opção de cada lista). */
function ConfigExecucao({
  c,
  cfg,
  exec,
  onMotor,
  onModelo
}: {
  c: ChamadaIa
  cfg: AiChamadaConfig | undefined
  exec: ReturnType<typeof execucao>
  onMotor: (m: MotorIa) => void
  onModelo: (modelo: string | null, effort: string | null) => void
}): React.ReactElement {
  const permitidos = motoresPermitidos(c)
  const sugeridos = MODELOS_SUGERIDOS[exec.motor]
  const atual = cfg?.modelo ?? ''
  const [outro, setOutro] = useState(!!atual && !sugeridos.includes(atual))
  const [texto, setTexto] = useState(atual && !sugeridos.includes(atual) ? atual : '')
  const efforts = EFFORTS_DO_MOTOR[exec.motor]
  const linha: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)' }
  const campo: React.CSSProperties = { minWidth: 0, flex: '0 1 240px' }
  const rotulo: React.CSSProperties = { width: 64 }

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {permitidos.length > 1 ? (
        <label style={linha}>
          <span style={rotulo}>{tr('settings.motor')}</span>
          <select value={exec.motor} onChange={(e) => onMotor(e.target.value as MotorIa)} style={campo}>
            {permitidos.map((m) => (
              <option key={m} value={m}>
                {m === c.motor ? tr('settings.iaMotor.padrao', { motor: MOTORES[m] }) : MOTORES[m]}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{tr('settings.iaMotor.unico', { motor: MOTORES[c.motor] })}</div>
      )}
      <label style={linha}>
        <span style={rotulo}>{tr('settings.modelo')}</span>
        <select
          value={outro ? OUTRO : sugeridos.includes(atual) ? atual : ''}
          onChange={(e) => {
            const v = e.target.value
            if (v === OUTRO) return setOutro(true)
            setOutro(false)
            onModelo(v || null, cfg?.effort ?? null)
          }}
          style={campo}
        >
          <option value="">{tr('settings.iaModelo.padrao', { valor: exec.modeloPadrao.valor })}</option>
          {sugeridos.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
          <option value={OUTRO}>{tr('settings.iaModelo.outro')}</option>
        </select>
        {outro && (
          <>
            <input value={texto} placeholder={tr('settings.iaModelo.placeholder')} onChange={(e) => setTexto(e.target.value)} style={{ minWidth: 0, flex: '1 1 140px' }} />
            <button className="btn btn-secondary btn-sm" disabled={!texto.trim()} onClick={() => onModelo(texto.trim(), cfg?.effort ?? null)}>
              {tr('settings.iaModelo.aplicar')}
            </button>
          </>
        )}
      </label>
      {efforts.length > 0 ? (
        <label style={linha}>
          <span style={rotulo}>{tr('settings.effort')}</span>
          <select value={cfg?.effort && efforts.includes(cfg.effort) ? cfg.effort : ''} onChange={(e) => onModelo(cfg?.modelo ?? null, e.target.value || null)} style={campo}>
            <option value="">{tr('settings.iaModelo.padrao', { valor: exec.effortPadrao.valor })}</option>
            {efforts.map((v) => (
              <option key={v} value={v}>{rotuloEffort(v)}</option>
            ))}
          </select>
        </label>
      ) : (
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{tr('settings.iaModelo.semEffort')}</div>
      )}
      {c.id === 'promptRunner.conversa' && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{tr('settings.iaModelo.conversa')}</div>}
    </div>
  )
}

/** Catálogo de todas as chamadas de IA do app (shared/prompts/catalogo.ts), com edição do prompt. */
export function AiCallsModal({ onClose }: { onClose: () => void }): React.ReactElement {
  const [saved, setSaved] = useState<Record<string, string>>({})
  const [configs, setConfigs] = useState<Record<string, AiChamadaConfig>>({})
  const [query, setQuery] = useState('')
  const [modulo, setModulo] = useState<ModuloIa | ''>('')
  const [motor, setMotor] = useState<MotorIa | ''>('')
  const [open, setOpen] = useState<IdChamadaIa | null>(null)
  const [editando, setEditando] = useState<IdChamadaIa | null>(null)
  const [aviso, setAviso] = useState<{ id: IdChamadaIa; texto: string } | null>(null)
  const [copied, setCopied] = useState<IdChamadaIa | null>(null)
  const [codex, setCodex] = useState<PadroesCodex>({ modelo: null, effort: null })

  useEffect(() => {
    const keys = [
      ...new Set(
        CATALOGO_IA.flatMap((c) => motoresPermitidos(c).flatMap((m) => [padraoDoMotor(c, m)?.modelo.setting, padraoDoMotor(c, m)?.effort?.setting])).filter((k): k is string => !!k)
      )
    ]
    let alive = true
    Promise.all(keys.map((k) => window.api.settings.get(k).then((v) => [k, v ?? ''] as const, () => [k, ''] as const))).then((pairs) => {
      if (alive) setSaved(Object.fromEntries(pairs))
    })
    window.api.iaChamadas.padroesMotores().then(
      (r) => alive && setCodex(r.codex),
      () => undefined
    )
    window.api.iaChamadas.listar().then(
      (rows) => alive && setConfigs(Object.fromEntries(rows.map((r) => [r.id, r]))),
      () => undefined
    )
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !editando) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, editando])

  const modulos = useMemo(() => [...new Set(CATALOGO_IA.map((c) => c.modulo))], [])
  const motores = useMemo(() => [...new Set(CATALOGO_IA.flatMap((c) => motoresPermitidos(c)))], [])

  const lista = useMemo(() => {
    const q = query.trim().toLowerCase()
    return CATALOGO_IA.filter((c) => {
      if (modulo && c.modulo !== modulo) return false
      if (motor && motorEfetivo(c, configs[c.id]) !== motor) return false
      if (!q) return true
      const m = motorEfetivo(c, configs[c.id])
      const hay = [nomeChamada(c.id), nomeModulo(c.modulo), c.id, c.arquivo ?? '', c.usadoEm, execucao(c, configs[c.id], saved, codex).modelo.valor, MOTORES[m]].join(' ').toLowerCase()
      return hay.includes(q)
    })
  }, [query, modulo, motor, saved, configs, codex])

  const grupos = useMemo(() => {
    const m = new Map<ModuloIa, ChamadaIa[]>()
    for (const c of lista) m.set(c.modulo, [...(m.get(c.modulo) ?? []), c])
    return [...m.entries()]
  }, [lista])

  function atualizar(id: IdChamadaIa, cfg: AiChamadaConfig | null): void {
    setConfigs((cur) => {
      const next = { ...cur }
      if (cfg) next[id] = cfg
      else delete next[id]
      return next
    })
  }

  async function reverter(c: ChamadaIa): Promise<void> {
    if (!window.confirm(tr('settings.iaPrompt.confirmarReverter', { nome: nomeChamada(c.id) }))) return
    try {
      await window.api.iaChamadas.reverterPrompt(c.id)
      const cfg = configs[c.id]
      atualizar(c.id, cfg ? { ...cfg, template: null, sistema: null } : null)
      setEditando(null)
      setAviso({ id: c.id, texto: tr('settings.iaPrompt.revertido') })
    } catch (e) {
      setAviso({ id: c.id, texto: tr('settings.iaPrompt.erro', { msg: e instanceof Error ? e.message : String(e) }) })
    }
  }

  async function trocarMotor(c: ChamadaIa, m: MotorIa): Promise<void> {
    try {
      const r = await window.api.iaChamadas.salvarMotor(c.id, m === c.motor ? null : m)
      atualizar(c.id, r)
      setAviso({ id: c.id, texto: tr('settings.iaMotor.salvo', { motor: MOTORES[m] }) })
    } catch (e) {
      setAviso({ id: c.id, texto: tr('settings.iaPrompt.erro', { msg: e instanceof Error ? e.message : String(e) }) })
    }
  }

  async function salvarModelo(c: ChamadaIa, modelo: string | null, effort: string | null): Promise<void> {
    try {
      const r = await window.api.iaChamadas.salvarModelo(c.id, modelo, effort)
      atualizar(c.id, r)
      const e = execucao(c, r ?? undefined, saved, codex)
      setAviso({ id: c.id, texto: tr('settings.iaModelo.salvo', { modelo: e.modelo.valor, effort: e.effort.valor }) })
    } catch (e) {
      setAviso({ id: c.id, texto: tr('settings.iaPrompt.erro', { msg: e instanceof Error ? e.message : String(e) }) })
    }
  }

  async function copiar(c: ChamadaIa): Promise<void> {
    try {
      await navigator.clipboard.writeText(montar(c, configs[c.id]))
      setCopied(c.id)
      setTimeout(() => setCopied((x) => (x === c.id ? null : x)), 1500)
    } catch {
      // sem clipboard: o texto continua selecionável no <pre>
    }
  }

  return (
    <div className="modal-overlay" onClick={() => !editando && onClose()}>
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
          <input placeholder={tr('settings.buscarChamadaDeIa')} value={query} onChange={(e) => setQuery(e.target.value)} style={{ flex: '2 1 220px', minWidth: 0 }} />
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
                const aberto = open === c.id
                const cfg = configs[c.id]
                const exec = execucao(c, cfg, saved, codex)
                const { modelo, effort } = exec
                const custom = personalizado(cfg)
                return (
                  <div key={c.id} style={{ border: `1px solid ${custom ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 8, padding: '8px 10px', background: 'var(--bg-secondary)' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
                      <div style={{ flex: '1 1 200px', minWidth: 0, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{nomeChamada(c.id)}</div>
                      {custom && <span style={{ ...badge, borderColor: 'var(--accent)', color: 'var(--accent)' }}>{tr('settings.iaPrompt.personalizado')}</span>}
                      <span style={badge} title={tr('settings.motor')}>{MOTORES[exec.motor]}</span>
                      <span style={badge} title={`${tr('settings.modelo')} · ${modelo.origem}`}>{tr('settings.modelo')}: {modelo.valor}</span>
                      <span style={badge} title={`${tr('settings.effort')}${effort.origem ? ` · ${effort.origem}` : ''}`}>{tr('settings.effort')}: {effort.valor}</span>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          setOpen(aberto ? null : c.id)
                          setEditando(null)
                          setAviso(null)
                        }}
                      >
                        {aberto ? tr('settings.ocultarPrompt') : tr('settings.verPrompt')}
                      </button>
                    </div>
                    {aberto && (
                      <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'grid', gap: 2, overflowWrap: 'anywhere' }}>
                          <div>
                            {tr('settings.arquivoDoPrompt')}: <code>{c.arquivo ? `shared/prompts/${c.arquivo}` : tr('settings.textoDoUsuario')}</code>
                          </div>
                          <div>
                            {tr('settings.usadoEm')}: <code>{c.usadoEm}</code>
                          </div>
                          <div>
                            {tr('settings.modelo')}: {modelo.origem || '—'}
                            {effort.origem ? ` · ${tr('settings.effort')}: ${effort.origem}` : ''}
                          </div>
                          {c.tipo === 'texto' && <div>{tr('settings.iaPrompt.soTexto')}</div>}
                        </div>

                        {c.tipo === 'executa' && (
                          <ConfigExecucao
                            key={`${c.id}:${exec.motor}`}
                            c={c}
                            cfg={cfg}
                            exec={exec}
                            onMotor={(m) => void trocarMotor(c, m)}
                            onModelo={(modelo, effort) => void salvarModelo(c, modelo, effort)}
                          />
                        )}

                        {aviso?.id === c.id && <div style={{ fontSize: 12, color: 'var(--accent)' }}>{aviso.texto}</div>}

                        {editando === c.id ? (
                          <EditorPrompt
                            c={c}
                            cfg={cfg}
                            onCancelar={() => setEditando(null)}
                            onSalvo={(r) => {
                              atualizar(c.id, r)
                              setEditando(null)
                              setAviso({ id: c.id, texto: tr('settings.iaPrompt.salvo') })
                            }}
                          />
                        ) : (
                          <>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                              <button className="btn btn-primary btn-sm" onClick={() => setEditando(c.id)}>{tr('settings.iaPrompt.editar')}</button>
                              {custom && (
                                <button className="btn btn-danger btn-sm" onClick={() => void reverter(c)}>{tr('settings.iaPrompt.reverter')}</button>
                              )}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{tr('settings.iaPrompt.exemploAtual')}</div>
                            <div style={{ position: 'relative' }}>
                              <button className="btn btn-secondary btn-sm" style={{ position: 'absolute', top: 6, right: 6 }} onClick={() => void copiar(c)}>
                                {copied === c.id ? tr('settings.copiado') : tr('settings.copiarPrompt')}
                              </button>
                              <pre style={{ ...pre, paddingTop: 36 }}>{montar(c, cfg)}</pre>
                            </div>
                          </>
                        )}
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
