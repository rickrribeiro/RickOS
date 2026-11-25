/**
 * Catálogo de TODAS as chamadas de IA do rickOS: motor, modelo, effort e o prompt montado
 * com dados de exemplo (marcadores «…»). Mostrado em Configurações → IA → "Onde a IA é usada".
 *
 * Mudou/criou uma chamada de IA? Atualize a entrada aqui (e o nome em
 * src/i18n/locales/<idioma>/settings.ts, chave `settings.iaChamada.<id>`).
 */
import { promptChecklistViagem, promptPlanejarSemana, promptPriorizarTarefas, promptResumoSemanal, promptRevisarInbox, promptRoteiroViagem } from './assistente/acoesRapidas'
import { promptOrganizarBrainDump } from './braindump/organizar'
import { SUFIXO_RESPOSTA_JSON } from './comum/respostaJson'
import { promptRetomarContato } from './crm/retomarContato'
import { promptFlashcards } from './estudos/flashcards'
import { promptLacunasRoadmap } from './estudos/lacunasRoadmap'
import { promptQuiz } from './estudos/quiz'
import { INSTRUCOES_TUTOR, promptTutor } from './estudos/tutor'
import { promptCriarIssue } from './github/criarIssue'
import { promptBriefingMatinal } from './home/briefingMatinal'
import { promptRevisaoSemanal } from './home/revisaoSemanal'
import { promptClassificarInbox } from './inbox/classificarProjetos'
import { promptOcrImagem } from './inbox/ocrImagem'
import { promptAnaliseMemoria, SISTEMA_ANALISE_MEMORIA } from './memoria/analise'
import { blocoFatosMemoria } from './memoria/blocoContexto'
import { promptEntrevistaMemoria, sistemaEntrevistaMemoria } from './memoria/entrevista'
import { promptExtracaoMemoria, SISTEMA_EXTRACAO_MEMORIA } from './memoria/extracao'
import { promptLacunasMemoria, sistemaLacunasMemoria } from './memoria/lacunas'
import { promptResumoConversa } from './mensagens/resumo'
import { ESTILOS_RESPOSTA, SISTEMA_MENSAGENS } from './mensagens/sistema'
import { promptSugerirRespostas } from './mensagens/sugerirRespostas'
import { MODELO_NOTICIAS, promptResumoNoticias } from './noticias/resumoCategoria'
import { promptAnaliseOfertas } from './passagens/analiseOfertas'
import { promptConsultaSkyscanner } from './passagens/consultaSkyscanner'
import { promptCriarMonitor } from './passagens/criarMonitor'
import { promptImportarAlerta } from './passagens/importarAlerta'
import { promptChangelog } from './projetos/changelog'
import { promptContextoProjeto } from './projetos/contextoProjeto'
import { promptContinuarBranch } from './projetos/continuarBranch'
import { promptDelegacao } from './projetos/delegacao'
import { promptDelegarRoadmap } from './projetos/delegarRoadmap'
import { promptMontarDelegacao } from './projetos/montarPromptDelegacao'
import { promptOndePareiProjeto } from './projetos/ondePareiProjeto'
import { promptOndePareiSessao } from './projetos/ondePareiSessao'
import { promptOndePareiTimer } from './projetos/ondePareiTimer'
import { promptPlanoProjeto } from './projetos/plano'
import { promptProximaAcao } from './projetos/proximaAcao'
import { promptResumoProgresso } from './projetos/resumoProgresso'
import { promptResumoProjeto } from './projetos/resumoProjeto'
import { promptRetrospectiva } from './projetos/retrospectiva'
import { promptMensagemCommit } from './promptRunner/mensagemCommit'
import { promptSistemaConversa } from './promptRunner/sistemaConversa'
import { promptAnaliseHospedagem } from './viagens/analiseHospedagem'

export type MotorIa = 'claude-code' | 'codex' | 'gemini'

