import React, { useEffect, useState } from 'react'
import type { ChatAccount, ChatsConfig, ChatsStatus, ChatTemplate } from '../../../../shared/chats'
import { networkInfo, PROVIDERS_INFO } from '../../../../shared/chats'
import type { AgentDetails } from '../../chats/api'
import { StatusBadge } from '../../chats/components/StatusBadge'
import '../../chats/chats.css'
import { t as tr, getLocale } from '../../../i18n'

const INTERVALS = [
  { v: 60, l: '1 min' },
  { v: 120, l: '2 min' },
  { v: 300, l: '5 min' },
  { v: 900, l: '15 min' },
  { v: 3600, l: '1 h' }
]

const ALERTS: { id: string; label: string }[] = [
  { id: 'vip_waiting', label: tr('settings.pessoasImportantesEsperandoResposta') },
  { id: 'mentions', label: tr('settings.mencoesEmGrupos') },
  { id: 'reminder_due', label: tr('settings.lembretesVencidos') },
  { id: 'professional', label: tr('settings.pendenciasProfissionais') },
  { id: 'forgotten', label: tr('settings.conversasEsquecidas7Dias') },
  { id: 'old_unread', label: tr('settings.naoLidasAntigas') },
  { id: 'no_contact', label: tr('settings.pessoasImportantesSemContatoRecente') },
  { id: 'reopened', label: tr('settings.adiadasComMensagemNova') }
]

