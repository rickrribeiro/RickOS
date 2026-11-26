import React, { useEffect, useState } from 'react'
import type { LibraryTopic, ModeloPreview } from '../../../../shared/estudos'
import { downloadText, pickFile } from '../../../api/files'
import { t } from '../../../i18n'

/** Exportar a trilha do tópico como modelo de roadmap (.roteiro.json). Sem IA. */
export function ModeloExportModal({ topicId, onClose }: { topicId: number; onClose: () => void }): React.ReactElement {
  const [aulas, setAulas] = useState(true)
  const [notas, setNotas] = useState(false)
  const [error, setError] = useState('')
  async function baixar(): Promise<void> {
    setError('')
    try {
      const r = await window.api.estudos.modeloExport(topicId, { aulas, notas })
      downloadText({ name: r.nome, mime: 'application/json', content: r.conteudo })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal study-modal" onClick={(e) => e.stopPropagation()}>
        <h2>{t('est.modeloExportTitulo')}</h2>
        <p className="study-hint">{t('est.modeloExportExplica')}</p>
        <label className="study-check"><input type="checkbox" checked={aulas} onChange={(e) => setAulas(e.target.checked)} /> {t('est.modeloIncluirAulas')}</label>
        <label className="study-check"><input type="checkbox" checked={notas} onChange={(e) => setNotas(e.target.checked)} /> {t('est.modeloIncluirNotas')}</label>
        <p className="study-hint">{t('est.modeloNaoLeva')}</p>
        {error && <div className="study-error">{error}</div>}
        <div className="modal-actions">
          <button className="btn btn-secondary btn-sm" onClick={onClose}>{t('estudos.cancelar')}</button>
          <button className="btn btn-primary btn-sm" onClick={baixar}>{t('est.modeloBaixar')}</button>
        </div>
      </div>
    </div>
  )
}

/**
 * Importar um modelo: escolher o arquivo → prévia (o que entra, onde, avisos) → importar.
 * Tudo numa transação no servidor; nada é apagado nem movido no destino.
 */
/** Escolhe o arquivo (precisa vir de um toque/clique do usuário, por causa do celular). */
export async function escolherModelo(): Promise<{ arquivo: string; json: string } | null> {
  const f = await pickFile('.json,application/json')
  return f ? { arquivo: f.name, json: await f.text() } : null
}

export function ModeloImportModal({ inicial, topics, defaultTopicId, onClose, onImported }: {
  inicial: { arquivo: string; json: string }
  topics: LibraryTopic[]
  defaultTopicId?: number | null
  onClose: () => void
  onImported: (topicId: number, primeiraAulaNodeId: number | null) => void
}): React.ReactElement {
  const [json, setJson] = useState<string | null>(inicial.json)
  const [arquivo, setArquivo] = useState(inicial.arquivo)
  const [destino, setDestino] = useState(defaultTopicId != null ? String(defaultTopicId) : '')
  const [nome, setNome] = useState('')
  const [aulas, setAulas] = useState(true)
  const [notas, setNotas] = useState(true)
  const [prev, setPrev] = useState<ModeloPreview | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function escolher(): Promise<void> {
    const r = await escolherModelo()
    if (!r) return
    setNome('')
    setArquivo(r.arquivo)
    setJson(r.json)
  }

  useEffect(() => {
    if (json == null) return
    setError('')
    window.api.estudos
      .modeloPreview(json, destino ? Number(destino) : null)
      .then((p) => {
        setPrev(p)
        setNome((n) => n || p.nome)
      })
      .catch((e) => {
        setPrev(null)
        setError(e instanceof Error ? e.message : String(e))
      })
  }, [json, destino])

  async function importar(): Promise<void> {
    if (json == null) return
    setBusy(true)
    setError('')
    try {
      const r = await window.api.estudos.modeloImport(json, { topicId: destino ? Number(destino) : null, nome: destino ? null : nome, aulas, notas })
      onImported(r.topicId, r.primeiraAulaNodeId)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal study-modal" onClick={(e) => e.stopPropagation()}>
        <h2>{t('est.modeloImportTitulo')}</h2>
        <div className="plan-row">
          <button className="btn btn-secondary btn-sm" onClick={escolher}>{t('est.modeloEscolher')}</button>
          {arquivo && <span className="study-hint">{arquivo}</span>}
        </div>
        {prev && (
          <>
            <div className="editor-field">
              <label>{t('est.destino')}</label>
              <select value={destino} onChange={(e) => setDestino(e.target.value)}>
                <option value="">{t('est.novoTopicoDestino')}</option>
                {topics.map((x) => (
                  <option key={x.id} value={x.id}>{x.name}</option>
                ))}
              </select>
            </div>
            {!destino && (
              <div className="editor-field">
                <label>{t('estudos.nome')}</label>
                <input value={nome} onChange={(e) => setNome(e.target.value)} />
              </div>
            )}
            <div className="study-hint">
              {t('est.modeloResumo', { itens: prev.itens, aulas: prev.aulas, turnos: prev.turnos, notas: prev.notas })}
              {prev.tipo === 'idioma' && ' · 🗣'}
            </div>
            {prev.pedido && (
              <details className="lesson-brief">
                <summary className="study-hint">{t('est.modeloBriefing')}</summary>
                <pre>{prev.pedido}</pre>
              </details>
            )}
            <div className="plan-brief">
              {prev.raiz.map((r, i) => (
                <div key={i}>
                  <strong>{r.titulo}</strong>
                  <span className="study-hint"> · {t('est.modeloRaizLinha', { subitens: r.subitens, aulas: r.aulas })}</span>
                </div>
              ))}
            </div>
            {prev.aulas > 0 && <label className="study-check"><input type="checkbox" checked={aulas} onChange={(e) => setAulas(e.target.checked)} /> {t('est.modeloImportarAulas')}</label>}
            {prev.notas > 0 && <label className="study-check"><input type="checkbox" checked={notas} onChange={(e) => setNotas(e.target.checked)} /> {t('est.modeloImportarNotas')}</label>}
            {prev.avisos.map((a) => <div key={a} className="study-hint">⚠ {a}</div>)}
            {prev.erros.length > 0 && (
              <div className="study-error">
                <ul>{prev.erros.map((e) => <li key={e}>{e}</li>)}</ul>
              </div>
            )}
            <p className="study-hint">{destino ? t('est.modeloGarantiaExistente') : t('est.modeloGarantiaNovo')}</p>
          </>
        )}
        {error && <div className="study-error">{error}</div>}
        <div className="modal-actions">
          <button className="btn btn-secondary btn-sm" onClick={onClose}>{t('estudos.cancelar')}</button>
          <button className="btn btn-primary btn-sm" disabled={busy || !prev || prev.erros.length > 0 || (!destino && !nome.trim())} onClick={importar}>{t('est.modeloImportar')}</button>
        </div>
      </div>
    </div>
  )
}