export type ModuloIa =
  | 'assistente'
  | 'promptRunner'
  | 'automacoes'
  | 'home'
  | 'inbox'
  | 'braindump'
  | 'estudos'
  | 'projetos'
  | 'github'
  | 'mensagens'
  | 'memoria'
  | 'passagens'
  | 'viagens'
  | 'crm'
  | 'noticias'

/** Valor configurável: lido de `setting` (Configurações) e, se vazio, `padrao`. `padrao: ''` = padrão do CLI/conta. */
export interface ConfigIa {
  setting?: string
  padrao: string
}

export type IdChamadaIa =
  | 'assistente.livre'
  | 'assistente.priorizar'
  | 'assistente.revisarInbox'
  | 'assistente.planejarSemana'
  | 'assistente.roteiroViagem'
  | 'assistente.resumoSemanal'
  | 'assistente.checklistViagem'
  | 'promptRunner.conversa'
  | 'promptRunner.mensagemCommit'
  | 'automacoes.agendado'
  | 'home.briefing'
  | 'home.revisaoSemanal'
  | 'inbox.ocr'
  | 'inbox.classificar'
  | 'braindump.organizar'
  | 'estudos.tutor'
  | 'estudos.flashcards'
  | 'estudos.lacunas'
  | 'estudos.quiz'
  | 'projetos.plano'
  | 'projetos.proximaAcao'
  | 'projetos.ondePareiProjeto'
  | 'projetos.ondePareiTimer'
  | 'projetos.ondePareiSessao'
  | 'projetos.retrospectiva'
  | 'projetos.progresso'
  | 'projetos.changelog'
  | 'projetos.delegacao'
  | 'projetos.montarDelegacao'
  | 'projetos.delegarRoadmap'
  | 'projetos.continuarBranch'
  | 'github.criarIssue'
  | 'mensagens.sugerir'
  | 'mensagens.resumo'
  | 'memoria.extracaoTexto'
  | 'memoria.extracaoAgente'
  | 'memoria.analise'
  | 'memoria.lacunas'
  | 'memoria.entrevista'
  | 'passagens.criarMonitor'
  | 'passagens.importarAlerta'
  | 'passagens.analiseOfertas'
  | 'passagens.skyscanner'
  | 'viagens.hospedagem'
  | 'crm.retomarContato'
  | 'noticias.resumo'

export interface ChamadaIa {
  id: IdChamadaIa
  modulo: ModuloIa
  motor: MotorIa
  modelo: ConfigIa
  /** null = não envia `--effort` (usa o padrão do CLI/conta). */
  effort: ConfigIa | null
  /** Arquivo(s) do prompt em shared/prompts/ (null = texto do próprio usuário). */
  arquivo: string | null
  usadoEm: string
  /** Prompt montado com dados de exemplo. O system prompt, quando existe, vem primeiro. */
  prompt: () => string
}

const m = (s: string): string => `«${s}»`
const sistema = (sys: string, prompt: string): string => `━━ SYSTEM PROMPT ━━\n${sys}\n\n━━ PROMPT ━━\n${prompt}`

const CLAUDE_MODEL: ConfigIa = { setting: 'claude_model', padrao: '' }
const RUNNER_MODEL: ConfigIa = { setting: 'prompt_runner_model', padrao: 'opus' }
const RUNNER_EFFORT: ConfigIa = { setting: 'prompt_runner_effort', padrao: 'medium' }
const MEM_FAST: ConfigIa = { setting: 'memory_ai_model_fast', padrao: 'haiku' }
const MEM_MAIN: ConfigIa = { setting: 'memory_ai_model', padrao: 'sonnet' }
const FLIGHTS: ConfigIa = { setting: 'flights_ai_model', padrao: 'haiku' }
const CHATS: ConfigIa = { setting: 'chats_ai_model', padrao: 'sonnet' }

