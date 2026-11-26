import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { mimeFromName, storeAttachment } from './attachments'
import { checkoutDir, getConfig } from './git'
import { all, exec, nowIso, one, read, StudyError, tx } from './sql'
import type { AdoptFile, AdoptPreview, AdoptApply } from '../../shared/estudos'
import { tt } from '../i18n'
export type { AdoptFile, AdoptPreview, AdoptApply }


/**
 * Adoção progressiva do repositório de estudos que já existe: escolho uma pasta, vejo a prévia
 * (reconhecidos, ignorados, colisões, links faltantes) e importo. Os originais são só LIDOS;
 * reimportar a mesma origem propõe atualizar ou ignorar (study_origins), sem duplicar.
 */

const TEXT_RE = /\.(md|markdown|txt)$/i
const IMG_LINK = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g



function safeRoot(subpath: string): { repo: string; root: string; managed: string } {
  const repo = checkoutDir()
  if (!fs.existsSync(path.join(repo, '.git'))) throw new StudyError(tt('estudos.repoNaoVinculado'))
  const root = path.resolve(repo, subpath === '.' ? '' : subpath)
  if (root !== repo && !root.startsWith(repo + path.sep)) throw new StudyError(tt('estudos.pastaForaRepo'))
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new StudyError(tt('estudos.pastaNaoEncontrada'))
  return { repo, root, managed: '' }
}

const rel = (repo: string, p: string): string => path.relative(repo, p).split(path.sep).join('/')
const hashOf = (s: string): string => crypto.createHash('sha256').update(s).digest('hex')
const titleOf = (file: string, content: string): string => {
  const h1 = content.match(/^#\s+(.+)$/m)?.[1]?.trim()
  return h1 || path.basename(file).replace(/\.(md|markdown|txt)$/i, '').replace(/[-_]+/g, ' ').trim()
}
const readText = (p: string): string => fs.readFileSync(p, 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n')

function resolveImage(fileAbs: string, link: string): string | null {
  if (/^[a-z]+:/i.test(link) || link.startsWith('#')) return null // externo
  return path.resolve(path.dirname(fileAbs), decodeURIComponent(link.split('#')[0]))
}

export async function previewAdopt(subpath: string, topicId: number | null): Promise<AdoptPreview> {
  const config = await getConfig()
  const { repo, root } = safeRoot(subpath)
  const managedAbs = config ? path.join(repo, config.folder) : null
  const texts: string[] = []
  const others: string[] = []
  const walk = (d: string): void => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === '.git' || e.name.startsWith('.')) continue
      const p = path.join(d, e.name)
      if (managedAbs && (p === managedAbs || p.startsWith(managedAbs + path.sep))) continue // a pasta do rickOS não é acervo
      if (e.isDirectory()) walk(p)
      else (TEXT_RE.test(e.name) ? texts : others).push(p)
    }
  }
  walk(root)
  texts.sort()
  const referenced = new Set<string>()
  const recognized: AdoptFile[] = []
  const missingLinks: AdoptPreview['missingLinks'] = []
  const existingTitles = topicId
    ? new Set(await read((db) => all<{ title: string }>(db, 'SELECT title FROM study_nodes WHERE topicId = ?', [topicId]).map((r) => r.title.toLowerCase())))
    : new Set<string>()
  const seen = new Map<string, string>()
  const collisions: AdoptPreview['collisions'] = []
  for (const f of texts) {
    const content = readText(f)
    const images: string[] = []
    const missing: string[] = []
    for (const m of content.matchAll(IMG_LINK)) {
      const abs = resolveImage(f, m[2])
      if (!abs) continue
      if (fs.existsSync(abs) && mimeFromName(abs)) {
        images.push(rel(repo, abs))
        referenced.add(abs)
      } else {
        missing.push(m[2])
        missingLinks.push({ path: rel(repo, f), link: m[2] })
      }
    }
    const p = rel(repo, f)
    const hash = hashOf(content)
    const origin = await read((db) => one<{ hash: string }>(db, 'SELECT hash FROM study_origins WHERE originKey = ?', [`repo:${p}`]))
    const sectionRel = path.relative(root, path.dirname(f)).split(path.sep).join('/')
    const title = titleOf(f, content)
    const key = `${sectionRel}::${title.toLowerCase()}`
    if (seen.has(key)) collisions.push({ path: p, reason: 'mesmo-titulo' })
    else seen.set(key, p)
    if (!origin && existingTitles.has(title.toLowerCase())) collisions.push({ path: p, reason: 'ja-existe-no-topico' })
    recognized.push({
      path: p,
      title,
      section: sectionRel || null,
      chars: content.length,
      hash,
      status: !origin ? 'new' : origin.hash === hash ? 'unchanged' : 'changed',
      images,
      missing
    })
  }
  const ignored = others.filter((o) => !referenced.has(o)).map((o) => rel(repo, o)).sort()
  return { subpath, recognized, ignored, collisions, missingLinks }
}


