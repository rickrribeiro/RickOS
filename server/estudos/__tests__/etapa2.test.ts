import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { before, describe, it } from 'node:test'
import { isolateDb } from './helpers'

/**
 * Etapa 2: imagens + cópia Git restaurável, contra um remoto bare LOCAL e temporário.
 * Nada aqui chama IA nem toca rede.
 */
const dataDir = isolateDb('estudos-etapa2')
const work = fs.mkdtempSync(path.join(path.dirname(dataDir), 'rickos-git-'))
const bare = path.join(work, 'remote.git')
const seed = path.join(work, 'seed')
const other = path.join(work, 'other')

const g = (cwd: string, ...args: string[]): string =>
  execFileSync('git', ['-c', 'user.name=teste', '-c', 'user.email=teste@example.com', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8' }).trim()
const sha = (p: string): string => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')
// PNG 1×1 válido
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex')

/* eslint-disable @typescript-eslint/consistent-type-imports */
let repo: typeof import('../repo')
let git: typeof import('../git')
let adopt: typeof import('../adopt')
let att: typeof import('../attachments')
let bundle: typeof import('../bundle')
let originals: Record<string, string> = {}

before(async () => {
  fs.mkdirSync(bare)
  g(bare, 'init', '--quiet', '--bare', '-b', 'main')
  g(work, 'clone', '--quiet', bare, seed)
  const w = (p: string, c: string | Buffer): void => {
    fs.mkdirSync(path.dirname(path.join(seed, p)), { recursive: true })
    fs.writeFileSync(path.join(seed, p), c)
  }
  w('README.md', '# Meus estudos\n')
  w('notas/mandarim/aula-1.md', '# Aula 1: marcar encontro\n\n明天几点见面？ = a que horas nos vemos amanhã?\n\n![quadro da aula](../../img/quadro.png)\n\n![falta](nao-existe.png)\n')
  w('notas/mandarim/vocab.txt', '明天 míngtiān amanhã\n几点 jǐ diǎn que horas\nçãõ — acentos preservados\n')
  w('img/quadro.png', PNG)
  w('docs/outro.pdf', '%PDF-1.4 falso')
  g(seed, 'add', '-A')
  g(seed, 'commit', '--quiet', '-m', 'acervo antigo')
  g(seed, 'push', '--quiet', 'origin', 'main')
  for (const p of ['README.md', 'notas/mandarim/aula-1.md', 'notas/mandarim/vocab.txt', 'img/quadro.png', 'docs/outro.pdf']) originals[p] = sha(path.join(seed, p))
  repo = await import('../repo')
  git = await import('../git')
  adopt = await import('../adopt')
  att = await import('../attachments')
  bundle = await import('../bundle')
})

function cloneFresh(name: string): string {
  const d = path.join(work, name)
  fs.rmSync(d, { recursive: true, force: true })
  g(work, 'clone', '--quiet', bare, d)
  return d
}

let topicId = 0
let managedFolder = 'rickos-estudos'

describe('vincular repositório populado', () => {
  it('prévia: pasta padrão livre; pasta ocupada sugere outro destino', async () => {
    const p = await git.previewLink({ remote: bare, branch: 'main' })
    assert.equal(p.folder, 'rickos-estudos')
    assert.equal(p.folderState, 'free')
    assert.equal(p.branchExists, true)
    assert.equal(p.notesOutside, 3)
    const busy = await git.previewLink({ remote: bare, branch: 'main', folder: 'notas' })
    assert.equal(busy.folderState, 'occupied')
    assert.equal(busy.suggestion, 'notas-2')
    await assert.rejects(git.link({ remote: bare, branch: 'main', folder: 'notas', previewId: busy.previewId }), /ocupada/)
    await git.link({ remote: bare, branch: 'main', folder: p.folder, previewId: p.previewId })
    const st = await git.getStatus()
    assert.equal(st.linked, true)
    assert.equal(st.pending, false)
  })
})

describe('adotar acervo com prévia', () => {
  it('reconhecidos, ignorados, links faltantes; importa nota com imagem e acentos', async () => {
    const all = await adopt.previewAdopt('.', null)
    assert.ok(all.ignored.includes('docs/outro.pdf'))
    assert.ok(!all.ignored.includes('img/quadro.png')) // referenciada por uma nota
    const pv = await adopt.previewAdopt('notas/mandarim', null)
    assert.deepEqual(pv.recognized.map((f) => [f.path, f.status]), [
      ['notas/mandarim/aula-1.md', 'new'],
      ['notas/mandarim/vocab.txt', 'new']
    ])
    assert.deepEqual(pv.missingLinks, [{ path: 'notas/mandarim/aula-1.md', link: 'nao-existe.png' }])
    const decisions = Object.fromEntries(pv.recognized.map((f) => [f.path, 'create' as const]))
    const r = await adopt.applyAdopt({ subpath: 'notas/mandarim', topicId: null, newTopicName: 'Mandarim', mode: 'note', decisions })
    assert.deepEqual([r.created, r.images], [2, 1])
    topicId = r.topicId
    const { getAllStudyNotes } = await import('../../database/queries')
    const notes = (await getAllStudyNotes()).filter((n) => n.topicId === topicId)
    const aula = notes.find((n) => n.content.includes('明天几点见面'))!
    assert.match(aula.content, /!\[quadro da aula\]\(anexos\/[0-9a-f]{12}-quadro\.png\)/)
    assert.ok(aula.content.includes('![falta](nao-existe.png)')) // link faltante fica como estava
    assert.ok(notes.some((n) => n.content.includes('çãõ — acentos preservados')))
    const file = aula.content.match(/anexos\/([^)]+)\)/)![1]
    const a = await att.attachmentFile(file)
    assert.equal(sha(a!.file), originals['img/quadro.png'])
  })

  it('repetir a importação reconhece a origem e não duplica', async () => {
    const pv = await adopt.previewAdopt('notas/mandarim', topicId)
    assert.deepEqual(pv.recognized.map((f) => f.status), ['unchanged', 'unchanged'])
    const r = await adopt.applyAdopt({ subpath: 'notas/mandarim', topicId, mode: 'note', decisions: Object.fromEntries(pv.recognized.map((f) => [f.path, 'create' as const])) })
    assert.deepEqual([r.created, r.skipped], [0, 2])
  })
})