const EX_PROJETO = promptResumoProjeto({
  p: { name: m('projeto'), area: m('área'), description: m('descrição'), finishLine: m('linha de chegada'), scope: m('escopo'), futureIdeas: null, nextAction: m('próxima ação'), whereLeftOff: m('onde parei'), whereLeftOffAt: '2026-01-01', blocker: null, blockerNeed: null },
  situacao: m('situação'),
  estagio: m('estágio'),
  horas: { total: m('horas'), ultimos7d: m('horas 7d'), ultimaAtividade: m('data') },
  marcos: [{ title: m('marco'), doneAt: null, targetDate: m('data') }],
  tarefas: [{ title: m('tarefa'), done: false }],
  commits: [{ date: '2026-01-01', subject: m('commit') }],
  sessoes: [{ startTime: '2026-01-01', title: m('sessão no timer') }],
  eventos: [{ createdAt: '2026-01-01', kind: m('tipo'), text: m('evento'), fromStatus: null, toStatus: null }]
})
const EX_CTX_PROJETO = promptContextoProjeto({ nome: m('projeto'), descricao: m('descrição'), githubUrl: m('URL do GitHub'), slug: null, pastaLocal: m('pasta local'), workspace: null })
const EX_PROJ_DELEG = { name: m('projeto'), description: m('descrição'), finishLine: m('linha de chegada'), scope: null, whereLeftOff: m('onde parei') }
const EX_MEMORIA = blocoFatosMemoria({ finalidade: m('finalidade'), linhas: [m('memória relevante')] })
const EX_MENSAGENS = `<mensagens>\n${JSON.stringify([{ id: 'm1', de: m('pessoa'), quando: m('data'), texto: m('mensagem') }], null, 1)}\n</mensagens>`
const viagem = { destination: m('destino'), startDate: m('início'), endDate: m('fim') }
const json = (p: string): string => `${p}${SUFIXO_RESPOSTA_JSON}`

