import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { dataDir } from '../config'
import { all, exec, nowIso, one, read, StudyError, tx } from './sql'
import { tt } from '../i18n'

/**
 * Anexos do caderno (imagens). O arquivo fica no servidor (os dois clientes enxergam) com nome
 * estável derivado do conteúdo; a nota guarda `anexos/<fileName>`, que também é o caminho
 * relativo na exportação Markdown e no repositório.
 */
export const ATTACHMENT_PREFIX = 'anexos/'
export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024

const MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif'
}
const EXT_MIME: Record<string, string> = Object.fromEntries(Object.entries(MIME_EXT).map(([m, e]) => [e, m]))
EXT_MIME.jpeg = 'image/jpeg'

export interface AttachmentRow {
  id: number
  sha256: string
  fileName: string
  originalName: string | null
  mime: string
  size: number
  createdAt: string
}

export function attachmentsDir(): string {
  const d = path.join(dataDir(), 'estudos', 'anexos')
  fs.mkdirSync(d, { recursive: true })
  return d
}

export function slugify(s: string, fallback = 'item'): string {
  return (
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/[\s_]+/g, '-')
      .replace(/-+/g, '-')
      .toLowerCase()
      .slice(0, 48)
      .replace(/-$/, '') || fallback
  )
}

export function mimeFromName(name: string): string | null {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return EXT_MIME[ext] ?? null
}

/** Guarda bytes de imagem (dedupe por SHA-256) e devolve o registro. */
export async function storeAttachment(bytes: Buffer, originalName: string | null, mime: string, preferredFileName?: string): Promise<AttachmentRow> {
  const type = MIME_EXT[mime] ? mime : mimeFromName(originalName ?? '')
  if (!type) throw new StudyError(tt('estudos.imagemNaoSuportada'))
  if (!bytes.length) throw new StudyError(tt('estudos.arquivoVazio'))
  if (bytes.length > MAX_ATTACHMENT_BYTES) throw new StudyError(tt('estudos.imagemGrande'))
  const sha = crypto.createHash('sha256').update(bytes).digest('hex')
  const existing = await read((db) => one<AttachmentRow>(db, 'SELECT * FROM study_attachments WHERE sha256 = ?', [sha]))
  const base = slugify((originalName ?? 'imagem').replace(/\.[^.]+$/, ''), 'imagem')
  const wanted = preferredFileName && /^[a-z0-9][a-z0-9._-]*$/i.test(preferredFileName) && preferredFileName.startsWith(sha.slice(0, 12)) ? preferredFileName : null
  const fileName = existing?.fileName ?? wanted ?? `${sha.slice(0, 12)}-${base}.${MIME_EXT[type]}`
  const file = path.join(attachmentsDir(), fileName)
  if (!fs.existsSync(file)) fs.writeFileSync(file, bytes)
  if (existing) return existing
  return tx((db) => {
    const id = exec(db, 'INSERT INTO study_attachments (sha256, fileName, originalName, mime, size, createdAt) VALUES (?, ?, ?, ?, ?, ?)', [
      sha,
      fileName,
      originalName,
      type,
      bytes.length,
      nowIso()
    ])
    return one<AttachmentRow>(db, 'SELECT * FROM study_attachments WHERE id = ?', [id])!
  })
}

/** Caminho seguro do arquivo (só nomes registrados; nada de ../). */
export async function attachmentFile(fileName: string): Promise<{ file: string; mime: string } | null> {
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(fileName)) return null
  // o nome começa com 12 hex do SHA-256: o mesmo conteúdo com outro nome (outra instalação) também resolve
  const row = await read(
    (db) =>
      one<AttachmentRow>(db, 'SELECT * FROM study_attachments WHERE fileName = ?', [fileName]) ??
      (/^[0-9a-f]{12}-/.test(fileName) ? one<AttachmentRow>(db, 'SELECT * FROM study_attachments WHERE substr(sha256, 1, 12) = ?', [fileName.slice(0, 12)]) : null)
  )
  if (!row) return null
  const file = path.join(attachmentsDir(), row.fileName)
  return fs.existsSync(file) ? { file, mime: row.mime } : null
}

export async function listAttachments(): Promise<AttachmentRow[]> {
  return read((db) => all<AttachmentRow>(db, 'SELECT * FROM study_attachments ORDER BY fileName'))
}

/** Anexos referenciados num texto Markdown (`anexos/<arquivo>`). */
export function referencedAttachments(md: string): string[] {
  const out = new Set<string>()
  for (const m of md.matchAll(/!\[[^\]]*\]\((?:\.\.\/)*anexos\/([^)\s]+)\)/g)) out.add(decodeURIComponent(m[1]))
  return [...out]
}