describe('Sincronizar', () => {
  it('commit e push por clique; originais intactos; links relativos e anexos no remoto', async () => {
    const c = await repo.createCard({ topicId, nodeId: null, front: '明天几点见面？', back: 'A que horas nos vemos amanhã?', reverse: true })
    await repo.reviewState(c.states[0].id, 'good')
    const r = await git.sync()
    assert.equal(r.status, 'pushed', JSON.stringify(r))
    assert.equal(r.committed, true)
    const remote = cloneFresh('check1')
    assert.equal(g(remote, 'log', '-1', '--format=%s'), git.COMMIT_MESSAGE)
    for (const [p, h] of Object.entries(originals)) assert.equal(sha(path.join(remote, p)), h, `original alterado: ${p}`)
    const manifest = JSON.parse(fs.readFileSync(path.join(remote, managedFolder, 'manifest.json'), 'utf8'))
    assert.equal(manifest.formato, 'rickos-estudos')
    assert.equal(manifest.versao, 1)
    assert.ok(manifest.vinculosExternos.length >= 2)
    const folder = manifest.topicos[0].pasta
    const notaMd = fs.readdirSync(path.join(remote, managedFolder, folder, 'notas')).map((f) => fs.readFileSync(path.join(remote, managedFolder, folder, 'notas', f), 'utf8')).join('\n')
    assert.match(notaMd, /\]\(\.\.\/\.\.\/anexos\/[0-9a-f]{12}-quadro\.png\)/)
    const img = manifest.anexos[0].arquivo
    assert.equal(sha(path.join(remote, managedFolder, 'anexos', img)), originals['img/quadro.png'])
    // só arquivos da pasta gerenciada no commit
    const changedFiles = g(remote, 'show', '--name-only', '--format=', 'HEAD').split('\n').filter(Boolean)
    assert.ok(changedFiles.every((f) => f.startsWith(`${managedFolder}/`)), changedFiles.join(', '))
  })

  it('sem diferença nem envio pendente → Tudo sincronizado (exportação determinística)', async () => {
    const r = await git.sync()
    assert.deepEqual([r.status, r.message, r.committed], ['synced', 'git.tudoSincronizado', false])
  })

  it('não inclui arquivo que alguém deixou staged no checkout', async () => {
    const dir = git.checkoutDir()
    fs.writeFileSync(path.join(dir, 'staged-alheio.txt'), 'não é do rickOS')
    g(dir, 'add', 'staged-alheio.txt')
    await repo.createCard({ topicId, nodeId: null, front: '你好', back: 'olá' })
    const r = await git.sync()
    assert.equal(r.status, 'pushed')
    const files = g(dir, 'show', '--name-only', '--format=', 'HEAD').split('\n').filter(Boolean)
    assert.ok(files.every((f) => f.startsWith(`${managedFolder}/`)), files.join(', '))
    assert.ok(g(dir, 'diff', '--cached', '--name-only').split('\n').includes('staged-alheio.txt')) // continua staged, intocado
  })

  it('falha de push: commit local salvo · envio pendente; nova tentativa envia sem novo commit', async () => {
    const moved = `${bare}-fora`
    fs.renameSync(bare, moved)
    await repo.createCard({ topicId, nodeId: null, front: '再见', back: 'tchau' })
    const r1 = await git.sync()
    assert.deepEqual([r1.status, r1.message, r1.committed], ['pending', 'git.envioPendente', true])
    const pendingCommit = r1.commit
    assert.equal((await git.getStatus()).pending, true)
    const r2 = await git.sync() // ainda fora: não cria commit novo, continua pendente
    assert.deepEqual([r2.status, r2.committed, r2.commit], ['pending', false, pendingCommit])
    fs.renameSync(moved, bare)
    const r3 = await git.sync()
    assert.deepEqual([r3.status, r3.committed], ['pushed', false])
    const remote = cloneFresh('check2')
    assert.equal(g(remote, 'rev-parse', 'HEAD'), pendingCommit)
    assert.equal((await git.getStatus()).pending, false)
  })

  it('upstream avançou fora da pasta gerenciada → fast-forward e segue', async () => {
    const o = cloneFresh('other')
    fs.writeFileSync(path.join(o, 'notas', 'novo.md'), '# novo\n')
    g(o, 'add', '-A')
    g(o, 'commit', '--quiet', '-m', 'nota nova fora do rickOS')
    g(o, 'push', '--quiet', 'origin', 'main')
    const r = await git.sync()
    assert.equal(r.status, 'synced')
    assert.ok(fs.existsSync(path.join(git.checkoutDir(), 'notas', 'novo.md')))
  })

  it('edição concorrente de arquivo gerenciado: mantém o repositório e guarda a versão do rickOS', async () => {
    const o = cloneFresh('other')
    const manifest = JSON.parse(fs.readFileSync(path.join(o, managedFolder, 'manifest.json'), 'utf8'))
    const readme = path.join(o, managedFolder, manifest.topicos[0].pasta, 'README.md')
    fs.writeFileSync(readme, fs.readFileSync(readme, 'utf8') + '\nEditado no GitHub.\n')
    g(o, 'commit', '--quiet', '-am', 'edição externa')
    g(o, 'push', '--quiet', 'origin', 'main')
    // banco sem mudança nesse arquivo: a edição externa fica
    const r1 = await git.sync()
    assert.equal(r1.status, 'synced')
    assert.deepEqual(r1.keptExternal, [`${manifest.topicos[0].pasta}/README.md`])
    // agora os dois lados mudam o mesmo arquivo
    await repo.updateTopic(topicId, { goal: 'Remarcar um encontro em mandarim' })
    const r2 = await git.sync()
    assert.equal(r2.status, 'divergent')
    assert.deepEqual(r2.conflicts, [`${manifest.topicos[0].pasta}/README.md`])
    const ours = fs.readFileSync(path.join(r2.divergenceDir!, manifest.topicos[0].pasta, 'README.md'), 'utf8')
    assert.ok(ours.includes('Remarcar um encontro'))
    const remote = cloneFresh('check3')
    const theirs = fs.readFileSync(path.join(remote, managedFolder, manifest.topicos[0].pasta, 'README.md'), 'utf8')
    assert.ok(theirs.includes('Editado no GitHub.'))
    assert.ok(!theirs.includes('Remarcar um encontro'))
  })

  it('clique duplo: duas chamadas simultâneas = uma execução', async () => {
    const [a, b] = await Promise.all([git.sync(), git.sync()])
    assert.equal(a, b)
  })
})

