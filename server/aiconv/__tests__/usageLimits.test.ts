import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseResetTime, parseUsageOutput } from '../usageLimits'

const SAMPLE = `You are currently using your subscription to power your Claude Code usage

Current session: 13% used · resets Nov 14 at 8:09pm (Asia/Tokyo)
Current week (all models): 95% used · resets Nov 16 at 10am (Asia/Tokyo)
Current week (Fable): 0% used · resets Nov 16 at 9:59am (Asia/Tokyo)

What's contributing to your usage?
Last 24h · 2444 requests · 41 sessions
  71%  Start fresh when you switch tasks · run /clear`

describe('parseUsageOutput', () => {
  const now = new Date('2026-11-14T07:00:00Z') // 16h em Tóquio

  it('lê a janela de 5 horas e as semanais', () => {
    const l = parseUsageOutput(SAMPLE, now)
    assert.equal(l.length, 3)
    assert.deepEqual(
      l.map((x) => [x.kind, x.scope, x.percent]),
      [
        ['session', null, 13],
        ['week', 'all models', 95],
        ['week', 'Fable', 0]
      ]
    )
    assert.equal(l[0].resetsAt, '2026-11-14T11:09:00.000Z')
    assert.equal(l[1].resetsAt, '2026-11-16T01:00:00.000Z')
    assert.equal(l[1].resetsText, 'Nov 16 at 10am (Asia/Tokyo)')
  })

  it('ignora o resto do texto', () => {
    assert.deepEqual(parseUsageOutput('Last 24h · 71% Start fresh', now), [])
  })
})

describe('parseResetTime', () => {
  it('só a hora → próxima ocorrência', () => {
    assert.equal(parseResetTime('3pm (America/Sao_Paulo)', new Date('2026-11-14T19:00:00Z')), '2026-11-15T18:00:00.000Z')
  })
  it('virada de ano', () => {
    assert.equal(parseResetTime('Jan 2 at 9am (UTC)', new Date('2026-12-30T00:00:00Z')), '2027-01-02T09:00:00.000Z')
  })
  it('texto desconhecido → null', () => {
    assert.equal(parseResetTime('amanhã cedo'), null)
  })
})
