import React, { useEffect, useState } from 'react'
import type { DiagnosticoCodex, IaPerfisView } from '../../../../shared/estudos'
import { t } from '../../../i18n'

/** Diagnóstico local do Codex CLI (versão, login, modelos): não envia contexto ao provedor. */
export function IaDiagnostico(): React.ReactElement {
  const [d, setD] = useState<DiagnosticoCodex | null>(null)
  const [busy, setBusy] = useState(false)
  async function run(): Promise<void> {
    setBusy(true)
    try {
      setD(await window.api.estudos.iaDiagnostico())
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="ia-diag">
      <button className="btn btn-secondary btn-sm" onClick={run} disabled={busy}>{busy ? t('est.aguarde') : t('est.diagnosticar')}</button>
      {d && (
        <ul>
          {!d.instalado && <li>❌ {t('est.diag.naoInstalado')}</li>}
          {d.instalado && <li>✅ {t('est.diag.versao', { versao: d.versao ?? '?' })}</li>}
          {d.logado === false && <li>❌ {t('est.diag.semLogin')}</li>}
          {d.logado && <li>✅ {t('est.diag.logado')}</li>}
          {d.modelos.map((m) => (
            <li key={m.slug}>{m.disponivel ? '✅' : '❌'} {m.slug}{!m.disponivel ? ` — ${t('est.diag.modeloAusente')}` : ''}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

const PERFIS: ('plano' | 'aula' | 'editorial')[] = ['plano', 'aula', 'editorial']

/** Perfis de modelo/effort SÓ do módulo Estudos. Outros módulos não mudam. */
export function IaSettings({ onClose }: { onClose: () => void }): React.ReactElement {
  const [v, setV] = useState<IaPerfisView | null>(null)
  const [error, setError] = useState('')
  const load = (): Promise<void> => window.api.estudos.iaPerfis().then(setV)
  useEffect(() => {
    load()
  }, [])
  async function save(p: 'plano' | 'aula' | 'editorial', modelo: string, effort: string): Promise<void> {
    setError('')
    try {
      await window.api.estudos.setIaPerfil(p, modelo, effort)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal study-modal" onClick={(e) => e.stopPropagation()}>
        <h2>{t('est.iaTitulo')}</h2>
        <p className="study-hint">{t('est.iaExplica')}</p>
        {v &&
          PERFIS.map((p) => (
            <div key={p} className="editor-row ia-row">
              <div className="editor-field">
                <label>{t(`est.perfil.${p}`)}</label>
                <input defaultValue={v.perfis[p].modelo} placeholder={v.perfis[p].padraoModelo} onBlur={(e) => e.target.value !== v.perfis[p].modelo && save(p, e.target.value, v.perfis[p].effort)} />
              </div>
              <div className="editor-field">
                <label>effort</label>
                <select value={v.perfis[p].effort} onChange={(e) => save(p, v.perfis[p].modelo, e.target.value)}>
                  {v.efforts.map((x) => (
                    <option key={x} value={x}>{x}</option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        <p className="study-hint">{t('est.iaZeroChamadas')}</p>
        <IaDiagnostico />
        {error && <div className="study-error">{error}</div>}
        <div className="modal-actions">
          <button className="btn btn-primary btn-sm" onClick={onClose}>{t('estudos.fechar')}</button>
        </div>
      </div>
    </div>
  )
}
