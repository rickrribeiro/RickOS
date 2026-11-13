import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import { parseTranscript } from '../transcripts'

/** Escreve um transcript .jsonl de teste e devolve o caminho. */
function writeTranscript(entries: unknown[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rickos-aiconv-'))
  const file = path.join(dir, 'sessao.jsonl')
  fs.writeFileSync(file, entries.map((e) => JSON.stringify(e)).join('\n') + '\n')
  return file
}

const user = (uuid: string, parentUuid: string | null, content: unknown, extra: Record<string, unknown> = {}): unknown => ({
  type: 'user',
  uuid,
  parentUuid,
  cwd: '/proj',
  timestamp: '2026-11-13T10:00:00.000Z',
  message: { role: 'user', content },
  ...extra
})
const assistant = (uuid: string, parentUuid: string, content: unknown[], usage?: Record<string, number>): unknown => ({
  type: 'assistant',
  uuid,
  parentUuid,
  message: { role: 'assistant', content, ...(usage ? { usage } : {}) }
})

describe('parseTranscript', () => {
  it('segue o ramo atual, liga resultados às ferramentas e mede o contexto', () => {
    const file = writeTranscript([
      { type: 'session-owner', sessionId: 's' },
      user('u1', null, 'primeira pergunta'),
      assistant('a1', 'u1', [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'ls' } }]),
      user('r1', 'a1', [{ type: 'tool_result', tool_use_id: 't1', content: 'a.txt\nb.txt' }]),
      assistant('a2', 'r1', [{ type: 'text', text: 'Dois arquivos.' }], { input_tokens: 10, cache_read_input_tokens: 1000, output_tokens: 5 }),
      // ramo abandonado (usuário editou a mensagem): não pode aparecer
      user('x1', 'a2', 'pergunta descartada'),
      assistant('x2', 'x1', [{ type: 'text', text: 'resposta descartada' }]),
      // ramo atual
      user('u2', 'a2', '<command-name>/compact</command-name><command-args></command-args>'),
      user('m1', 'u2', 'meta interna', { isMeta: true }),
      assistant('a3', 'm1', [
        { type: 'thinking', thinking: 'pensando…' },
        { type: 'text', text: 'Compactado.' }
      ], { input_tokens: 5, cache_read_input_tokens: 200, cache_creation_input_tokens: 50, output_tokens: 3 }),
      { type: 'ai-title', aiTitle: 'Listar arquivos', sessionId: 's' }
    ])

    const p = parseTranscript(file)
    assert.equal(p.title, 'Listar arquivos')
    assert.equal(p.cwd, '/proj')
    assert.deepEqual(
      p.turns.map((t) => t.prompt),
      ['primeira pergunta', '/compact']
    )
    const [t1, t2] = p.turns
    const tool = t1.blocks.find((b) => b.type === 'tool')
    assert.ok(tool && tool.type === 'tool')
    assert.equal(tool.result, 'a.txt\nb.txt')
    assert.equal(t1.contextTokens, 1015)
    assert.deepEqual(
      t2.blocks.map((b) => b.type),
      ['thinking', 'text']
    )
    assert.equal(p.contextTokens, 258)
    assert.ok(!JSON.stringify(p.turns).includes('descartada'))
  })

  it('rotula notificações de tarefa e resumo de compactação', () => {
    const file = writeTranscript([
      user('u1', null, 'Resumo...', { isCompactSummary: true }),
      assistant('a1', 'u1', [{ type: 'text', text: 'ok' }]),
      user('u2', 'a1', '<task-notification><summary>Build terminou</summary></task-notification>'),
      assistant('a2', 'u2', [{ type: 'text', text: 'visto' }])
    ])
    const p = parseTranscript(file)
    assert.match(p.turns[0].prompt, /resumo da conversa anterior/)
    assert.equal(p.turns[1].prompt, '🔔 Build terminou')
  })
})
