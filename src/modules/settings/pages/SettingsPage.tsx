import { useUIStore } from '../../../store/uiStore'
import React, { useEffect, useState } from 'react'
import { useSettingsStore } from '../store/settingsStore'
import { useGithubStore } from '../../projects/store/githubStore'
import { useCalendarStore } from '../../calendar/store/calendarStore'
import { useFinanceStore } from '../../finance/store/financeStore'
import { PluggyConnect } from 'react-pluggy-connect'
import { ChatsSection } from '../components/ChatsSection'
import { NewsSection } from '../components/NewsSection'
import { SnapshotsSection } from '../components/SnapshotsSection'
import { AppearanceSection } from '../components/AppearanceSection'
import { LanguageSection } from '../components/LanguageSection'
import { ModulesSection } from '../components/ModulesSection'
import {
  CONV_DEFAULT_EFFORT_KEY,
  CONV_DEFAULT_MODEL_KEY,
  CONV_EFFORTS,
  CONV_MODELS,
  convDefaultEffort,
  convDefaultModel
} from '../../../../shared/aiConversations'
import { AiUsageModal } from '../components/AiUsageModal'
import { AiCallsModal } from '../components/AiCallsModal'
import { firstBusinessDay } from '../../../../shared/finance'
import { finishPluggySync } from '../../finance/pluggySync'
import { t as tr, getLocale } from '../../../i18n'
import { IntegrationsGrid, type IntegrationItem, type IntegrationTone } from '../components/IntegrationsGrid'
import { ExportDbModal } from '../../../components/ExportDbModal'
import type { ChatsStatus } from '../../../../shared/chats'
import { SETTINGS_TABS, SETTINGS_TAB_ICON, clearSettingsRequest, initialSettingsTab, rememberSettingsTab, type SettingsTab } from '../tabs'

const FX_CURRENCIES = ['BRL', 'USD', 'JPY', 'EUR']

/** Próximo 1º dia útil (este mês, se ainda não passou e não rodou; senão o do mês que vem). */
function nextInvestmentSync(): string {
  const now = new Date()
  const today = now.toLocaleDateString('sv-SE')
  let y = now.getFullYear()
  let m = now.getMonth() + 1
  let d = firstBusinessDay(y, m)
  if (d < today || d === today) {
    m += 1
    if (m > 12) {
      m = 1
      y += 1
    }
    d = firstBusinessDay(y, m)
  }
  return d.split('-').reverse().join('/')
}

