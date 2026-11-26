/**
 * Avaliação dos prompts pedagógicos com o CODEX REAL (gasta tokens). Sob demanda:
 *   npm run estudos:evals            → todos os casos
 *   npm run estudos:evals -- editorial subtopico   → só alguns
 * Usa um banco temporário isolado; nunca toca seus dados. Grava o relatório em
 * server/estudos/evals/ultimo-relatorio.md (modelo, effort, latência, tokens, rubricas e saídas).
 */
import fs from 'fs'
import os from 'os'
import path from 'path'

process.env.RICKOS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rickos-estudos-evals-'))

type Linha = { caso: string; operacao: string; modelo: string | null; effort: string | null; ms: number | null; tokens: string; status: string; checagens: { criterio: string; ok: boolean; detalhe: string }[]; saida: unknown }

async function main(): Promise<void> {
  const pedir = process.argv.slice(2)
  const quer = (k: string): boolean => !pedir.length || pedir.some((p) => k.includes(p))
  const repo = await import('../repo')
  const tutor = await import('../tutor')
  const material = await import('../material')
  const q = await import('../../database/queries')
  const casos = await import('./casos')
  const r = await import('./rubricas')
  const { VERSAO_PEDAGOGIA } = await import('../../../shared/prompts/estudos/pedagogia/textos')
  const linhas: Linha[] = []

  const esperar = async (id: number): Promise<import('../tutor').RunRow> => {
    for (;;) {
      const run = (await tutor.listRuns({ limit: 50 })).find((x) => x.id === id)!
      if (run.status !== 'running') return run
      await new Promise((res) => setTimeout(res, 1000))
    }
  }
  const linha = (caso: string, run: import('../tutor').RunRow, checagens: Linha['checagens'], saida: unknown): Linha => ({
    caso,
    operacao: run.operation,
    modelo: run.model,
    effort: run.effort,
    ms: run.durationMs,
    tokens: `${run.inputTokens ?? '?'} in / ${run.outputTokens ?? '?'} out`,
    status: run.status + (run.error ? ` (${run.error})` : ''),
    checagens,
    saida
  })

  for (const caso of [casos.CASO_BACKEND, casos.CASO_MANDARIM]) {
    if (!quer(caso.id)) continue
    const t = await repo.createTopic(caso.topico)
    console.log(`→ ${caso.id}…`)
    const run = await esperar((await tutor.startMasterclass(t.id, caso.pedido)).id)
    const plano = (await tutor.listPlans(t.id))[0]
    const m = plano ? JSON.parse(plano.content) : null
    const tipo = 'kind' in caso.topico && caso.topico.kind === 'language' ? 'idioma' : 'engenharia'
    linhas.push(linha(caso.id, run, m ? [...r.rubricaMasterclass(m, caso.termos, caso.escala), ...r.rubricaAbertura(m.aberturaPrimeiraAula, tipo)] : [], m))
  }

  // continuidade: masterclass → aprovar → abertura → dúvida → follow-up que cita o fim da resposta
  const { read, one } = await import('../sql')
  const semMd = (x: string): string => x.replace(/[*_`#>]/g, '').replace(/\s+/g, ' ')
  const ctx = await import('../contexto')
  for (const caso of [casos.CASO_TRAMA, casos.CASO_MANDARIM_AULA]) {
    if (!quer(caso.id)) continue
    const t = await repo.createTopic(caso.topico)
    console.log(`→ ${caso.id}: masterclass…`)
    const mrun = await esperar((await tutor.startMasterclass(t.id, caso.pedido)).id)
    const plano = (await tutor.listPlans(t.id)).find((p) => p.status === 'proposed')
    if (!plano) {
      linhas.push(linha(caso.id, mrun, [], null))
      continue
    }
    const m = JSON.parse(plano.content)
    const { lessonId } = await tutor.approvePlan(plano.id)
    const aberta = await tutor.getLesson(lessonId!)
    linhas.push(linha(`${caso.id} · abertura`, mrun, [...r.rubricaMasterclass(m, caso.termos, caso.escala), ...r.rubricaAbertura(m.aberturaPrimeiraAula, caso.tipo)], {
      mapa: m.partes.map((p: { titulo: string; modulos: { titulo: string }[] }) => `${p.titulo}: ${p.modulos.map((x) => x.titulo).join(' | ')}`),
      jaSei: m.jaSei,
      restricoes: m.restricoes,
      decisoesEmAberto: m.decisoesEmAberto,
      primeiroTurno: aberta.turns[0]?.content ?? null
    }))
    const enviar = async (texto: string, chave: string): Promise<{ run: import('../tutor').RunRow; resposta: string; contextoChars: number; contexto: string }> => {
      // o contexto que vai ao provedor neste turno = turnos já salvos (antes do meu)
      const antes = await tutor.getLesson(lessonId!)
      const ctxReal = await read((db) => ctx.contextoAula(db, one<import('../repo').TopicRow>(db, 'SELECT * FROM study_topics WHERE id = ?', [t.id])!, antes.lesson, antes.turns))
      const run = await esperar((await tutor.sendTurn(lessonId!, texto, chave)).id)
      const depois = await tutor.getLesson(lessonId!)
      const ult = depois.turns.at(-1)!
      return { run, resposta: ult.role === 'tutor' ? ult.content : '', contextoChars: ctxReal.length, contexto: ctxReal }
    }
    console.log(`→ ${caso.id}: dúvida…`)
    const t1 = await enviar(caso.duvida, `eval-${caso.id}-1`.slice(0, 60))
    linhas.push(linha(`${caso.id} · turno 1 (dúvida)`, t1.run, r.rubricaTurno(t1.resposta, caso.deve), { eu: caso.duvida, contextoChars: t1.contextoChars, tutor: t1.resposta }))
    // follow-up: cita a última frase afirmativa da resposta anterior
    const frases = t1.resposta.replace(/\n+/g, ' ').split(/(?<=[.!。])\s+/).map((x) => x.trim()).filter((x) => x.length >= 30 && !/[?？]$/.test(x))
    const citado = (frases.at(-1) ?? t1.resposta.slice(-160)).replace(/[*_`#>]/g, '').slice(0, 180)
    const followup = caso.tipo === 'idioma' ? `Sobre o que você disse no final ("${citado}"): e se meu amigo responder que sábado também não dá?` : `Sobre o que você disse no final ("${citado}"): como isso fica no celular de cada um dos oito jogadores?`
    console.log(`→ ${caso.id}: follow-up…`)
    const t2 = await enviar(followup, `eval-${caso.id}-2`.slice(0, 60))
    linhas.push(linha(`${caso.id} · turno 2 (follow-up)`, t2.run, [
      ...r.rubricaTurno(t2.resposta, {}, { citado }),
      { criterio: 'o trecho citado chegou ao provedor (contexto do turno 2)', ok: semMd(t2.contexto).includes(semMd(citado).slice(-60)), detalhe: `${t2.contextoChars} caracteres de contexto` },
      { criterio: 'o briefing chegou ao provedor', ok: t2.contexto.includes(caso.pedido), detalhe: 'pedido original no contexto' }
    ], { eu: followup, contextoChars: t2.contextoChars, tutor: t2.resposta }))
  }

  if (quer(casos.CASO_EDITORIAL.id)) {
    const t = await repo.createTopic({ name: 'Redes', goal: 'entender TCP vs UDP para jogos' })
    await q.saveStudyNote(t.id, null, casos.CASO_EDITORIAL.nota)
    console.log(`→ ${casos.CASO_EDITORIAL.id}…`)
    const run = await esperar((await material.reviewNote(t.id, null)).id)
    const sec = (await material.getMaterial(t.id, null)).sections.find((s) => s.section === 'revisaoEditorial')
    const saida = sec ? JSON.parse(sec.content) : { itens: [], vazio: null }
    linhas.push(linha(casos.CASO_EDITORIAL.id, run, r.rubricaEditorial(saida.itens, casos.CASO_EDITORIAL.nota, casos.CASO_EDITORIAL.maxItens), saida))
  }

  if (quer(casos.CASO_SUBTOPICO.id)) {
    const t = await repo.createTopic({ name: 'Mandarim', kind: 'language', targetLanguage: 'zh', goal: 'conseguir remarcar um encontro em mandarim' })
    const ids = new Map<number, number>()
    for (const n of casos.CASO_SUBTOPICO.nos) ids.set(n.id, (await q.createStudyNode(t.id, n.parentId == null ? null : ids.get(n.parentId)!, n.title, null, null)).id)
    const alvo = ids.get(4)!
    await q.saveStudyNote(t.id, alvo, casos.CASO_SUBTOPICO.nota)
    console.log(`→ ${casos.CASO_SUBTOPICO.id}…`)
    const run = await esperar((await material.suggestSubtopics(t.id, alvo)).id)
    const sec = (await material.getMaterial(t.id, alvo)).sections.find((s) => s.section === 'subtopicos')
    const saida = sec ? JSON.parse(sec.content) : { itens: [], vazio: null }
    linhas.push(linha(casos.CASO_SUBTOPICO.id, run, r.rubricaSubtopicos(saida.itens, { ...casos.CASO_SUBTOPICO.esperado, parentId: ids.get(2)! }, casos.CASO_SUBTOPICO.nos.map((n) => n.title)), saida))
  }

  const md = [
    `# Avaliação dos prompts de Estudos (Codex real)`,
    '',
    `- Versão dos prompts: \`${VERSAO_PEDAGOGIA}\``,
    `- Data: ${new Date().toISOString()}`,
    '',
    '| Caso | Operação | Modelo / effort | Latência | Tokens | Status | Rubricas |',
    '|---|---|---|---|---|---|---|',
    ...linhas.map((l) => `| ${l.caso} | ${l.operacao} | ${l.modelo}/${l.effort} | ${l.ms != null ? (l.ms / 1000).toFixed(1) + ' s' : '—'} | ${l.tokens} | ${l.status} | ${l.checagens.filter((c) => c.ok).length}/${l.checagens.length} |`),
    '',
    ...linhas.flatMap((l) => [
      `## ${l.caso}`,
      '',
      ...l.checagens.map((c) => `- ${c.ok ? '✅' : '❌'} ${c.criterio} — ${c.detalhe}`),
      '',
      '<details><summary>Saída</summary>',
      '',
      '```json',
      JSON.stringify(l.saida, null, 2),
      '```',
      '',
      '</details>',
      ''
    ])
  ].join('\n')
  const out = path.join(__dirname, pedir.length ? `ultimo-relatorio-${pedir.join('-')}.md` : 'ultimo-relatorio.md')
  fs.writeFileSync(out, md)
  console.log(md.split('\n').slice(0, 12).join('\n'))
  console.log(`\nrelatório: ${out}`)
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