describe('restauração em instalação vazia', () => {
  it('restaura hierarquia, cartões com agenda SRS, logs, anexos e notas', async () => {
    const before = await repo.listCards({ topicId })
    const fwd = before.find((c) => c.front === '明天几点见面？')!.states.find((s) => s.direction === 'forward')!
    // "instalação vazia": apaga tudo de Estudos e os arquivos de anexo
    const { getDb } = await import('../../database/db')
    const db = await getDb()
    for (const t of ['study_attempts', 'study_questions', 'study_checkpoints', 'study_sources', 'study_review_log', 'study_card_states', 'study_flashcards', 'study_notes', 'study_nodes', 'study_origins', 'study_topics', 'study_attachments']) db.run(`DELETE FROM ${t}`)
    fs.rmSync(att.attachmentsDir(), { recursive: true, force: true })
    assert.equal((await repo.getLibrary()).length, 0)

    const report = await git.restoreFromRepo()
    assert.equal(report.created.length, 1)
    assert.equal(report.attachments, 1)
    const lib = await repo.getLibrary()
    assert.equal(lib[0].name, 'Mandarim')
    assert.equal(lib[0].goal, 'Remarcar um encontro em mandarim')
    const cards = await repo.listCards({ topicId: lib[0].id })
    const fwd2 = cards.find((c) => c.front === '明天几点见面？')!.states.find((s) => s.direction === 'forward')!
    assert.deepEqual([fwd2.easeFactor, fwd2.intervalDays, fwd2.repetitions, fwd2.nextReviewAt], [fwd.easeFactor, fwd.intervalDays, fwd.repetitions, fwd.nextReviewAt])
    assert.equal(cards.find((c) => c.front === '明天几点见面？')!.states.length, 2)
    const logs = db.exec('SELECT COUNT(*) FROM study_review_log')[0].values[0][0]
    assert.equal(logs, 1)
    const { getAllStudyNotes } = await import('../../database/queries')
    const aula = (await getAllStudyNotes()).find((n) => n.content.includes('明天几点见面'))!
    const file = aula.content.match(/anexos\/([^)]+)\)/)![1]
    const a = await att.attachmentFile(file)
    assert.equal(sha(a!.file), originals['img/quadro.png'])
    // restaurar de novo não duplica (uid do tópico)
    const again = await git.restoreFromRepo()
    assert.deepEqual([again.created.length, again.skipped.length], [0, 1])
    // ids preservados: a cópia restaurada é idêntica, nada a commitar; o README editado no GitHub
    // continua divergente (os dois lados preservados), nunca sobrescrito
    const r = await git.sync()
    assert.equal(r.committed, false, JSON.stringify(r))
    assert.equal(r.status, 'divergent')
    assert.equal(r.conflicts.length, 1)
    assert.ok(r.conflicts[0].endsWith('/README.md'))
    const remote = cloneFresh('check4')
    const readme = path.join(remote, managedFolder, r.conflicts[0])
    assert.ok(fs.readFileSync(readme, 'utf8').includes('Editado no GitHub.'))
  })

  it('exportação é determinística (mesmo banco → mesmos bytes)', async () => {
    const a = await bundle.exportAll()
    const b = await bundle.exportAll()
    assert.deepEqual(
      a.files.map((f) => [f.path, crypto.createHash('sha1').update(f.content).digest('hex')]),
      b.files.map((f) => [f.path, crypto.createHash('sha1').update(f.content).digest('hex')])
    )
  })
})