function fmtLastSync(iso?: string): string {
  if (!iso) return 'nunca'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return 'nunca'
  return d.toLocaleString(getLocale(), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

/** Status da Central de Mensagens → status do quadradinho (mesmos rótulos do selo de Mensagens). */
function chatsTone(s: ChatsStatus | null): { tone: IntegrationTone; text: string } {
  if (!s) return { tone: 'off', text: '…' }
  switch (s.state) {
    case 'disabled':
      return { tone: 'off', text: tr('chats.desativado') }
    case 'unconfigured':
      return { tone: 'warn', text: tr('chats.faltaConfigurar') }
    case 'offline':
      return { tone: 'warn', text: tr('chats.desconectado') }
    case 'error':
      return { tone: 'err', text: tr('chats.erro') }
    case 'syncing':
      return { tone: 'ok', text: tr('chats.sincronizando') }
    default:
      return { tone: 'ok', text: tr('chats.conectado') }
  }
}

export function SettingsPage(): React.ReactElement {
  const { values, refresh, set } = useSettingsStore()
  const { sync, syncing, error, lastCount } = useGithubStore()
  const { refresh: refreshEvents } = useCalendarStore()
  const { base, rates, refresh: refreshFinance, saveFxConfig } = useFinanceStore()
  const [fxBase, setFxBase] = useState('BRL')
  const [fxRates, setFxRates] = useState<Record<string, string>>({})
  const [fxSaved, setFxSaved] = useState(false)

  // Open Finance (Pluggy)
  const [pClientId, setPClientId] = useState('')
  const [pClientSecret, setPClientSecret] = useState('')
  const [pItemId, setPItemId] = useState('')
  const [pBusy, setPBusy] = useState(false)
  const [pMsg, setPMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [connectToken, setConnectToken] = useState<string | null>(null)

  const [token, setToken] = useState('')
  const [username, setUsername] = useState('')
  const [saved, setSaved] = useState(false)
  const [authMode, setAuthMode] = useState<'token' | 'ssh'>('token')

  async function changeAuthMode(m: 'token' | 'ssh'): Promise<void> {
    setAuthMode(m)
    await set('github_auth_mode', m)
  }

  const [tab, setTab] = useState<SettingsTab>(initialSettingsTab)
  // a grade de Integrações limpa o pedido dela; nas outras abas, limpa aqui
  useEffect(() => {
    if (tab !== 'integracoes') clearSettingsRequest()
  }, [])
  function changeTab(aba: SettingsTab): void {
    setTab(aba)
    rememberSettingsTab(aba)
  }

  const [showAiUsage, setShowAiUsage] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [chatsStatus, setChatsStatus] = useState<ChatsStatus | null>(null)
  const [newsKey, setNewsKey] = useState(false)

  /** Status dos quadradinhos de Integrações (recarrega ao fechar um modal). */
  function refreshIntegrations(): void {
    window.api.chats.status().then(setChatsStatus).catch(() => undefined)
    window.api.news.state().then((n) => setNewsKey(n.config.hasGeminiKey)).catch(() => undefined)
    void refreshGoogle()
    void refresh()
  }
  const [showAiCalls, setShowAiCalls] = useState(false)

  // IA (Claude CLI)
  const [claudeCmd, setClaudeCmd] = useState('claude')
  const [claudeSaved, setClaudeSaved] = useState(false)
  const [allowedTools, setAllowedTools] = useState('')
  const [toolsSaved, setToolsSaved] = useState(false)
  const [runnerModel, setRunnerModel] = useState(convDefaultModel(''))
  const [runnerEffort, setRunnerEffort] = useState<string>(convDefaultEffort(''))
  const [runnerSaved, setRunnerSaved] = useState(false)


  // Google Calendar
  const [gClientId, setGClientId] = useState('')
  const [gClientSecret, setGClientSecret] = useState('')
  const [gConnected, setGConnected] = useState(false)
  const [gAccounts, setGAccounts] = useState<string[]>([])
  const [gBusy, setGBusy] = useState<'connect' | 'sync' | null>(null)
  const [gMsg, setGMsg] = useState<{ text: string; ok: boolean } | null>(null)

  async function refreshGoogle(): Promise<void> {
    const [connected, accounts] = await Promise.all([
      window.api.google.status(),
      window.api.google.accounts ? window.api.google.accounts() : Promise.resolve([])
    ])
    setGConnected(connected)
    setGAccounts(accounts)
  }

  useEffect(() => {
    refresh()
    refreshFinance()
    refreshGoogle()
    window.api.chats.status().then(setChatsStatus).catch(() => undefined)
    window.api.news.state().then((n) => setNewsKey(n.config.hasGeminiKey)).catch(() => undefined)
  }, [])

  useEffect(() => {
    setFxBase(base)
    setFxRates(Object.fromEntries(Object.entries(rates).map(([k, v]) => [k, String(v)])))
  }, [base, rates])

  async function saveFx(): Promise<void> {
    const parsed: Record<string, number> = {}
    for (const [k, v] of Object.entries(fxRates)) {
      const n = parseFloat(v)
      if (!isNaN(n) && n > 0 && k !== fxBase) parsed[k] = n
    }
    await saveFxConfig(fxBase, parsed)
    setFxSaved(true)
    setTimeout(() => setFxSaved(false), 2000)
  }

  useEffect(() => {
    setToken(values.github_token ?? '')
    setUsername(values.github_username ?? '')
    setGClientId(values.google_client_id ?? '')
    setGClientSecret(values.google_client_secret ?? '')
    setPClientId(values.pluggy_client_id ?? '')
    setPClientSecret(values.pluggy_client_secret ?? '')
    setPItemId(values.pluggy_item_id ?? '')
    setClaudeCmd(values.claude_command ?? 'claude')
    setAllowedTools(values.claude_allowed_tools ?? '')
    setRunnerModel(convDefaultModel(values[CONV_DEFAULT_MODEL_KEY]))
    setRunnerEffort(convDefaultEffort(values[CONV_DEFAULT_EFFORT_KEY]))
    setAuthMode((values.github_auth_mode as 'token' | 'ssh') || 'token')
  }, [
    values.github_token,
    values.github_username,
    values.github_auth_mode,
    values.google_client_id,
    values.google_client_secret,
    values.pluggy_client_id,
    values.pluggy_client_secret,
    values.pluggy_item_id,
    values.claude_command,
    values.claude_allowed_tools,
    values[CONV_DEFAULT_MODEL_KEY],
    values[CONV_DEFAULT_EFFORT_KEY]
  ])

  async function saveClaudeCmd(): Promise<void> {
    await set('claude_command', claudeCmd.trim() || 'claude')
    setClaudeSaved(true)
    setTimeout(() => setClaudeSaved(false), 2000)
  }

  async function saveAllowedTools(): Promise<void> {
    await set('claude_allowed_tools', allowedTools.trim())
    setToolsSaved(true)
    setTimeout(() => setToolsSaved(false), 2000)
  }

  async function saveRunnerDefaults(): Promise<void> {
    await set(CONV_DEFAULT_MODEL_KEY, runnerModel)
    await set(CONV_DEFAULT_EFFORT_KEY, runnerEffort)
    setRunnerSaved(true)
    setTimeout(() => setRunnerSaved(false), 2000)
  }

  async function savePluggy(): Promise<void> {
    await set('pluggy_client_id', pClientId.trim())
    await set('pluggy_client_secret', pClientSecret.trim())
    await set('pluggy_item_id', pItemId.trim())
    setPMsg({ text: tr('settings.credenciaisSalvasCriptografadas'), ok: true })
  }

  async function connectBank(): Promise<void> {
    // persist creds (needed to mint the connect token) then open the widget
    await set('pluggy_client_id', pClientId.trim())
    await set('pluggy_client_secret', pClientSecret.trim())
    setPMsg(null)
    try {
      const t = await window.api.pluggy.connectToken()
      setConnectToken(t)
    } catch (e) {
      setPMsg({ text: e instanceof Error ? e.message : String(e), ok: false })
    }
  }

  async function onBankConnected(itemId: string): Promise<void> {
    setConnectToken(null)
    setPItemId(itemId)
    await set('pluggy_item_id', itemId)
    setPBusy(true)
    setPMsg(null)
    try {
      const r = await window.api.pluggy.sync()
      const text = await finishPluggySync(r, tr('settings.bancoConectado') + ' ')
      await refreshFinance()
      setPMsg({ text, ok: true })
    } catch (e) {
      setPMsg({ text: e instanceof Error ? e.message : String(e), ok: false })
    } finally {
      setPBusy(false)
    }
  }

  async function syncPluggy(): Promise<void> {
    await savePluggy()
    setPBusy(true)
    setPMsg(null)
    try {
      const r = await window.api.pluggy.sync()
      const text = await finishPluggySync(r)
      await refreshFinance()
      await refresh()
      setPMsg({ text, ok: true })
    } catch (e) {
      setPMsg({ text: e instanceof Error ? e.message : String(e), ok: false })
    } finally {
      setPBusy(false)
    }
  }

  async function handleSave(): Promise<void> {
    await set('github_token', token.trim())
    await set('github_username', username.trim())
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function saveGoogleCreds(): Promise<void> {
    await set('google_client_id', gClientId.trim())
    await set('google_client_secret', gClientSecret.trim())
    setGMsg({ text: tr('settings.credenciaisSalvas'), ok: true })
  }

  async function connectGoogle(): Promise<void> {
    await saveGoogleCreds()
    setGBusy('connect')
    setGMsg(null)
    try {
      await window.api.google.connect()
      await refreshGoogle()
      setGMsg({ text: tr('settings.contaConectadaCliqueEmSincronizar'), ok: true })
    } catch (e) {
      setGMsg({ text: e instanceof Error ? e.message : String(e), ok: false })
    } finally {
      setGBusy(null)
    }
  }

  async function syncGoogle(): Promise<void> {
    setGBusy('sync')
    setGMsg(null)
    try {
      const n = await window.api.google.sync()
      await refreshEvents()
      await refresh()
      setGMsg({ text: tr('settings.eventosSincronizados', { n }), ok: true })
    } catch (e) {
      setGMsg({ text: e instanceof Error ? e.message : String(e), ok: false })
    } finally {
      setGBusy(null)
    }
  }

  async function disconnectGoogle(): Promise<void> {
    await window.api.google.disconnect()
    await refreshGoogle()
    setGMsg({ text: tr('settings.todasAsContasDesconectadas'), ok: true })
  }

  async function disconnectGoogleAccount(email: string): Promise<void> {
    await window.api.google.disconnectAccount(email)
    await refreshGoogle()
    setGMsg({ text: tr('settings.contaRemovida', { email }), ok: true })
  }

  const githubCard = (
    <div className="chart-section" style={{ maxWidth: 560 }}>
      <div className="chart-title">{tr('settings.github')}</div>

      <div className="editor-field">
        <label>{tr('settings.autenticacao')}</label>
        <div className="seg-toggle">
          <button className={`seg-btn ${authMode === 'ssh' ? 'active' : ''}`} onClick={() => changeAuthMode('ssh')}>
            {tr('settings.maquinaGhSsh')}
          </button>
          <button className={`seg-btn ${authMode === 'token' ? 'active' : ''}`} onClick={() => changeAuthMode('token')}>
            {tr('settings.tokenPat')}
          </button>
        </div>
      </div>

      {authMode === 'ssh' ? (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '8px 0 12px' }}>
          {tr('settings.usaO')} <strong>{tr('settings.githubCli')}<code>gh</code>)</strong> {tr('settings.autenticadoNaSuaMaquinaMesma')} <code>gh</code> {tr('settings.instaladoE')}
          <code>gh auth login</code> {tr('settings.feitoARestApiDo')}
          <code>gh</code> {tr('settings.usaACredencialJaConfigurada')}
        </p>
      ) : (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '8px 0 12px' }}>
          {tr('settings.crieUm')} <strong>{tr('settings.personalAccessToken')}</strong> {tr('settings.classicComEscopo')} <code>repo</code> {tr('settings.emGithubComSettingsDeveloper')}
        </p>
      )}

      {authMode === 'token' && (
        <>
          <div className="editor-field">
            <label>{tr('settings.personalAccessToken')}</label>
            <input
              type="password"
              placeholder={tr('settings.ghp')}
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
          </div>
          <div className="editor-field">
            <label>{tr('settings.usernameOpcional')}</label>
            <input
              type="text"
              placeholder={tr('settings.seuUsuario')}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
        </>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 14, alignItems: 'center' }}>
        {authMode === 'token' && (
          <button className="btn btn-primary btn-sm" onClick={handleSave}>
            {saved ? tr('settings.salvo') : tr('settings.salvar')}
          </button>
        )}
        <button
          className="btn btn-secondary btn-sm"
          onClick={async () => {
            await sync()
            await refresh()
          }}
          disabled={syncing || (authMode === 'token' && !token.trim())}
        >
          {syncing ? tr('settings.sincronizando') : tr('settings.testarSincronizarIssues')}
        </button>
        {lastCount !== null && !error && (
          <span style={{ fontSize: 12, color: 'var(--success)' }}>{lastCount} {tr('settings.issuesSincronizadas')}</span>
        )}
      </div>
      {error && (
        <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 8 }}>{error}</div>
      )}
      {values['github_last_sync'] && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
          {tr('settings.ultimaSincronizacao')} <strong>{fmtLastSync(values['github_last_sync'])}</strong>
        </div>
      )}
    </div>
  )

  const googleCard = (
    <div className="chart-section" style={{ maxWidth: 560, marginTop: 16 }}>
      <div className="chart-title">{tr('settings.googleCalendar')} {gAccounts.length > 0 && <span style={{ color: 'var(--success)', fontSize: 12 }}>{tr('settings.conta', { count: gAccounts.length })}</span>}</div>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '6px 0 12px' }}>
        {tr('settings.crieCredenciaisOauth')} <strong>{tr('settings.desktopApp')}</strong> {tr('settings.noGoogleCloudConsoleApi')} <strong>{tr('settings.variasContas')}</strong> {tr('settings.osEventosDeTodasAparecem')} <code>calendar.readonly</code>).
      </p>

      {gAccounts.length > 0 && (
        <div className="list-stack" style={{ marginBottom: 12 }}>
          {gAccounts.map((email) => (
            <div key={email} className="list-row">
              <span className="list-row-title">{email}</span>
              <button
                className="btn btn-danger btn-sm"
                style={{ marginLeft: 'auto' }}
                onClick={() => disconnectGoogleAccount(email)}
                disabled={gBusy !== null}
                title={tr('settings.removerEstaConta')}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="editor-field">
        <label>{tr('settings.clientId')}</label>
        <input type="text" placeholder={tr('settings.appsGoogleusercontentCom')} value={gClientId} onChange={(e) => setGClientId(e.target.value)} />
      </div>
      <div className="editor-field">
        <label>{tr('settings.clientSecret')}</label>
        <input type="password" placeholder={tr('settings.gocspx')} value={gClientSecret} onChange={(e) => setGClientSecret(e.target.value)} />
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn btn-primary btn-sm" onClick={connectGoogle} disabled={gBusy !== null || !gClientId.trim() || !gClientSecret.trim()}>
          {gBusy === 'connect' ? tr('settings.aguardandoBrowser') : gConnected ? tr('settings.conectarOutraConta') : tr('settings.conectarConta')}
        </button>
        <button className="btn btn-secondary btn-sm" onClick={syncGoogle} disabled={gBusy !== null || !gConnected}>
          {gBusy === 'sync' ? tr('settings.sincronizando') : tr('settings.sincronizar7Dias')}
        </button>
        {gConnected && gAccounts.length > 1 && (
          <button className="btn btn-danger btn-sm" onClick={disconnectGoogle} disabled={gBusy !== null}>
            {tr('settings.desconectarTodas')}
          </button>
        )}
      </div>
      {gMsg && (
        <div style={{ fontSize: 12, color: gMsg.ok ? 'var(--success)' : 'var(--danger)', marginTop: 8 }}>{gMsg.text}</div>
      )}
      {gConnected && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
          {tr('settings.sincronizaAutomaticamenteTodosOsDias')}
          <br />{tr('settings.ultimaSincronizacao')} <strong>{fmtLastSync(values['google_last_sync'])}</strong>
        </div>
      )}
      {gConnected && values['google_last_sync_error'] && (() => {
        const raw = values['google_last_sync_error']
        const sep = raw.indexOf('|')
        const at = sep > 0 ? raw.slice(0, sep) : undefined
        const msg = sep > 0 ? raw.slice(sep + 1) : raw
        return (
          <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 6 }}>
            {tr('settings.falhouEm', { p0: fmtLastSync(at), msg })}
          </div>
        )
      })()}
    </div>
  )

  const pluggyCard = (
    <div className="chart-section" style={{ maxWidth: 560, marginTop: 16 }}>
      <div className="chart-title">{tr('settings.openFinancePluggy')}</div>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '6px 0 12px' }}>
        {tr('settings.conecteSeuBancoVia')} <strong>{tr('settings.pluggyConnect')}</strong> {tr('settings.agregadorDeOpenFinanceCole')} <strong>{tr('settings.itemId')}</strong> {tr('settings.doBancoJaConectadoAs')} <strong>{tr('settings.criptografadas')}</strong> {tr('settings.noBancoLocalKeychainDo')}
      </p>
      <div className="editor-field">
        <label>{tr('settings.clientId')}</label>
        <input type="password" value={pClientId} onChange={(e) => setPClientId(e.target.value)} />
      </div>
      <div className="editor-field">
        <label>{tr('settings.clientSecret')}</label>
        <input type="password" value={pClientSecret} onChange={(e) => setPClientSecret(e.target.value)} />
      </div>
      <div className="editor-field">
        <label>{tr('settings.itemIdBancoConectado')}</label>
        <input type="text" value={pItemId} onChange={(e) => setPItemId(e.target.value)} />
      </div>
      <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          className="btn btn-primary btn-sm"
          onClick={connectBank}
          disabled={pBusy || !pClientId.trim() || !pClientSecret.trim()}
        >
          {tr('settings.conectarBanco')}
        </button>
        <button
          className="btn btn-secondary btn-sm"
          onClick={savePluggy}
          disabled={pBusy || !pClientId.trim() || !pClientSecret.trim()}
        >
          {tr('settings.salvarCredenciais')}
        </button>
        <button
          className="btn btn-secondary btn-sm"
          onClick={syncPluggy}
          disabled={pBusy || !pClientId.trim() || !pClientSecret.trim() || !pItemId.trim()}
        >
          {pBusy ? tr('settings.importando') : tr('settings.importarTransacoes')}
        </button>
      </div>
      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
        <strong>{tr('settings.conectarBanco2')}</strong> {tr('settings.abreOPluggyConnectPara')}
      </p>
      {pMsg && (
        <div style={{ fontSize: 12, color: pMsg.ok ? 'var(--success)' : 'var(--danger)', marginTop: 8 }}>{pMsg.text}</div>
      )}
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
        {tr('settings.ultimaSincronizacao')} <strong>{fmtLastSync(values['pluggy_last_sync'])}</strong>
      </div>
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, marginTop: 12, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={values['pluggy_investments_autosync'] !== '0'}
          onChange={(e) => void set('pluggy_investments_autosync', e.target.checked ? '1' : '0')}
          style={{ marginTop: 3 }}
        />
        <span>
          {tr('settings.atualizarInvestimentosAutomaticamenteNo1')}
          <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)' }}>
            {tr('settings.proxima')} <strong>{nextInvestmentSync()}</strong> {tr('settings.ultimaAtualizacaoDeInvestimentos')}{' '}
            <strong>{fmtLastSync(values['pluggy_investments_last_sync'])}</strong>{tr('settings.seOAppEstiverDesligado')}
          </span>
        </span>
      </label>
    </div>
  )

  const github = useGithubStore()
  const pluggyItem = (values.pluggy_item_id ?? '').trim()
  const pluggyCreds = !!(values.pluggy_client_id ?? '').trim() && !!(values.pluggy_client_secret ?? '').trim()
  const integrations: IntegrationItem[] = [
    {
      id: 'github',
      area: 'trabalho',
      icon: '🐙',
      name: 'GitHub',
      provider: authMode === 'ssh' ? 'gh / SSH' : tr('settings.tokenPat'),
      status: github.error
        ? { tone: 'err', text: tr('settings.integ.status.erro') }
        : authMode === 'ssh' || (values.github_token ?? '').trim()
          ? { tone: 'ok', text: tr('settings.integ.status.conectado') }
          : { tone: 'off', text: tr('settings.integ.status.naoConfigurado') },
      render: () => githubCard
    },
    {
      id: 'google',
      area: 'trabalho',
      icon: '📅',
      name: 'Google Calendar',
      provider: 'Google',
      status:
        gConnected && values.google_last_sync_error
          ? { tone: 'err', text: tr('settings.integ.status.erroSync') }
          : gAccounts.length > 0
            ? { tone: 'ok', text: tr('settings.conta', { count: gAccounts.length }).trim() }
            : { tone: 'off', text: tr('settings.integ.status.naoConectado') },
      render: () => googleCard
    },
    {
      id: 'pluggy',
      area: 'financas',
      icon: '🏦',
      name: 'Open Finance',
      provider: 'Pluggy',
      status: pluggyItem
        ? { tone: 'ok', text: tr('settings.integ.status.bancoConectado') }
        : pluggyCreds
          ? { tone: 'warn', text: tr('settings.integ.status.faltaBanco') }
          : { tone: 'off', text: tr('settings.integ.status.naoConfigurado') },
      render: () => pluggyCard
    },
    {
      id: 'mensagens',
      area: 'comunicacao',
      icon: '💬',
      name: tr('settings.integ.mensagens'),
      provider: chatsStatus?.providerLabel || 'Beeper',
      status: chatsTone(chatsStatus),
      render: () => <ChatsSection />
    },
    {
      id: 'noticias',
      area: 'conteudo',
      icon: '📰',
      name: tr('settings.integ.noticias'),
      provider: 'Google Gemini',
      status: newsKey
        ? { tone: 'ok', text: tr('settings.integ.status.chaveSalva') }
        : { tone: 'off', text: tr('settings.integ.status.semChave') },
      render: () => <NewsSection />
    },
    {
      id: 'passagens',
      area: 'conteudo',
      icon: '✈️',
      name: tr('settings.integ.passagens'),
      provider: 'Aviasales · Google Flights',
      status: { tone: 'off', text: tr('settings.integ.status.noModulo') },
      onOpen: () => useUIStore.getState().setPage('trip-monitoring')
    }
  ]

  return (
    <>
      <div className="module-tabs" role="tablist" aria-label={tr('settings.aba.aria')}>
        {SETTINGS_TABS.map((aba) => (
          <button
            key={aba}
            role="tab"
            aria-selected={tab === aba}
            className={`module-tab ${tab === aba ? 'active' : ''}`}
            onClick={() => changeTab(aba)}
          >
            <span className="module-tab-icon">{SETTINGS_TAB_ICON[aba]}</span>
            {tr(`settings.aba.${aba}`)}
          </button>
        ))}
      </div>
      <div className="module-page">
        <div className="module-header">
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700 }}>{tr('settings.configuracoes')}</h2>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              {tr('settings.integracoesEPreferenciasTokensFicam')}
            </p>
          </div>
        </div>

        <div className="settings-panel" role="tabpanel">
          {tab === 'preferencias' && (
            <>
              <LanguageSection />
              <AppearanceSection />
              <ModulesSection />
              <div className="chart-section" style={{ maxWidth: 560, marginTop: 16 }}>
                <div className="chart-title">{tr('settings.financasCambio')}</div>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '6px 0 12px' }}>
                  {tr('settings.moedaBaseETaxasManuais')} <strong>{tr('settings.1Unidade')}</strong> {tr('settings.daMoedaNaBaseUsado')}
                </p>
                <div className="editor-field">
                  <label>{tr('settings.moedaBase')}</label>
                  <select value={fxBase} onChange={(e) => setFxBase(e.target.value)}>
                    {FX_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="editor-row" style={{ flexWrap: 'wrap' }}>
                  {FX_CURRENCIES.filter((c) => c !== fxBase).map((c) => (
                    <div className="editor-field" key={c}>
                      <label>1 {c} = ? {fxBase}</label>
                      <input
                        type="number"
                        placeholder={tr('settings.ex520')}
                        value={fxRates[c] ?? ''}
                        onChange={(e) => setFxRates((r) => ({ ...r, [c]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 12 }}>
                  <button className="btn btn-primary btn-sm" onClick={saveFx}>{fxSaved ? tr('settings.salvo') : tr('settings.salvarCambio')}</button>
                </div>
              </div>
            </>
          )}

          {tab === 'integracoes' && <IntegrationsGrid items={integrations} onModalClose={refreshIntegrations} />}

          {tab === 'ia' && (
            <>
              <div className="chart-section" style={{ maxWidth: 560, marginTop: 16 }}>
                <div className="chart-title">{tr('settings.inteligenciaArtificial')}</div>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '6px 0 12px' }}>
                  {tr('settings.iaCardDesc')}
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => setShowAiUsage(true)}>{tr('settings.verConsumoDeTokens')}</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => setShowAiCalls(true)}>{tr('settings.verOndeAIaEUsada')}</button>
                </div>
              </div>
              <div className="chart-section" style={{ maxWidth: 560, marginTop: 16 }}>
                <div className="chart-title">{tr('settings.iaClaudeCli')}</div>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '6px 0 12px' }}>
                  {tr('settings.comandoUsadoParaRodarO')} <code>claude</code>{tr('settings.useOutroSeTiverMais')} <code>claude-trabalho</code>).
                </p>
                <div className="editor-field">
                  <label>{tr('settings.comando')}</label>
                  <input
                    type="text"
                    placeholder="claude"
                    value={claudeCmd}
                    onChange={(e) => setClaudeCmd(e.target.value)}
                  />
                </div>
                <div style={{ marginTop: 12 }}>
                  <button className="btn btn-primary btn-sm" onClick={saveClaudeCmd}>{claudeSaved ? tr('settings.salvo') : tr('settings.salvarComando')}</button>
                </div>

                <div className="editor-field" style={{ marginTop: 16 }}>
                  <label>{tr('settings.ferramentasPermitidas')}</label>
                  <input
                    type="text"
                    placeholder={tr('settings.bashGhBashGitRead')}
                    value={allowedTools}
                    onChange={(e) => setAllowedTools(e.target.value)}
                  />
                </div>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                  {tr('settings.oQueOClaudePode')}<code>gh</code>, <code>git</code> {tr('settings.eArquivosUse')} <code>Bash</code> {tr('settings.paraLiberarQualquerComandoOu')} <code>Read Grep</code> {tr('settings.paraModoLeitura')}
                </p>
                <div style={{ marginTop: 8 }}>
                  <button className="btn btn-primary btn-sm" onClick={saveAllowedTools}>{toolsSaved ? tr('settings.salvo') : tr('settings.salvarFerramentas')}</button>
                </div>

                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 16 }}>
                  <div className="editor-field" style={{ flex: '1 1 160px' }}>
                    <label>{tr('settings.modeloPadraoDoPromptRunner')}</label>
                    <select value={runnerModel} onChange={(e) => setRunnerModel(e.target.value)}>
                      {CONV_MODELS.map((x) => (
                        <option key={x.v} value={x.v}>
                          {x.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="editor-field" style={{ flex: '1 1 160px' }}>
                    <label>{tr('settings.esforcoPadrao')}</label>
                    <select value={runnerEffort} onChange={(e) => setRunnerEffort(e.target.value)}>
                      {CONV_EFFORTS.map((x) => (
                        <option key={x.v} value={x.v}>
                          {x.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                  {tr('settings.jaVemSelecionadoEmToda')}
                </p>
                <div style={{ marginTop: 8 }}>
                  <button className="btn btn-primary btn-sm" onClick={saveRunnerDefaults}>{runnerSaved ? tr('settings.salvo') : tr('settings.salvarPadrao')}</button>
                </div>
              </div>
            </>
          )}

          {tab === 'dados' && (
            <>
              <SnapshotsSection />
              <div className="chart-section" style={{ maxWidth: 560 }}>
                <div className="chart-title">{tr('settings.dados.bancoTitulo')}</div>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '6px 0 12px' }}>{tr('settings.dados.bancoDesc')}</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => setExportOpen(true)}>
                    💾 {tr('shell.exportDb')}
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={async () => {
                      if (!window.confirm(tr('shell.importDbConfirm'))) return
                      await window.api.app.importDb()
                    }}
                  >
                    📂 {tr('shell.importDb')}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {connectToken && (
          <PluggyConnect
            connectToken={connectToken}
            includeSandbox={true}
            onSuccess={(data) => onBankConnected(data.item.id)}
            onError={(err) => {
              setConnectToken(null)
              setPMsg({ text: tr('settings.pluggyConnect2', { p0: err?.message || 'falha na conexão' }), ok: false })
            }}
            onClose={() => setConnectToken(null)}
          />
        )}

        {showAiUsage && <AiUsageModal onClose={() => setShowAiUsage(false)} />}
        {showAiCalls && <AiCallsModal onClose={() => setShowAiCalls(false)} />}
        {exportOpen && <ExportDbModal onClose={() => setExportOpen(false)} />}
      </div>
    </>
  )
}
