/**
 * Avaliação da EXTRAÇÃO com o LLM real (Claude Code CLI local). Sob demanda:
 *
 *   npm run memory:evals            # todos os casos
 *   npm run memory:evals -- atom    # só casos cujo nome contém "atom"
 *
 * Roda num banco TEMPORÁRIO (nunca no seu), usa ~1 chamada por caso e imprime um placar.
 * Critérios: memórias esperadas encontradas, nada proibido, teto de sugestões respeitado,
 * operações esperadas (UPDATE/RESOLVE em contradições) e inferências marcadas como tal.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

process.env.RICKOS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rickos-memory-evals-'))

async function main(): Promise<void> {
  const repo = await import('../repo')
  const agent = await import('../agent')
  const sug = await import('../suggestions')
  const { getDb } = await import('../../database/db')
  const { setSetting } = await import('../../database/queries')
  const { EXTRACTION_CASES, FIXTURE } = await import('./cases')
  const filter = process.argv[2]?.toLowerCase()
  await setSetting('memory_max_llm_calls_day', '100')
  const rows: { name: string; ok: boolean; notes: string[]; n: number }[] = []

  for (const c of EXTRACTION_CASES.filter((x) => !filter || x.name.toLowerCase().includes(filter))) {
    const db = await getDb()
    for (const t of ['memory_evidence', 'memory_suggestions', 'memory_feedback', 'memory_revisions', 'memories']) db.run(`DELETE FROM ${t}`)
    const cats = await repo.listCategories('me')
    for (const k of c.existing ?? []) {
      const f = FIXTURE.find((x) => x.key === k)!
      await repo.createMemory('me', { ...f, categoryId: cats.find((x) => x.slug === f.category)!.id })
    }
    const notes: string[] = []
    let n = 0
    try {
      await agent.extractFromText({ useCase: 'memory.text', text: c.text, sourceKind: 'text', op: 'texto' })
      const list = await sug.listSuggestions('me', { status: 'all' })
      n = list.length
      const text = (s: (typeof list)[number]): string => `${s.proposed?.content ?? ''} ${s.question ?? ''}`.toLowerCase()
      for (const group of c.expected) if (!list.some((s) => group.some((w) => text(s).includes(w.toLowerCase())))) notes.push(`faltou: ${group.join('/')}`)
      for (const w of c.forbidden) if (list.some((s) => text(s).includes(w.toLowerCase()))) notes.push(`proibido apareceu: ${w}`)
      if (c.maxSuggestions != null && list.filter((s) => s.op !== 'ASK').length > c.maxSuggestions) notes.push(`sugestões demais: ${n} > ${c.maxSuggestions}`)
      if (c.ops && !list.some((s) => c.ops!.includes(s.op))) notes.push(`esperava operação ${c.ops.join('/')} (veio ${list.map((s) => s.op).join(', ') || 'nada'})`)
      for (const w of c.inferred ?? []) {
        const hit = list.find((s) => text(s).includes(w.toLowerCase()))
        if (hit && hit.reliability !== 'inferred') notes.push(`"${w}" devia ser inferência`)
      }
      for (const s of list) if (s.op !== 'ASK' && s.evidence.length === 0) notes.push(`sugestão #${s.id} sem evidência`)
    } catch (e) {
      notes.push(`erro: ${e instanceof Error ? e.message : String(e)}`)
    }
    rows.push({ name: c.name, ok: notes.length === 0, notes, n })
    console.log(`${notes.length ? '✖' : '✔'} ${c.name} (${n} sugestões)${notes.length ? `\n    ${notes.join('\n    ')}` : ''}`)
  }
  const passed = rows.filter((r) => r.ok).length
  console.log(`\nPlacar: ${passed}/${rows.length} casos`)
  process.exitCode = passed === rows.length ? 0 : 1
}

void main()