export const CATALOGO_IA: ChamadaIa[] = [
  // ── Assistente ──
  { id: 'assistente.livre', modulo: 'assistente', motor: 'claude-code', modelo: CLAUDE_MODEL, effort: null, arquivo: 'projetos/contextoProjeto.ts', usadoEm: 'src/modules/jarvis/pages/JarvisPage.tsx', prompt: () => `${EX_CTX_PROJETO}${m('seu pedido')}` },
  { id: 'assistente.priorizar', modulo: 'assistente', motor: 'claude-code', modelo: CLAUDE_MODEL, effort: null, arquivo: 'assistente/acoesRapidas.ts', usadoEm: 'src/modules/jarvis/pages/JarvisPage.tsx', prompt: () => promptPriorizarTarefas({ tarefas: [m('tarefa aberta')] }) },
  { id: 'assistente.revisarInbox', modulo: 'assistente', motor: 'claude-code', modelo: CLAUDE_MODEL, effort: null, arquivo: 'assistente/acoesRapidas.ts', usadoEm: 'src/modules/jarvis/pages/JarvisPage.tsx', prompt: () => promptRevisarInbox({ itens: [m('item do inbox')] }) },
  { id: 'assistente.planejarSemana', modulo: 'assistente', motor: 'claude-code', modelo: CLAUDE_MODEL, effort: null, arquivo: 'assistente/acoesRapidas.ts', usadoEm: 'src/modules/jarvis/pages/JarvisPage.tsx', prompt: () => `${promptPlanejarSemana({ tarefas: [m('tarefa aberta')], habitos: [m('hábito')], reunioes: [m('reunião (data)')] })}\n\n${EX_MEMORIA}` },
  { id: 'assistente.roteiroViagem', modulo: 'assistente', motor: 'claude-code', modelo: CLAUDE_MODEL, effort: null, arquivo: 'assistente/acoesRapidas.ts', usadoEm: 'src/modules/jarvis/pages/JarvisPage.tsx', prompt: () => `${promptRoteiroViagem({ viagem })}\n\n${EX_MEMORIA}` },
  { id: 'assistente.resumoSemanal', modulo: 'assistente', motor: 'claude-code', modelo: CLAUDE_MODEL, effort: null, arquivo: 'assistente/acoesRapidas.ts', usadoEm: 'src/modules/jarvis/pages/JarvisPage.tsx', prompt: () => promptResumoSemanal({ horas: m('horas'), concluidas: [m('tarefa concluída')], abertas: [m('tarefa aberta')], habitos: [m('hábito')] }) },
  { id: 'assistente.checklistViagem', modulo: 'assistente', motor: 'claude-code', modelo: CLAUDE_MODEL, effort: null, arquivo: 'assistente/acoesRapidas.ts', usadoEm: 'src/modules/jarvis/pages/JarvisPage.tsx', prompt: () => promptChecklistViagem({ viagem }) },

  // ── Prompt Runner / Automações ──
  {
    id: 'promptRunner.conversa', modulo: 'promptRunner', motor: 'claude-code', modelo: RUNNER_MODEL, effort: RUNNER_EFFORT, arquivo: 'promptRunner/sistemaConversa.ts', usadoEm: 'server/aiconv/runner.ts',
    prompt: () => sistema(promptSistemaConversa({ contextoProjeto: EX_CTX_PROJETO, agente: { name: m('agente'), systemPrompt: m('system prompt do agente') }, skills: [{ name: m('skill'), content: m('conteúdo da skill') }] }), m('sua mensagem'))
  },
  { id: 'promptRunner.mensagemCommit', modulo: 'promptRunner', motor: 'claude-code', modelo: { padrao: 'haiku' }, effort: null, arquivo: 'promptRunner/mensagemCommit.ts', usadoEm: 'server/aiconv/rpc.ts', prompt: () => promptMensagemCommit({ contexto: m('diff e commits recentes') }) },
  { id: 'automacoes.agendado', modulo: 'automacoes', motor: 'claude-code', modelo: CLAUDE_MODEL, effort: null, arquivo: null, usadoEm: 'server/rpc.ts (runScheduledJobs)', prompt: () => m('prompt do job, definido em Automações') },

  // ── Home / Inbox / Braindump ──
  { id: 'home.briefing', modulo: 'home', motor: 'claude-code', modelo: CLAUDE_MODEL, effort: null, arquivo: 'home/briefingMatinal.ts', usadoEm: 'src/modules/home/components/DailyStandup.tsx', prompt: () => promptBriefingMatinal({ contexto: m('tarefas, flashcards, eventos, horas de ontem, projetos e foco do dia') }) },
  {
    id: 'home.revisaoSemanal', modulo: 'home', motor: 'claude-code', modelo: CLAUDE_MODEL, effort: null, arquivo: 'home/revisaoSemanal.ts', usadoEm: 'src/modules/home/components/WeeklyReview.tsx',
    prompt: () => `${promptRevisaoSemanal({ hoje: m('hoje'), mes: m('mês'), minutosTrabalhados: 0, projetos: m('resumo dos projetos'), inbox: [m('item do inbox')], zumbis: [m('TODO antigo')], totalAbertas: 1, abertas: [{ title: m('tarefa'), dueDate: m('prazo') }], habitos: [`- ${m('hábito')}: 5/7`], receitas: 0, gastos: 0, orcamento: 0, eventos: [{ title: m('evento'), startTime: '2026-01-01T09:00' }] })}\n\n${EX_MEMORIA}`
  },
  { id: 'inbox.ocr', modulo: 'inbox', motor: 'claude-code', modelo: CLAUDE_MODEL, effort: null, arquivo: 'inbox/ocrImagem.ts', usadoEm: 'server/rpc.ts (inbox:ocr)', prompt: () => promptOcrImagem({ arquivo: m('caminho da imagem') }) },
  { id: 'inbox.classificar', modulo: 'inbox', motor: 'claude-code', modelo: CLAUDE_MODEL, effort: null, arquivo: 'inbox/classificarProjetos.ts', usadoEm: 'src/modules/inbox/pages/InboxPage.tsx', prompt: () => json(promptClassificarInbox({ projetos: [{ id: 1, name: m('projeto'), description: m('descrição') }], itens: [{ id: 10, title: m('item'), notes: m('notas') }] })) },
  { id: 'braindump.organizar', modulo: 'braindump', motor: 'claude-code', modelo: CLAUDE_MODEL, effort: null, arquivo: 'braindump/organizar.ts', usadoEm: 'src/modules/braindump/pages/BrainDumpPage.tsx', prompt: () => promptOrganizarBrainDump({ hoje: m('hoje'), despejo: m('seu despejo mental') }) },

  // ── Estudos ──
  {
    id: 'estudos.tutor', modulo: 'estudos', motor: 'claude-code', modelo: CLAUDE_MODEL, effort: null, arquivo: 'estudos/tutor.ts', usadoEm: 'src/modules/estudos/components/NoteEditor.tsx',
    prompt: () => Object.entries(INSTRUCOES_TUTOR).map(([k, v]) => `━━ ${k} ━━\n${promptTutor({ instrucao: v, conteudo: m('anotação') })}`).join('\n\n')
  },
  { id: 'estudos.flashcards', modulo: 'estudos', motor: 'claude-code', modelo: CLAUDE_MODEL, effort: null, arquivo: 'estudos/flashcards.ts', usadoEm: 'src/modules/estudos/components/FlashcardPanel.tsx', prompt: () => promptFlashcards({ anotacao: m('anotação') }) },
  { id: 'estudos.lacunas', modulo: 'estudos', motor: 'claude-code', modelo: CLAUDE_MODEL, effort: null, arquivo: 'estudos/lacunasRoadmap.ts', usadoEm: 'src/modules/estudos/components/GapsModal.tsx', prompt: () => promptLacunasRoadmap({ topico: m('tópico'), roadmap: m('roadmap em tópicos') }) },
  { id: 'estudos.quiz', modulo: 'estudos', motor: 'claude-code', modelo: CLAUDE_MODEL, effort: null, arquivo: 'estudos/quiz.ts', usadoEm: 'src/modules/estudos/components/QuizModal.tsx', prompt: () => promptQuiz({ topico: m('tópico'), material: m('anotações do tópico') }) },

  // ── Projetos ──
  { id: 'projetos.plano', modulo: 'projetos', motor: 'claude-code', modelo: CLAUDE_MODEL, effort: null, arquivo: 'projetos/plano.ts', usadoEm: 'src/modules/projects/pages/ProjectDetailPage.tsx', prompt: () => json(promptPlanoProjeto({ hoje: m('hoje'), contexto: EX_PROJETO })) },
  { id: 'projetos.proximaAcao', modulo: 'projetos', motor: 'claude-code', modelo: CLAUDE_MODEL, effort: null, arquivo: 'projetos/proximaAcao.ts', usadoEm: 'src/modules/projects/components/NextActionModal.tsx', prompt: () => json(promptProximaAcao({ acaoConcluida: m('ação concluída (só ao concluir)'), contexto: EX_PROJETO })) },
  { id: 'projetos.ondePareiProjeto', modulo: 'projetos', motor: 'claude-code', modelo: CLAUDE_MODEL, effort: null, arquivo: 'projetos/ondePareiProjeto.ts', usadoEm: 'src/modules/projects/pages/ProjectDetailPage.tsx', prompt: () => promptOndePareiProjeto({ contexto: EX_PROJETO }) },
  { id: 'projetos.ondePareiTimer', modulo: 'projetos', motor: 'claude-code', modelo: CLAUDE_MODEL, effort: null, arquivo: 'projetos/ondePareiTimer.ts', usadoEm: 'src/modules/projects/components/SaveContextModal.tsx', prompt: () => promptOndePareiTimer({ minutos: 45, tarefa: m('tarefa do timer'), contexto: EX_PROJETO }) },
  { id: 'projetos.ondePareiSessao', modulo: 'projetos', motor: 'claude-code', modelo: { setting: 'projects_hook_model', padrao: 'haiku' }, effort: null, arquivo: 'projetos/ondePareiSessao.ts', usadoEm: 'server/services/claudeHook.ts', prompt: () => promptOndePareiSessao({ projeto: m('projeto'), branch: m('branch'), pedidos: `1. ${m('pedido')}`, respostas: `- ${m('resposta do Claude')}`, commits: m('commits'), naoCommitados: m('arquivos') }) },
  { id: 'projetos.retrospectiva', modulo: 'projetos', motor: 'claude-code', modelo: CLAUDE_MODEL, effort: null, arquivo: 'projetos/retrospectiva.ts', usadoEm: 'src/modules/projects/components/ClosingRitualModal.tsx', prompt: () => promptRetrospectiva({ foiBem: m('foi bem'), aprendi: m('aprendi'), fariaDiferente: m('faria diferente'), contexto: EX_PROJETO }) },
  { id: 'projetos.progresso', modulo: 'projetos', motor: 'claude-code', modelo: CLAUDE_MODEL, effort: null, arquivo: 'projetos/resumoProgresso.ts', usadoEm: 'src/modules/projects/components/ProgressModal.tsx', prompt: () => promptResumoProgresso({ periodo: 'week', repos: [m('owner/repo')] }) },
  { id: 'projetos.changelog', modulo: 'projetos', motor: 'claude-code', modelo: CLAUDE_MODEL, effort: null, arquivo: 'projetos/changelog.ts', usadoEm: 'server/services/projectHub.ts', prompt: () => promptChangelog({ ciclo: m('ciclo'), projeto: m('projeto'), objetivo: m('objetivo'), commits: `- ${m('data')} ${m('commit')}`, totalCommits: 1 }) },
  { id: 'projetos.delegacao', modulo: 'projetos', motor: 'claude-code', modelo: CLAUDE_MODEL, effort: null, arquivo: 'projetos/delegacao.ts', usadoEm: 'server/services/delegation.ts', prompt: () => promptDelegacao({ projeto: EX_PROJ_DELEG, tarefa: m('tarefa'), instrucoes: m('instruções'), branch: m('branch'), base: m('base'), reposWorkspace: null }) },
  { id: 'projetos.montarDelegacao', modulo: 'projetos', motor: 'claude-code', modelo: CLAUDE_MODEL, effort: null, arquivo: 'projetos/montarPromptDelegacao.ts', usadoEm: 'server/services/delegation.ts', prompt: () => promptMontarDelegacao({ projeto: EX_PROJ_DELEG, tarefa: m('tarefa'), instrucoes: m('instruções'), pasta: m('pasta do repositório') }) },
  {
    id: 'projetos.delegarRoadmap', modulo: 'projetos', motor: 'claude-code', modelo: RUNNER_MODEL, effort: RUNNER_EFFORT, arquivo: 'projetos/delegarRoadmap.ts', usadoEm: 'src/modules/projects/lib/roadmap.ts → Prompt Runner',
    prompt: () => {
      const r = promptDelegarRoadmap([{ node: { num: 12, text: m('item do roadmap'), mark: ' ', version: null, priority: null }, area: m('área'), feature: m('feature'), parent: null }])
      return `${r.task}\n\n${r.instructions}`
    }
  },
  {
    id: 'projetos.continuarBranch', modulo: 'projetos', motor: 'claude-code', modelo: RUNNER_MODEL, effort: RUNNER_EFFORT, arquivo: 'projetos/continuarBranch.ts', usadoEm: 'src/modules/projects/git.ts → Prompt Runner',
    prompt: () => promptContinuarBranch({ repoName: m('repo'), repoPath: m('pasta'), branch: m('branch'), ahead: 2, behind: 0 }, { commits: [{ hash: 'abc123', subject: m('commit') }], files: [{ status: 'M', path: m('arquivo') }] }, m('base'), m('tempo'))
  },
  { id: 'github.criarIssue', modulo: 'github', motor: 'claude-code', modelo: { padrao: '' }, effort: null, arquivo: 'github/criarIssue.ts', usadoEm: 'server/services/github.ts', prompt: () => promptCriarIssue({ repo: m('owner/repo'), titulo: m('título'), corpo: m('corpo') }) },

  // ── Mensagens ──
  {
    id: 'mensagens.sugerir', modulo: 'mensagens', motor: 'claude-code', modelo: CHATS, effort: null, arquivo: 'mensagens/sistema.ts, mensagens/sugerirRespostas.ts', usadoEm: 'server/chats/ai.ts',
    prompt: () => sistema(SISTEMA_MENSAGENS, promptSugerirRespostas({ conversa: `com ${m('pessoa')}`, rede: m('rede'), contextoPessoa: m('notas da pessoa (só com opt-in)'), estilo: ESTILOS_RESPOSTA.natural, idioma: null, preferenciasEscrita: m('preferências de escrita'), pedidoExtra: null, modelo: null, mensagens: EX_MENSAGENS, alvosPorMensagem: null }))
  },
  { id: 'mensagens.resumo', modulo: 'mensagens', motor: 'claude-code', modelo: CHATS, effort: null, arquivo: 'mensagens/sistema.ts, mensagens/resumo.ts', usadoEm: 'server/chats/ai.ts', prompt: () => sistema(SISTEMA_MENSAGENS, promptResumoConversa({ conversa: `com ${m('pessoa')}`, rede: m('rede'), contextoPessoa: null, mensagens: EX_MENSAGENS })) },

  // ── Memória Pessoal ──
  {
    id: 'memoria.extracaoTexto', modulo: 'memoria', motor: 'claude-code', modelo: MEM_MAIN, effort: null, arquivo: 'memoria/extracao.ts', usadoEm: 'server/memory/agent.ts (texto livre, importação, migração)',
    prompt: () => sistema(SISTEMA_EXTRACAO_MEMORIA, promptExtracaoMemoria({ contexto: null, categorias: m('categorias permitidas'), memorias: `#1 ${m('memória parecida')}`, rejeitadas: m('sugestões rejeitadas'), origem: 'text', texto: m('seu texto'), max: 10 }))
  },
  {
    id: 'memoria.extracaoAgente', modulo: 'memoria', motor: 'claude-code', modelo: MEM_FAST, effort: null, arquivo: 'memoria/extracao.ts', usadoEm: 'server/memory/agent.ts (produtores de outros módulos, respostas de lacunas)',
    prompt: () => sistema(SISTEMA_EXTRACAO_MEMORIA, promptExtracaoMemoria({ contexto: m('contexto'), categorias: m('categorias permitidas'), memorias: '', rejeitadas: m('sugestões rejeitadas'), origem: 'producer', texto: m('texto do módulo'), max: 5 }))
  },
  {
    id: 'memoria.analise', modulo: 'memoria', motor: 'claude-code', modelo: MEM_MAIN, effort: null, arquivo: 'memoria/analise.ts', usadoEm: 'server/memory/agent.ts (analisar e consolidar)',
    prompt: () => sistema(SISTEMA_ANALISE_MEMORIA, promptAnaliseMemoria({ categorias: m('categorias permitidas'), memorias: `#1 [${m('categoria')} · FACT] ${m('memória')}`, rejeitadas: m('sugestões rejeitadas'), max: 10 }))
  },
  {
    id: 'memoria.lacunas', modulo: 'memoria', motor: 'claude-code', modelo: MEM_FAST, effort: null, arquivo: 'memoria/lacunas.ts', usadoEm: 'server/memory/cognitive.ts',
    prompt: () => sistema(sistemaLacunasMemoria(5), promptLacunasMemoria({ cobertura: `- ${m('categoria')}: ${m('n')} ativas`, funcionalidades: `- ${m('funcionalidade')}`, memorias: `- [${m('categoria')}] ${m('memória')}`, abertas: '', dispensadas: '' }))
  },
  {
    id: 'memoria.entrevista', modulo: 'memoria', motor: 'claude-code', modelo: MEM_FAST, effort: null, arquivo: 'memoria/entrevista.ts', usadoEm: 'server/memory/cognitive.ts',
    prompt: () => sistema(sistemaEntrevistaMemoria(5), promptEntrevistaMemoria({ tema: m('tema'), categoria: '', categoriasPermitidas: m('categorias'), memorias: '', perguntasFeitas: '', respostas: `P: ${m('pergunta')}\nR: ${m('resposta')}`, respondeu: true, temTurnos: true }))
  },

  // ── Passagens / Viagens ──
  { id: 'passagens.criarMonitor', modulo: 'passagens', motor: 'claude-code', modelo: FLIGHTS, effort: null, arquivo: 'passagens/criarMonitor.ts', usadoEm: 'server/flights/ai.ts', prompt: () => promptCriarMonitor({ hoje: m('hoje'), moeda: 'BRL', pedido: m('seu pedido') }) },
  { id: 'passagens.importarAlerta', modulo: 'passagens', motor: 'claude-code', modelo: FLIGHTS, effort: null, arquivo: 'passagens/importarAlerta.ts', usadoEm: 'server/flights/ai.ts', prompt: () => promptImportarAlerta({ hoje: m('hoje'), texto: m('texto do alerta') }) },
  { id: 'passagens.analiseOfertas', modulo: 'passagens', motor: 'claude-code', modelo: FLIGHTS, effort: null, arquivo: 'passagens/analiseOfertas.ts', usadoEm: 'server/flights/ai.ts', prompt: () => promptAnaliseOfertas({ monitor: m('monitor'), linhas: m('ofertas, uma por linha') }) },
  {
    id: 'passagens.skyscanner', modulo: 'passagens', motor: 'claude-code', modelo: { setting: 'flights_chrome_model', padrao: 'sonnet' }, effort: null, arquivo: 'passagens/consultaSkyscanner.ts', usadoEm: 'server/flights/assisted.ts',
    prompt: () => promptConsultaSkyscanner({ adultos: 1, moeda: 'BRL', bagagemDespachada: true, combinacoes: [{ origin: 'GRU', destination: 'LIS', depart: m('ida'), ret: m('volta'), url: m('URL do Skyscanner') }] })
  },
  { id: 'viagens.hospedagem', modulo: 'viagens', motor: 'claude-code', modelo: CLAUDE_MODEL, effort: null, arquivo: 'viagens/analiseHospedagem.ts', usadoEm: 'src/modules/travel-stays/pages/StayFinderPage.tsx', prompt: () => promptAnaliseHospedagem({ memoria: EX_MEMORIA, observacoes: m('observações'), cidade: m('cidade'), resultados: `1. ${m('hospedagem')}` }) },

  // ── CRM / Notícias ──
  { id: 'crm.retomarContato', modulo: 'crm', motor: 'claude-code', modelo: CLAUDE_MODEL, effort: null, arquivo: 'crm/retomarContato.ts', usadoEm: 'src/modules/crm/pages/CrmPage.tsx', prompt: () => promptRetomarContato({ nome: m('nome'), local: m('local'), interesses: m('interesses'), ultimaConversa: m('data'), contexto: m('contexto') }) },
  { id: 'noticias.resumo', modulo: 'noticias', motor: 'gemini', modelo: { padrao: MODELO_NOTICIAS }, effort: null, arquivo: 'noticias/resumoCategoria.ts', usadoEm: 'server/services/news.ts', prompt: () => promptResumoNoticias({ data: m('data'), categoria: m('categoria'), maxTopicos: 6, memoria: EX_MEMORIA, manchetes: `[1] ${m('manchete')} (${m('fonte')})\nURL: ${m('url')}` }) }
]
