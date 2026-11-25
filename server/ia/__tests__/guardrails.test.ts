import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import { CATALOGO_IA, type IdChamadaIa } from '../../../shared/prompts/catalogo'

/**
 * GUARDRAIL (regra absoluta do CLAUDE.md): toda chamada de IA do app está no catálogo
 * (shared/prompts/catalogo.ts), que alimenta Configurações → IA → "Onde a IA é usada".
 *
 * Este teste quebra quando aparece uma chamada de IA nova que não foi catalogada:
 *  1. todo arquivo que usa uma primitiva de IA tem que estar em MANIFESTO;
 *  2. o MANIFESTO só pode citar ids que existem no catálogo;
 *  3. todo id do catálogo tem que estar no MANIFESTO (nada órfão).
 * Criou uma chamada? Adicione a entrada no catálogo E o arquivo/id aqui.
 */
const ROOT = path.resolve(__dirname, '../../..')

/** Primitivas que disparam IA (CLI do Claude/Codex, Gemini, RPCs de IA do front e helpers). */
const PRIMITIVAS: RegExp[] = [
  /\brunClaude\(/,
  /\bgenerateContent\(/,
  /window\.api\.ai\.(start|run|runStream)\(/,
  /\brunJson(<[^(]*>)?\(/,
  /\brunText\(/,
  /spawn\([^)]*(claude|codex)/i
]

/** Camada de transporte: executa IA para os outros, não é uma chamada em si. */
const TRANSPORTE = new Set([
  'server/services/claude.ts', // runClaude
  'server/ia/motores/claudeCode.ts', // motor Claude Code (factory em server/ia/motores)
  'server/ia/motores/codex.ts', // motor Codex
  'src/modules/projects/lib/ai.ts', // runJson / runText
  'server/aiconv/usageLimits.ts' // abre o Codex/Claude só para LER limites de uso; não envia prompt
])

/** Arquivo → chamadas do catálogo que ele dispara. */
const MANIFESTO: Record<string, IdChamadaIa[]> = {
  'src/modules/jarvis/pages/JarvisPage.tsx': ['assistente.livre', 'assistente.priorizar', 'assistente.revisarInbox', 'assistente.planejarSemana', 'assistente.roteiroViagem', 'assistente.resumoSemanal', 'assistente.checklistViagem'],
  'server/aiconv/runner.ts': ['promptRunner.conversa'],
  'server/aiconv/rpc.ts': ['promptRunner.mensagemCommit'],
  // + canais genéricos ai:run / ai:start / ai:runStream, que executam as chamadas do front
  'server/rpc.ts': ['automacoes.agendado', 'inbox.ocr'],
  'src/modules/home/components/DailyStandup.tsx': ['home.briefing'],
  'src/modules/home/components/WeeklyReview.tsx': ['home.revisaoSemanal'],
  'src/modules/inbox/pages/InboxPage.tsx': ['inbox.classificar'],
  'src/modules/braindump/pages/BrainDumpPage.tsx': ['braindump.organizar'],
  'src/modules/estudos/components/NoteEditor.tsx': ['estudos.tutor'],
  'src/modules/estudos/components/FlashcardPanel.tsx': ['estudos.flashcards'],
  'src/modules/estudos/components/GapsModal.tsx': ['estudos.lacunas'],
  'src/modules/estudos/components/QuizModal.tsx': ['estudos.quiz'],
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
  'server/memory/ai.ts': ['memoria.extracaoTexto', 'memoria.extracaoAgente', 'memoria.analise', 'memoria.lacunas', 'memoria.entrevista'],
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

describe('guardrail: toda chamada de IA está no catálogo', () => {
  const arquivos = [...walk(path.join(ROOT, 'server')), ...walk(path.join(ROOT, 'src'))]
  const comIa = arquivos.filter((f) => {
    const src = fs.readFileSync(f, 'utf8')
    return PRIMITIVAS.some((re) => re.test(src))
  })

  it('todo arquivo que chama IA está no MANIFESTO (ou é transporte)', () => {
    const faltando = comIa.map(rel).filter((f) => !TRANSPORTE.has(f) && !MANIFESTO[f])
    assert.deepEqual(faltando, [], `Chamada de IA fora do catálogo. Catalogue em shared/prompts/catalogo.ts e registre aqui: ${faltando.join(', ')}`)
  })

  it('arquivos do MANIFESTO existem', () => {
    const inexistentes = Object.keys(MANIFESTO).filter((f) => !fs.existsSync(path.join(ROOT, f)))
    assert.deepEqual(inexistentes, [])
  })

  it('MANIFESTO e catálogo têm exatamente os mesmos ids', () => {
    const catalogo = new Set(CATALOGO_IA.map((c) => c.id))
    const manifesto = new Set(Object.values(MANIFESTO).flat())
    assert.deepEqual([...manifesto].filter((id) => !catalogo.has(id)), [], 'id no MANIFESTO que não existe no catálogo')
    assert.deepEqual([...catalogo].filter((id) => !manifesto.has(id)), [], 'id do catálogo sem arquivo no MANIFESTO')
  })

  it('ids do catálogo são únicos e todo prompt de exemplo monta', () => {
    const ids = CATALOGO_IA.map((c) => c.id)
    assert.equal(new Set(ids).size, ids.length)
    for (const c of CATALOGO_IA) assert.ok(c.prompt().length > 10, c.id)
  })
})
