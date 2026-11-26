import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import { CATALOGO_IA, type IdChamadaIa } from '../../../shared/prompts/catalogo'
import { renderizarTemplate, variaveisDoTemplate } from '../../../shared/prompts/definicao'

/**
 * GUARDRAIL (regra absoluta do CLAUDE.md): toda chamada de IA do app está no catálogo
 * (shared/prompts/catalogo.ts) e passa pelo gateway (server/ia/gateway.ts).
 *
 *  1. CLI/SDK de IA cru (runClaude, spawn do claude/codex, Gemini) só na camada de transporte;
 *  2. todo arquivo que usa a API do gateway está no MANIFESTO e cita (como string) os ids que usa;
 *  3. MANIFESTO e catálogo têm exatamente os mesmos ids (nada órfão, nada fora do catálogo).
 * Criou uma chamada? Definição em shared/prompts/<módulo>/ + catálogo + arquivo/id aqui.
 */
const ROOT = path.resolve(__dirname, '../../..')

/** Acesso cru a um CLI/SDK de IA. */
const CRUAS: RegExp[] = [/\brunClaude\(/, /\bgenerateContent\(/, /spawn\([^)]*(claude|codex)/i]

/** API do gateway (dispara uma chamada do catálogo). */
const ENTRADAS: RegExp[] = [
  /\bexecutarChamada\(/,
  /\bmontarChamada\(/,
  /\bcallAi\(/,
  /\bcompletar\(/,
  /window\.api\.ai\.(start|executar)\(/,
  /\brunJson(<[^(]*>)?\(/,
  /\brunText\(/,
  /iaChamadas\.montar\b/
]

/** Única camada que pode tocar CLI/SDK de IA diretamente. NÃO adicione arquivos para silenciar o teste. */
const TRANSPORTE = new Set([
  'server/services/claude.ts', // runClaude (usado pelo motor Claude Code)
  'server/ia/motores/claudeCode.ts', // motor Claude Code
  'server/ia/motores/codex.ts', // motor Codex
  'server/ia/gateway.ts', // o próprio gateway
  'server/aiconv/runner.ts', // CLI das conversas do Prompt Runner (system prompt vem do gateway: promptRunner.conversa)
  'server/aiconv/usageLimits.ts', // abre o Codex/Claude só para LER limites de uso; não envia prompt
  'server/services/news.ts', // SDK do Gemini (schema de resposta); prompt e modelo vêm do gateway
  'src/modules/projects/lib/ai.ts' // runJson / runText → ai:executar
])

/** Arquivo → chamadas do catálogo que ele dispara (cada id tem que aparecer no arquivo). */
const MANIFESTO: Record<string, IdChamadaIa[]> = {
  'src/modules/jarvis/pages/JarvisPage.tsx': ['assistente.livre', 'assistente.priorizar', 'assistente.revisarInbox', 'assistente.planejarSemana', 'assistente.roteiroViagem', 'assistente.resumoSemanal', 'assistente.checklistViagem'],
  // + canais genéricos ai:start / ai:executar / iaChamadas:montar, que executam as chamadas do front
  'server/rpc.ts': ['automacoes.agendado', 'inbox.ocr', 'promptRunner.conversa'],
  'server/aiconv/rpc.ts': ['promptRunner.mensagemCommit'],
  'src/modules/home/components/DailyStandup.tsx': ['home.briefing'],
  'src/modules/home/components/WeeklyReview.tsx': ['home.revisaoSemanal'],
  'src/modules/inbox/pages/InboxPage.tsx': ['inbox.classificar'],
  'src/modules/braindump/pages/BrainDumpPage.tsx': ['braindump.organizar'],
  'src/modules/estudos/components/NoteEditor.tsx': ['estudos.tutor'],
  'src/modules/estudos/components/FlashcardPanel.tsx': ['estudos.flashcards'],
  'src/modules/estudos/components/GapsModal.tsx': ['estudos.lacunas'],
  'src/modules/estudos/components/QuizModal.tsx': ['estudos.quiz'],
  'server/estudos/tutor.ts': ['estudos.masterclass', 'estudos.aula'],
  'src/modules/projects/pages/ProjectDetailPage.tsx': ['projetos.plano', 'projetos.ondePareiProjeto'],
  'src/modules/projects/components/NextActionModal.tsx': ['projetos.proximaAcao'],
  'src/modules/projects/components/SaveContextModal.tsx': ['projetos.ondePareiTimer'],
  'server/services/claudeHook.ts': ['projetos.ondePareiSessao'],
  'src/modules/projects/components/ClosingRitualModal.tsx': ['projetos.retrospectiva'],
  'src/modules/projects/components/ProgressModal.tsx': ['projetos.progresso'],
  'server/services/projectHub.ts': ['projetos.changelog'],
  'server/services/delegation.ts': ['projetos.delegacao', 'projetos.montarDelegacao'],
  // só montam texto que vai para o Prompt Runner (a execução é a da conversa)
  'src/modules/projects/lib/roadmap.ts': ['projetos.delegarRoadmap'],
  'src/modules/projects/git.ts': ['projetos.continuarBranch'],
  'server/services/github.ts': ['github.criarIssue'],
  'server/chats/ai.ts': ['mensagens.sugerir', 'mensagens.resumo'],
  'server/memory/ai.ts': ['memoria.extracaoTexto', 'memoria.extracaoAgente'],
  'server/memory/agent.ts': ['memoria.analise'],
  'server/memory/cognitive.ts': ['memoria.lacunas', 'memoria.entrevista'],
  'server/flights/ai.ts': ['passagens.criarMonitor', 'passagens.importarAlerta', 'passagens.analiseOfertas'],
  'server/flights/assisted.ts': ['passagens.skyscanner'],
  'src/modules/travel-stays/pages/StayFinderPage.tsx': ['viagens.hospedagem'],
  'src/modules/crm/pages/CrmPage.tsx': ['crm.retomarContato'],
  'server/services/news.ts': ['noticias.resumo']
}

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '__tests__' || e.name === 'evals' || e.name.startsWith('.')) continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p)
  }
  return out
}

const rel = (p: string): string => path.relative(ROOT, p).split(path.sep).join('/')
const ler = (f: string): string => fs.readFileSync(path.join(ROOT, f), 'utf8')

describe('guardrail: toda chamada de IA está no catálogo e passa pelo gateway', () => {
  const arquivos = [...walk(path.join(ROOT, 'server')), ...walk(path.join(ROOT, 'src'))].map(rel)

  it('CLI/SDK de IA cru só na camada de transporte', () => {
    const fora = arquivos.filter((f) => !TRANSPORTE.has(f) && CRUAS.some((re) => re.test(ler(f))))
    assert.deepEqual(fora, [], `Acesso cru a IA fora do gateway. Use executarChamada/montarChamada (server/ia/gateway.ts): ${fora.join(', ')}`)
  })

  it('todo arquivo que dispara IA está no MANIFESTO', () => {
    const faltando = arquivos.filter((f) => !TRANSPORTE.has(f) && !MANIFESTO[f] && ENTRADAS.some((re) => re.test(ler(f))))
    assert.deepEqual(faltando, [], `Chamada de IA fora do catálogo. Catalogue em shared/prompts/catalogo.ts e registre aqui: ${faltando.join(', ')}`)
  })

  it('cada arquivo do MANIFESTO cita os ids que declara', () => {
    const erros: string[] = []
    for (const [f, ids] of Object.entries(MANIFESTO)) {
      if (!fs.existsSync(path.join(ROOT, f))) {
        erros.push(`${f} não existe`)
        continue
      }
      const src = ler(f)
      for (const id of ids) if (!src.includes(`'${id}'`)) erros.push(`${f} não usa '${id}'`)
    }
    assert.deepEqual(erros, [])
  })

  it('MANIFESTO e catálogo têm exatamente os mesmos ids', () => {
    const catalogo = new Set(CATALOGO_IA.map((c) => c.id))
    const manifesto = new Set(Object.values(MANIFESTO).flat())
    assert.deepEqual([...manifesto].filter((id) => !catalogo.has(id)), [], 'id no MANIFESTO que não existe no catálogo')
    assert.deepEqual([...catalogo].filter((id) => !manifesto.has(id)), [], 'id do catálogo sem arquivo no MANIFESTO')
  })

  it('definições: ids únicos, exemplo monta e toda variável do template é preenchida', () => {
    const ids = CATALOGO_IA.map((c) => c.id)
    assert.equal(new Set(ids).size, ids.length)
    for (const c of CATALOGO_IA) {
      const vars = c.preparar(c.exemplo)
      const usadas = [...variaveisDoTemplate(c.sistema ?? ''), ...variaveisDoTemplate(c.template)]
      assert.deepEqual(usadas.filter((v) => !(v in vars)), [], `${c.id}: variável sem valor em preparar()`)
      const m = c.montar(c.exemplo)
      assert.ok(m.prompt.length > 0, c.id)
      assert.doesNotMatch(`${m.sistema ?? ''}${m.prompt}`, /\{\{\s*[a-zA-Z_]/, `${c.id}: sobrou {{variável}} no prompt montado`)
    }
  })

  it('prompt sobrescrito usa as mesmas variáveis e não reinterpreta os dados', () => {
    const c = CATALOGO_IA.find((x) => x.id === 'estudos.quiz')!
    const m = c.montar({ topico: 'T {{material}}', material: 'M' }, { template: 'Quiz de {{topico}}: {{material}} {{inexistente}}', sistema: null })
    assert.equal(m.prompt, 'Quiz de T {{material}}: M {{inexistente}}')
    assert.equal(renderizarTemplate('{{a}}{{ a }}', { a: '$&' }), '$&$&')
  })
})
