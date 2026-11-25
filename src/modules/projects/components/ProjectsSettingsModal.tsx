import React, { useEffect, useState } from 'react'
import type { ClaudeHookStatus } from '../../../types'
import { timeAgo } from '../../../utils/dates'
import { shortPath } from '../git'
import { t } from '../../../i18n'

/** Automações da Central de Projetos: hook do Claude Code que preenche o "onde parei". */
export function ProjectsSettingsModal({ onClose }: { onClose: () => void }): React.ReactElement {
  const [st, setSt] = useState<ClaudeHookStatus | null>(null)
  const [model, setModel] = useState('haiku')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    window.api.projects.hookStatus().then((s) => {
      setSt(s)
      setModel(s.model)
    }).catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  async function run(fn: () => Promise<ClaudeHookStatus>): Promise<void> {
    setBusy(true)
    setError('')
    try {
      setSt(await fn())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal ph-modal ph-modal-wide" onClick={(e) => e.stopPropagation()}>
        <h2>{t('projects.automacoesDosProjetos')}</h2>

        <div className="ph-panel">
          <div className="ph-panel-title">{t('projects.ondePareiAutomaticoClaudeCode')}</div>
          <p className="ph-muted">
            {t('projects.umHook')} <code>SessionEnd</code> {t('projects.globalAvisaORickosQuando')}
          </p>
          {st && (
            <div className="ph-hook-status">
              <span className={`ph-deleg-status ${st.installed ? 'ok' : 'off'}`}>{st.installed ? t('projects.instalado') : t('projects.naoInstalado')}</span>
              {st.installed && <span className="ph-muted">{t('projects.em')} {shortPath(st.settingsPath)}</span>}
            </div>
          )}
          {st?.last && (
            <div className="ph-muted">
              {t('projects.ultimaSessao')} {st.last.project ?? '—'} {t('projects.ha', { status: st.last.status, p1: timeAgo(st.last.at) })}
            </div>
          )}
          {st?.installed && (
            <>
              <label className="ph-check">
                <input type="checkbox" checked={st.enabled} onChange={() => run(() => window.api.projects.hookConfig(!st.enabled, null))} />
                <span>{t('projects.ativoDesligueParaPausarSem')}</span>
              </label>
              <div className="ph-row">
                <label className="ph-muted" style={{ flex: 1 }}>
                  {t('projects.modeloDoResumo')}
                  <input value={model} onChange={(e) => setModel(e.target.value)} onBlur={() => model !== st.model && run(() => window.api.projects.hookConfig(st.enabled, model))} placeholder={t('projects.haiku')} />
                </label>
              </div>
            </>
          )}
          <div className="ph-btnrow">
            {!st?.installed ? (
              <button className="btn btn-primary btn-sm" onClick={() => run(() => window.api.projects.hookInstall())} disabled={busy}>{t('projects.instalarHook')}</button>
            ) : (
              <>
                <button className="btn btn-secondary btn-sm" onClick={() => run(() => window.api.projects.hookInstall())} disabled={busy} title={t('projects.regravaOScriptExMudou')}>{t('projects.reinstalar')}</button>
                <button className="btn btn-danger btn-sm" onClick={() => run(() => window.api.projects.hookUninstall())} disabled={busy}>{t('projects.desinstalar')}</button>
              </>
            )}
          </div>
          <p className="ph-muted">
            {t('projects.instalarEdita')} <code>~/.claude/settings.json</code> {t('projects.backupEm')} <code>settings.json.rickos-backup</code>{t('projects.noComputadorQueRodaO')}
          </p>
        </div>
        {error && <div className="ph-error">{error}</div>}
        <div className="modal-actions">
          <button className="btn btn-secondary btn-sm" onClick={onClose}>{t('projects.fechar')}</button>
        </div>
      </div>
    </div>
  )
}