/** Configurações → Integrações → Mensagens (Central de Mensagens). */
export function ChatsSection(): React.ReactElement {
  const [cfg, setCfg] = useState<ChatsConfig | null>(null)
  const [agent, setAgent] = useState<AgentDetails | null>(null)
  const [status, setStatus] = useState<ChatsStatus | null>(null)
  const [accounts, setAccounts] = useState<ChatAccount[]>([])
  const [token, setToken] = useState('')
  const [url, setUrl] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [agentKey, setAgentKey] = useState<string | null>(null)
  const [templatesOpen, setTemplatesOpen] = useState(false)

  async function load(): Promise<void> {
    const r = await window.api.chats.config()
    setCfg(r.config)
    setAgent(r.agent)
    setUrl(r.config.beeperUrl)
    setStatus(await window.api.chats.status())
    setAccounts(await window.api.chats.accounts().catch(() => []))
  }

  useEffect(() => {
    void load()
    const off1 = window.api.chats.onStatus((s) => setStatus(s))
    const off2 = window.api.chats.onUpdated(() => {
      window.api.chats.accounts().then(setAccounts).catch(() => undefined)
    })
    const t = setInterval(() => window.api.chats.agentStatus().then(setAgent).catch(() => undefined), 15000)
    return () => {
      off1()
      off2()
      clearInterval(t)
    }
  }, [])

  async function save(patch: Parameters<typeof window.api.chats.saveConfig>[0], okText?: string): Promise<void> {
    setBusy(true)
    setMsg(null)
    try {
      const r = await window.api.chats.saveConfig(patch)
      setCfg(r.config)
      setStatus(r.status)
      if (okText) setMsg({ ok: true, text: okText })
      setAccounts(await window.api.chats.accounts().catch(() => []))
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(false)
    }
  }

  async function test(): Promise<void> {
    setBusy(true)
    setMsg(null)
    try {
      const r = await window.api.chats.test()
      setMsg({ ok: r.ok, text: r.message })
      if (r.ok) {
        await window.api.chats.syncNow().catch(() => undefined)
        setAccounts(await window.api.chats.accounts())
      }
    } finally {
      setBusy(false)
    }
  }

  async function sync(full = false): Promise<void> {
    setBusy(true)
    setMsg(null)
    try {
      setStatus(await window.api.chats.syncNow(full))
      setAccounts(await window.api.chats.accounts())
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(false)
    }
  }

  async function toggleAccount(a: ChatAccount): Promise<void> {
    await window.api.chats.setAccountSync(a.key, !a.syncEnabled)
    setAccounts(await window.api.chats.accounts())
  }

  async function genAgentKey(): Promise<void> {
    if (cfg?.hasAgentKey && !window.confirm(tr('settings.gerarUmaChaveNovaInvalida'))) return
    const r = await window.api.chats.agentKey()
    setAgentKey(r.key)
    await load()
  }

  async function clearCache(): Promise<void> {
    if (!window.confirm(tr('settings.limparOCacheLocalDe'))) return
    const r = await window.api.chats.clearCache()
    setMsg({ ok: true, text: tr('settings.cacheLimpoConversaSRemovida', { removed: r.removed, kept: r.kept }) })
    setAccounts(await window.api.chats.accounts())
  }

  async function disconnect(): Promise<void> {
    if (!window.confirm(tr('settings.desconectarOTokenEApagado'))) return
    setStatus(await window.api.chats.disconnect())
    setToken('')
    await load()
  }

  if (!cfg) return <div className="chart-section" style={{ maxWidth: 560, marginTop: 16 }}><div className="chart-title">{tr('settings.mensagens')}</div></div>

  const isBeeper = cfg.providerId === 'beeper'
  const origin = typeof window !== 'undefined' ? window.location.origin : ''

  return (
    <div className="chart-section" style={{ maxWidth: 560, marginTop: 16 }}>
      <div className="chart-title" style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <span>{tr('settings.mensagensCentralDeMensagens')}</span>
        {status && <StatusBadge status={status} />}
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '6px 0 10px' }}>
        {tr('settings.juntaWhatsappInstagramLinkedinE')}
      </p>

      <label className="chats-switch">
        <input type="checkbox" checked={cfg.enabled} disabled={busy} onChange={(e) => void save({ enabled: e.target.checked })} />
        <span>{tr('settings.ativarACentralDeMensagens')}</span>
      </label>

      <div className="editor-field">
        <label>{tr('settings.provedor')}</label>
        <select value={cfg.providerId} onChange={(e) => void save({ providerId: e.target.value })} disabled={busy}>
          {PROVIDERS_INFO.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
      </div>
      {cfg.providerId === 'mock' && (
        <div className="chats-demo-banner" style={{ marginTop: 8 }}>
          {tr('settings.modoDemonstracaoConversasEPessoas')} <strong>{tr('settings.ficticias')}</strong>{tr('settings.soParaConhecerAInterface')}
        </div>
      )}

      {isBeeper && (
        <>
          <div className="editor-field">
            <label>{tr('settings.conexaoComOBeeper')}</label>
            <div className="seg-toggle">
              <button className={`seg-btn ${cfg.beeperMode === 'direct' ? 'active' : ''}`} onClick={() => void save({ beeperMode: 'direct' })}>
                {tr('settings.diretaMesmaMaquinaRede')}
              </button>
              <button className={`seg-btn ${cfg.beeperMode === 'agent' ? 'active' : ''}`} onClick={() => void save({ beeperMode: 'agent' })}>
                {tr('settings.agenteLocalRickosRemoto')}
              </button>
            </div>
          </div>

          {cfg.beeperMode === 'direct' ? (
            <>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '8px 0 0' }}>
                {tr('settings.noBeeperDesktop')} <strong>{tr('settings.settingsIntegrations')}</strong>{tr('settings.ativeADesktopApiE')}
              </p>
              <div className="editor-field">
                <label>{tr('settings.endpointDaDesktopApi')}</label>
                <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={tr('settings.http127001')} />
              </div>
              <div className="editor-field">
                <label>{tr('settings.token')} {cfg.hasBeeperToken && <span style={{ color: 'var(--success)', textTransform: 'none' }}>{tr('settings.salvo2')}</span>}</label>
                <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder={cfg.hasBeeperToken ? tr('settings.deixeEmBrancoParaManter') : tr('settings.coleOTokenDoBeeper')} autoComplete="off" />
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <button
                  className="btn btn-primary btn-sm"
                  disabled={busy}
                  onClick={() => void save({ beeperUrl: url, ...(token ? { beeperToken: token } : {}) }, tr('settings.configuracaoSalva')).then(() => setToken(''))}
                >
                  {tr('settings.salvar')}
                </button>
                <button className="btn btn-secondary btn-sm" disabled={busy || !cfg.enabled} onClick={() => void test()}>{tr('settings.testarConexao')}</button>
              </div>
            </>
          ) : (
            <>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '8px 0 0' }}>
                {tr('settings.paraQuandoORickosRoda')} <strong>{tr('settings.saida')}</strong> {tr('settings.autenticadaAteORickosA')}
              </p>
              <div className="chats-agent-box">
                <div>
                  {tr('settings.agente')} {agent?.online ? <strong style={{ color: 'var(--success)' }}>{tr('settings.online')}</strong> : <strong style={{ color: 'var(--text-muted)' }}>{tr('settings.offline')}</strong>}
                  {agent?.lastSeen && <span style={{ color: 'var(--text-muted)' }}> {tr('settings.visto')} {new Date(agent.lastSeen).toLocaleString(getLocale())}</span>}
                  {agent?.beeper && <span style={{ color: 'var(--text-muted)' }}> {tr('settings.beeper')} {agent.beeper}</span>}
                </div>
                <button className="btn btn-secondary btn-sm" onClick={() => void genAgentKey()}>{cfg.hasAgentKey ? tr('settings.gerarNovaChave') : tr('settings.gerarChaveDoAgente')}</button>
              </div>
              {agentKey && (
                <div className="chats-code">
                  <div style={{ fontSize: 11, color: 'var(--warning)', marginBottom: 4 }}>{tr('settings.copieAgoraAChaveNao')}</div>
                  <code>
                    RICKOS_URL={origin} \<br />
                    RICKOS_TOKEN=&lt;token do rickOS, se houver&gt; \<br />
                    RICKOS_AGENT_KEY={agentKey} \<br />
                    BEEPER_TOKEN=&lt;token do Beeper&gt; \<br />
                    node bin/rickos-chat-agent.mjs
                  </code>
                  <button className="btn btn-secondary btn-sm" style={{ marginTop: 6 }} onClick={() => navigator.clipboard?.writeText(agentKey)}>{tr('settings.copiarChave')}</button>
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button className="btn btn-secondary btn-sm" disabled={busy || !cfg.enabled} onClick={() => void test()}>{tr('settings.testarConexao')}</button>
              </div>
            </>
          )}
        </>
      )}
      {cfg.providerId === 'mock' && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button className="btn btn-secondary btn-sm" disabled={busy || !cfg.enabled} onClick={() => void test()}>{tr('settings.testarConexao')}</button>
        </div>
      )}

      {msg && <div className={`chats-msg ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</div>}

      {status && cfg.enabled && (
        <div className="chats-status-line">
          {status.lastSyncAt ? tr('settings.ultimaSincronizacao2', { p0: new Date(status.lastSyncAt).toLocaleString(getLocale()) }) : tr('settings.aindaNaoSincronizado')}
          {' · '}{tr('settings.tempoReal')} {status.realtime === 'on' ? tr('settings.ativo') : status.realtime === 'connecting' ? tr('settings.conectando') : status.realtime === 'unsupported' ? tr('settings.indisponivelPolling') : tr('settings.desligadoPolling')}
          {status.progress && tr('settings.conversasLidas', { done: status.progress.done })}
          {status.lastError && <div style={{ color: 'var(--danger)' }}>{tr('settings.erro')} {status.lastError}</div>}
          {status.message && !status.lastError && <div>{status.message}</div>}
        </div>
      )}

      {cfg.enabled && accounts.length > 0 && (
        <div className="editor-field">
          <label>{tr('settings.contasASincronizar')}</label>
          <div className="chats-accounts">
            {accounts.map((a) => (
              <label key={a.key} className="chats-account">
                <input type="checkbox" checked={a.syncEnabled} onChange={() => void toggleAccount(a)} />
                <span>{networkInfo(a.network).icon}</span>
                <span className="chats-account-name">{a.displayName}</span>
                <span className="chats-account-meta">{a.chatCount} {tr('settings.conversas')} {a.status === 'removed' ? tr('settings.removidaDoProvedorConversasInativas') : a.status}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {cfg.enabled && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void sync(false)}>{tr('settings.sincronizarAgora')}</button>
          <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void sync(true)} title={tr('settings.releTodasAsConversasAte')}>{tr('settings.sincronizacaoCompleta')}</button>
        </div>
      )}

      <details className="chats-details">
        <summary>{tr('settings.sincronizacaoEArmazenamento')}</summary>
        <label className="chats-switch">
          <input type="checkbox" checked={cfg.syncAuto} onChange={(e) => void save({ syncAuto: e.target.checked })} />
          <span>{tr('settings.sincronizarAutomaticamente')}</span>
        </label>
        <label className="chats-switch">
          <input type="checkbox" checked={cfg.realtime} onChange={(e) => void save({ realtime: e.target.checked })} />
          <span>{tr('settings.eventosEmTempoRealWebsocket')}</span>
        </label>
        <div className="editor-row">
          <div className="editor-field">
            <label>{tr('settings.pollingACada')}</label>
            <select value={cfg.syncIntervalSec} onChange={(e) => void save({ syncIntervalSec: Number(e.target.value) })}>
              {INTERVALS.map((i) => (
                <option key={i.v} value={i.v}>{i.l}</option>
              ))}
            </select>
          </div>
          <div className="editor-field">
            <label>{tr('settings.maxConversasNa1Carga')}</label>
            <input type="number" min={50} max={20000} defaultValue={cfg.initialLimit} onBlur={(e) => void save({ initialLimit: Number(e.target.value) })} />
          </div>
        </div>
        <label className="chats-switch">
          <input type="checkbox" checked={cfg.storePreviews} onChange={(e) => void save({ storePreviews: e.target.checked })} />
          <span>{tr('settings.guardarPreviaCurtaDaUltima')}</span>
        </label>
        <label className="chats-switch">
          <input type="checkbox" checked={cfg.markReadOnOpen} onChange={(e) => void save({ markReadOnOpen: e.target.checked })} />
          <span>{tr('settings.marcarComoLidaAoAbrir')}</span>
        </label>
        <label className="chats-switch">
          <input type="checkbox" checked={cfg.markReadOnReply} onChange={(e) => void save({ markReadOnReply: e.target.checked })} />
          <span>{tr('settings.marcarComoLidaAoResponder')}</span>
        </label>
        <div className="editor-field">
          <label>{tr('settings.retencaoDoCacheDiasSem')}</label>
          <input type="number" min={0} max={3650} defaultValue={cfg.retentionDays} onBlur={(e) => void save({ retentionDays: Number(e.target.value) })} />
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => void clearCache()}>{tr('settings.limparCacheLocal')}</button>
          {isBeeper && cfg.hasBeeperToken && <button className="btn btn-danger btn-sm" onClick={() => void disconnect()}>{tr('settings.desconectarProvedor')}</button>}
        </div>
      </details>

      <details className="chats-details">
        <summary>{tr('settings.iaSugestoesEResumos')}</summary>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '6px 0' }}>
          {tr('settings.soAsMensagensQueVoce')}
        </p>
        <div className="editor-field">
          <label>{tr('settings.modeloVazioPadraoDoCli')}</label>
          <input defaultValue={cfg.aiModel} placeholder={tr('settings.sonnet')} onBlur={(e) => void save({ aiModel: e.target.value })} />
        </div>
        <div className="editor-field">
          <label>{tr('settings.comoVoceEscreveInstrucoesGerais')}</label>
          <textarea
            rows={3}
            defaultValue={cfg.aiStyleInstructions}
            placeholder={tr('settings.exEscrevoCurtoSemPonto')}
            onBlur={(e) => void save({ aiStyleInstructions: e.target.value })}
          />
        </div>
        <button className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={() => setTemplatesOpen(true)}>{tr('settings.respostasRapidas')}</button>
      </details>

      <details className="chats-details">
        <summary>{tr('settings.radarHomeENotificacoes')}</summary>
        <label className="chats-switch">
          <input type="checkbox" checked={cfg.homeWidget} onChange={(e) => void save({ homeWidget: e.target.checked })} />
          <span>{tr('settings.mostrarOWidgetCentralDe')}</span>
        </label>
        <div className="editor-field">
          <label>{tr('settings.alertasQueAparecemNaHome')}</label>
          <div className="chats-accounts">
            {ALERTS.map((a) => (
              <label key={a.id} className="chats-account">
                <input
                  type="checkbox"
                  checked={cfg.homeAlerts.includes(a.id)}
                  onChange={(e) => void save({ homeAlerts: e.target.checked ? [...cfg.homeAlerts, a.id] : cfg.homeAlerts.filter((x) => x !== a.id) })}
                />
                <span>{a.label}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="editor-field">
          <label>{tr('settings.notificacoes')}</label>
          <label className="chats-switch">
            <input type="checkbox" checked={cfg.notifyReminders} onChange={(e) => void save({ notifyReminders: e.target.checked })} />
            <span>{tr('settings.lembretesDeResponder')}</span>
          </label>
          <label className="chats-switch">
            <input type="checkbox" checked={cfg.notifyVipWaiting} onChange={(e) => void save({ notifyVipWaiting: e.target.checked })} />
            <span>{tr('settings.mensagemDePessoaImportanteVip')}</span>
          </label>
          <label className="chats-switch">
            <input type="checkbox" checked={cfg.notifyMentions} onChange={(e) => void save({ notifyMentions: e.target.checked })} />
            <span>{tr('settings.mencoesEmGrupos')}</span>
          </label>
        </div>
        <div className="editor-row">
          <div className="editor-field">
            <label>{tr('settings.revisaoDiariaConversas')}</label>
            <input type="number" min={1} max={50} defaultValue={cfg.dailyReviewSize} onBlur={(e) => void save({ dailyReviewSize: Number(e.target.value) })} />
          </div>
          <div className="editor-field">
            <label>{tr('settings.semContatoAposDias')}</label>
            <input type="number" min={7} max={365} defaultValue={cfg.noContactDays} onBlur={(e) => void save({ noContactDays: Number(e.target.value) })} />
          </div>
        </div>
        <div className="editor-field">
          <label>{tr('settings.tagsProfissionaisPriorizamEEntram')}</label>
          <input defaultValue={cfg.professionalLabels.join(', ')} onBlur={(e) => void save({ professionalLabels: e.target.value.split(',') })} />
        </div>
        <div className="editor-field">
          <label>{tr('settings.pesosDaPrioridade')}</label>
          <div className="chats-weights">
            {(Object.keys(cfg.priorityWeights) as (keyof ChatsConfig['priorityWeights'])[]).map((k) => (
              <label key={k}>
                <span>{WEIGHT_LABELS[k]}</span>
                <input type="number" defaultValue={cfg.priorityWeights[k]} onBlur={(e) => void save({ priorityWeights: { ...cfg.priorityWeights, [k]: Number(e.target.value) } })} />
              </label>
            ))}
          </div>
        </div>
      </details>

      {templatesOpen && <TemplatesModal onClose={() => setTemplatesOpen(false)} />}
    </div>
  )
}

const WEIGHT_LABELS: Record<keyof ChatsConfig['priorityWeights'], string> = {
  mention: tr('settings.mencaoAMim'),
  vip: tr('settings.pessoaVipAlta'),
  manualHigh: tr('settings.conversaPrioridadeAlta'),
  manualLow: tr('settings.conversaPrioridadeBaixa'),
  question: tr('settings.perguntaPendente'),
  professional: tr('settings.tagProfissional'),
  recency: tr('settings.recencia'),
  agePerDay: tr('settings.porDiaEsperando'),
  bigGroupPenalty: tr('settings.grupoGrandePenalidade'),
  mutedPenalty: tr('settings.silenciadaPenalidade')
}

export function TemplatesModal({ onClose }: { onClose: () => void }): React.ReactElement {
  const [list, setList] = useState<ChatTemplate[]>([])
  const [editing, setEditing] = useState<{ id: number | null; title: string; body: string } | null>(null)
  const load = (): void => void window.api.chats.templates().then(setList)
  useEffect(load, [])
  async function save(): Promise<void> {
    if (!editing) return
    await window.api.chats.saveTemplate(editing.id, editing.title, editing.body)
    setEditing(null)
    load()
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560, width: '100%' }}>
        <h2>{tr('settings.respostasRapidas')}</h2>
        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{tr('settings.modelosSeusParaInserirNa')}</p>
        {editing ? (
          <>
            <div className="editor-field">
              <label>{tr('settings.titulo')}</label>
              <input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} placeholder={tr('settings.exRecusarVagaComEducacao')} />
            </div>
            <div className="editor-field">
              <label>{tr('settings.texto')}</label>
              <textarea rows={5} value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })} />
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary btn-sm" onClick={() => setEditing(null)}>{tr('settings.cancelar')}</button>
              <button className="btn btn-primary btn-sm" onClick={() => void save()}>{tr('settings.salvar')}</button>
            </div>
          </>
        ) : (
          <>
            <div className="list-stack" style={{ maxHeight: 320, overflow: 'auto' }}>
              {list.length === 0 && <div className="empty-hint">{tr('settings.nenhumModeloAinda')}</div>}
              {list.map((t) => (
                <div key={t.id} className="list-row">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="list-row-title">{t.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.body}</div>
                  </div>
                  <div className="list-row-actions">
                    <button className="btn btn-secondary btn-sm" onClick={() => setEditing({ id: t.id, title: t.title, body: t.body })}>{tr('settings.editar')}</button>
                    <button className="btn btn-danger btn-sm" onClick={() => window.confirm(tr('settings.excluirModelo')) && void window.api.chats.deleteTemplate(t.id).then(load)}>✕</button>
                  </div>
                </div>
              ))}
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary btn-sm" onClick={() => setEditing({ id: null, title: '', body: '' })}>{tr('settings.novoModelo')}</button>
              <button className="btn btn-primary btn-sm" onClick={onClose}>{tr('settings.fechar')}</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
