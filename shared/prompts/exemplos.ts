import { blocoFatosMemoria } from './memoria/blocoContexto'
import { promptContextoProjeto } from './projetos/contextoProjeto'
import { promptResumoProjeto } from './projetos/resumoProjeto'
import { ex } from './definicao'

/** Dados de exemplo reaproveitados pelas definições (aparecem em Configurações → IA). */
export const EX_PROJETO = promptResumoProjeto({
  p: { name: ex('projeto'), area: ex('área'), description: ex('descrição'), finishLine: ex('linha de chegada'), scope: ex('escopo'), futureIdeas: null, nextAction: ex('próxima ação'), whereLeftOff: ex('onde parei'), whereLeftOffAt: '2026-01-01', blocker: null, blockerNeed: null },
  situacao: ex('situação'),
  estagio: ex('estágio'),
  horas: { total: ex('horas'), ultimos7d: ex('horas 7d'), ultimaAtividade: ex('data') },
  marcos: [{ title: ex('marco'), doneAt: null, targetDate: ex('data') }],
  tarefas: [{ title: ex('tarefa'), done: false }],
  commits: [{ date: '2026-01-01', subject: ex('commit') }],
  sessoes: [{ startTime: '2026-01-01', title: ex('sessão no timer') }],
  eventos: [{ createdAt: '2026-01-01', kind: ex('tipo'), text: ex('evento'), fromStatus: null, toStatus: null }]
})

export const EX_CTX_PROJETO = promptContextoProjeto({ nome: ex('projeto'), descricao: ex('descrição'), githubUrl: ex('URL do GitHub'), slug: null, pastaLocal: ex('pasta local'), workspace: null })

export const EX_MEMORIA = blocoFatosMemoria({ finalidade: ex('finalidade'), linhas: [ex('memória relevante')] })

export const EX_MENSAGENS = `<mensagens>\n${JSON.stringify([{ id: 'm1', de: ex('pessoa'), quando: ex('data'), texto: ex('mensagem') }], null, 1)}\n</mensagens>`