export async function applyAdopt(input: AdoptApply): Promise<{ topicId: number; created: number; updated: number; skipped: number; images: number }> {
  const preview = await previewAdopt(input.subpath, input.topicId)
  const { repo } = safeRoot(input.subpath)
  // anexos primeiro (I/O fora da transação)
  const attachmentFor = new Map<string, string>()
  let images = 0
  for (const f of preview.recognized) {
    if ((input.decisions[f.path] ?? 'skip') === 'skip') continue
    for (const img of f.images) {
      if (attachmentFor.has(img)) continue
      const abs = path.join(repo, img)
      const a = await storeAttachment(fs.readFileSync(abs), path.basename(abs), mimeFromName(abs) ?? '')
      attachmentFor.set(img, a.fileName)
      images++
    }
  }
  return tx((db) => {
    let topicId = input.topicId
    if (topicId == null) {
      const name = (input.newTopicName ?? '').trim() || path.basename(input.subpath === '.' ? repo : input.subpath)
      topicId = exec(db, "INSERT INTO study_topics (name, status, priority, color, createdAt, uid) VALUES (?, 'studying', 0, '#6366f1', ?, lower(hex(randomblob(8))))", [name, nowIso()])
    } else if (!one(db, 'SELECT 1 FROM study_topics WHERE id = ?', [topicId])) throw new StudyError(tt('estudos.topicoNaoEncontrado'))
    const tid = topicId
    const sectionNode = new Map<string, number>()
    const nodeFor = (title: string, parentId: number | null): number => {
      const ex = one<{ id: number }>(db, 'SELECT id FROM study_nodes WHERE topicId = ? AND IFNULL(parentId, -1) = IFNULL(?, -1) AND title = ?', [tid, parentId, title])
      if (ex) return ex.id
      const order = one<{ n: number }>(db, 'SELECT COALESCE(MAX(orderIndex), -1) + 1 AS n FROM study_nodes WHERE topicId = ? AND IFNULL(parentId, -1) = IFNULL(?, -1)', [tid, parentId])?.n ?? 0
      return exec(db, 'INSERT INTO study_nodes (topicId, parentId, title, status, orderIndex, createdAt) VALUES (?, ?, ?, ?, ?, ?)', [tid, parentId, title, 'todo', order, nowIso()])
    }
    const sectionId = (section: string | null): number | null => {
      if (!section) return null
      if (sectionNode.has(section)) return sectionNode.get(section)!
      let parent: number | null = null
      for (const part of section.split('/')) parent = nodeFor(part.replace(/[-_]+/g, ' '), parent)
      sectionNode.set(section, parent!)
      return parent
    }
    let created = 0
    let updated = 0
    let skipped = 0
    for (const f of preview.recognized) {
      const decision = input.decisions[f.path] ?? 'skip'
      if (decision === 'skip' || (f.status === 'unchanged' && decision !== 'update')) {
        skipped++
        continue
      }
      let content = readText(path.join(repo, f.path))
      // links de imagem passam a apontar para o anexo guardado no servidor
      content = content.replace(IMG_LINK, (m, alt: string, link: string) => {
        const abs = resolveImage(path.join(repo, f.path), link)
        const key = abs ? rel(repo, abs) : null
        const file = key ? attachmentFor.get(key) : null
        return file ? `![${alt}](anexos/${file})` : m
      })
      const originKey = `repo:${f.path}`
      const origin = one<{ id: number; nodeId: number | null; topicId: number }>(db, 'SELECT * FROM study_origins WHERE originKey = ?', [originKey])
      if (origin && decision === 'update') {
        if (input.mode === 'note' && origin.nodeId != null) {
          const n = one<{ id: number }>(db, 'SELECT id FROM study_notes WHERE nodeId = ?', [origin.nodeId])
          if (n) exec(db, 'UPDATE study_notes SET content = ?, updatedAt = ? WHERE id = ?', [content, nowIso(), n.id])
          else exec(db, 'INSERT INTO study_notes (topicId, nodeId, content, updatedAt) VALUES (?, ?, ?, ?)', [origin.topicId, origin.nodeId, content, nowIso()])
        } else {
          exec(db, 'UPDATE study_sources SET content = ?, originHash = ?, updatedAt = ? WHERE originPath = ? AND topicId = ?', [content, f.hash, nowIso(), f.path, origin.topicId])
        }
        exec(db, 'UPDATE study_origins SET hash = ?, importedAt = ? WHERE id = ?', [f.hash, nowIso(), origin.id])
        updated++
        continue
      }
      if (origin) {
        skipped++ // origem conhecida e o usuário não pediu atualizar: nada de duplicata
        continue
      }
      const parent = sectionId(f.section)
      let nodeId: number | null
      if (input.mode === 'note') {
        nodeId = nodeFor(f.title, parent)
        const n = one<{ id: number; content: string }>(db, 'SELECT id, content FROM study_notes WHERE nodeId = ?', [nodeId])
        if (n && n.content.trim()) {
          // nó já tinha nota minha: anexa em vez de substituir
          exec(db, 'UPDATE study_notes SET content = ?, updatedAt = ? WHERE id = ?', [`${n.content.trimEnd()}\n\n---\n\n${content}`, nowIso(), n.id])
        } else if (n) exec(db, 'UPDATE study_notes SET content = ?, updatedAt = ? WHERE id = ?', [content, nowIso(), n.id])
        else exec(db, 'INSERT INTO study_notes (topicId, nodeId, content, updatedAt) VALUES (?, ?, ?, ?)', [tid, nodeId, content, nowIso()])
      } else {
        nodeId = parent
        exec(db, 'INSERT INTO study_sources (topicId, nodeId, kind, title, content, originPath, originHash, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [
          tid,
          nodeId,
          'file',
          f.title,
          content,
          f.path,
          f.hash,
          nowIso(),
          nowIso()
        ])
      }
      exec(db, 'INSERT INTO study_origins (originKey, hash, topicId, nodeId, importedAt) VALUES (?, ?, ?, ?, ?)', [originKey, f.hash, tid, nodeId, nowIso()])
      created++
    }
    return { topicId: tid, created, updated, skipped, images }
  })
}
