import React, { useEffect, useRef, useState } from 'react'
import { useStudyStore } from '../store/studyStore'
import { renderMarkdown, imageSrc } from '../markdown'
import { fileToBase64 } from '../../../api/files'
import { t, getLocale } from '../../../i18n'

function fmt(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '—' : d.toLocaleString(getLocale(), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

/** Split-view Markdown note editor (textarea | live preview) with debounced autosave. */
export function NoteEditor(): React.ReactElement {
  const { note, selectedNodeId, nodes, saveNote, activeTopicId, setNoteDirty } = useStudyStore()
  const [draft, setDraft] = useState(note?.content ?? '')
  const [savedAt, setSavedAt] = useState<string | null>(note?.updatedAt ?? null)
  const [saveState, setSaveState] = useState<'idle' | 'dirty' | 'saving' | 'saved' | 'error'>('idle')
  const [whereStopped, setWhereStopped] = useState('')
  const [preview, setPreview] = useState(true)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cpTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const area = useRef<HTMLTextAreaElement | null>(null)
  const draftRef = useRef(draft)
  draftRef.current = draft
  const fileInput = useRef<HTMLInputElement | null>(null)
  const [image, setImage] = useState<{ ref: string; cursor: number; caption: string } | null>(null)
  const [imageBusy, setImageBusy] = useState(false)
  const [imageError, setImageError] = useState('')

  /** Envia a imagem ao servidor; o texto só muda quando eu confirmo a inserção (falha não mexe na nota). */
  async function uploadImage(file: File): Promise<void> {
    if (!file.type.startsWith('image/')) return
    const cursor = area.current?.selectionStart ?? draftRef.current.length
    setImageError('')
    setImageBusy(true)
    try {
      const dataUrl = await fileToBase64(file)
      const r = await window.api.estudos.uploadAttachment(file.name || 'imagem', file.type, dataUrl.slice(dataUrl.indexOf(',') + 1))
      setImage({ ref: r.ref, cursor, caption: '' })
    } catch (e) {
      setImageError(e instanceof Error ? e.message : String(e))
    } finally {
      setImageBusy(false)
    }
  }

  function insertImage(): void {
    if (!image) return
    const cur = draftRef.current
    const at = Math.min(image.cursor, cur.length)
    const before = cur.slice(0, at)
    const after = cur.slice(at)
    const caption = image.caption.replace(/[\[\]\n]/g, ' ').trim()
    const snippet = `${before && !before.endsWith('\n') ? '\n' : ''}![${caption}](${image.ref})\n${after.startsWith('\n') ? '' : '\n'}`
    onChange(before + snippet + after)
    setImage(null)
    requestAnimationFrame(() => {
      const el = area.current
      if (el) {
        const pos = before.length + snippet.length
        el.focus()
        el.setSelectionRange(pos, pos)
      }
    })
  }

  function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>): void {
    const f = [...e.clipboardData.files].find((x) => x.type.startsWith('image/'))
    if (f) {
      e.preventDefault()
      uploadImage(f)
    }
  }
  function onDrop(e: React.DragEvent<HTMLTextAreaElement>): void {
    const f = [...e.dataTransfer.files].find((x) => x.type.startsWith('image/'))
    if (f) {
      e.preventDefault()
      uploadImage(f)
    }
  }

  // posição e "onde parei" desta nota (checkpoint no servidor: vale para os dois clientes)
  useEffect(() => {
    if (activeTopicId == null) return
    let alive = true
    window.api.estudos.checkpoint(activeTopicId, selectedNodeId, 'note', null).then((cp) => {
      if (!alive) return
      setWhereStopped(cp?.whereStopped ?? '')
      try {
        const pos = cp?.position ? JSON.parse(cp.position) : null
        const el = area.current
        if (el && typeof pos?.cursor === 'number') {
          requestAnimationFrame(() => {
            const c = Math.min(pos.cursor, el.value.length)
            el.setSelectionRange(c, c)
            if (typeof pos.scroll === 'number') el.scrollTop = pos.scroll
          })
        }
      } catch { /* posição antiga inválida */ }
    })
    return () => {
      alive = false
    }
  }, [activeTopicId, selectedNodeId, note?.id])

  function checkpoint(where?: string): void {
    if (activeTopicId == null) return
    const el = area.current
    const position = el ? JSON.stringify({ cursor: el.selectionStart, scroll: Math.round(el.scrollTop) }) : null
    if (cpTimer.current) clearTimeout(cpTimer.current)
    const topicId = activeTopicId
    const nodeId = selectedNodeId
    cpTimer.current = setTimeout(() => {
      window.api.estudos.saveCheckpoint({ topicId, nodeId, target: 'note', position, ...(where !== undefined ? { whereStopped: where } : {}) })
    }, where !== undefined ? 0 : 1500)
  }

  const title = selectedNodeId ? nodes.find((n) => n.id === selectedNodeId)?.title ?? t('estudos.item') : t('estudos.visaoGeralTopico')

  // estado do autosave visível para quem aplica sugestões na nota
  useEffect(() => {
    setNoteDirty(saveState === 'dirty' || saveState === 'saving' || saveState === 'error')
  }, [saveState])

  // a nota mudou no servidor (sugestão aceita, aula adicionada, outro cliente) e não tenho rascunho pendente
  useEffect(() => {
    if (note && saveState !== 'dirty' && saveState !== 'saving' && note.content !== draftRef.current) {
      setDraft(note.content)
      setSavedAt(note.updatedAt)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.updatedAt])

  // reset when selection changes or the loaded note arrives
  useEffect(() => {
    setDraft(note?.content ?? '')
    setSavedAt(note?.updatedAt ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNodeId, note?.id])

  async function persist(v: string): Promise<void> {
    setSaveState('saving')
    try {
      await saveNote(v)
      setSavedAt(new Date().toISOString())
      // outra tecla durante o envio: continua "não salvo" até o próximo autosave
      setSaveState(draftRef.current === v ? 'saved' : 'dirty')
    } catch {
      setSaveState('error') // o rascunho continua na tela; nada se perde
    }
  }

  function onChange(v: string): void {
    setDraft(v)
    setSaveState('dirty')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => persist(v), 800)
    checkpoint()
  }

  function flush(): void {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    if (saveState === 'dirty' || saveState === 'error') persist(draft)
    checkpoint()
  }

  // salva ao sair da tela / trocar de nó
  useEffect(() => {
    // ids capturados aqui: no cleanup o store já aponta para o nó novo
    const topicId = activeTopicId
    const nodeId = selectedNodeId
    return () => {
      if (timer.current && topicId != null) {
        clearTimeout(timer.current)
        timer.current = null
        window.api.study.saveNote(topicId, nodeId, draftRef.current)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNodeId, activeTopicId])

  return (
    <div className="note-editor">
      <div className="note-editor-head">
        <strong>{title}</strong>
        <span className={`save-state save-${saveState}`} aria-live="polite">
          {saveState === 'saving' && t('est.salvando')}
          {saveState === 'dirty' && t('est.naoSalvo')}
          {saveState === 'error' && t('est.erroAoSalvar')}
          {(saveState === 'saved' || saveState === 'idle') && `${t('estudos.salvo')} ${fmt(savedAt)}`}
        </span>
        <button className="btn btn-secondary btn-sm" onClick={() => fileInput.current?.click()} disabled={imageBusy} title={t('est.imagemDica')}>
          {imageBusy ? t('est.enviandoImagem') : t('est.imagem')}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp,image/avif"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) uploadImage(f)
          }}
        />
        <button className="btn btn-secondary btn-sm" onClick={() => setPreview(!preview)}>{preview ? t('est.esconderPrevia') : t('est.mostrarPrevia')}</button>
      </div>
      {imageError && <div className="study-error">{t('est.imagemFalhou', { erro: imageError })}</div>}
      {image && (
        <div className="image-insert">
          {imageSrc(image.ref) && <img className="md-img" src={imageSrc(image.ref)!} alt="" />}
          <input value={image.caption} onChange={(e) => setImage({ ...image, caption: e.target.value })} placeholder={t('est.legendaOpcional')} autoFocus onKeyDown={(e) => e.key === 'Enter' && insertImage()} />
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setImage(null)}>{t('estudos.cancelar')}</button>
            <button className="btn btn-primary btn-sm" onClick={insertImage}>{t('est.inserirImagem')}</button>
          </div>
        </div>
      )}
      <div className="where-stopped">
        <input
          value={whereStopped}
          onChange={(e) => setWhereStopped(e.target.value)}
          onBlur={() => checkpoint(whereStopped)}
          onKeyDown={(e) => e.key === 'Enter' && checkpoint(whereStopped)}
          placeholder={t('est.ondePareiPlaceholder')}
        />
      </div>
      <div className={`md-split ${preview ? '' : 'md-split-single'}`}>
        <textarea
          ref={area}
          className="md-input"
          value={draft}
          onChange={(e) => onChange(e.target.value)}
          onBlur={flush}
          onKeyUp={() => checkpoint()}
          onPaste={onPaste}
          onDrop={onDrop}
          onDragOver={(e) => e.dataTransfer.types.includes('Files') && e.preventDefault()}
          onClick={() => checkpoint()}
          placeholder={t('estudos.escrevaEmMarkdownTituloNegrito')}
          spellCheck={false}
        />
        {preview && (
          <div className="md-preview-pane">
            {draft.trim() ? renderMarkdown(draft) : <div className="empty-hint">{t('estudos.preVisualizacaoApareceAqui')}</div>}
          </div>
        )}
      </div>

    </div>
  )
}
