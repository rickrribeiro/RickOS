import { definirChamada, ex } from '../definicao'
import { ALT_CODEX, CLAUDE_MODEL, anexo } from '../padroes'

export interface DadosRevisaoSemanal {
  hoje: string
  mes: string
  minutosTrabalhados: number
  /** Resumo textual dos projetos (`projectsDigest`). */
  projetos: string
  /** Títulos. */
  inbox: string[]
  /** Títulos dos TODOs abertos há +14 dias. */
  zumbis: string[]
  totalAbertas: number
  /** As 20 tarefas abertas mais prioritárias. */
  abertas: { title: string; dueDate: string | null }[]
  /** Uma linha por hábito: `- Nome: n/7`. */
  habitos: string[]
  receitas: number
  gastos: number
  orcamento: number
  eventos: { title: string; startTime: string }[]
  /** Bloco de Memória Pessoal (vazio = sem). */
  memoria: string
}

/**
 * Home → "Revisão semanal": relatório final (focos, plano por dia, decisão por projeto,
 * inbox/zumbis, hábitos, finanças). Recebe Memória Pessoal (`home.weekly_review`) em `{{memoria}}`.
 * Usado em: src/modules/home/components/WeeklyReview.tsx.
 */
export const homeRevisaoSemanal = definirChamada<DadosRevisaoSemanal>({
  id: 'home.revisaoSemanal',
  modulo: 'home',
  tipo: 'executa',
  motor: 'claude-code',
  modelo: CLAUDE_MODEL,
  effort: null,
  alternativas: ALT_CODEX,
  arquivo: 'home/revisaoSemanal.ts',
  usadoEm: 'src/modules/home/components/WeeklyReview.tsx',
  template: `Você é meu chefe de gabinete fazendo minha REVISÃO SEMANAL. Com base no contexto abaixo, escreva o RELATÓRIO FINAL em Markdown, direto e honesto, com estas seções (curtas, sem repetir o contexto):
## 🎯 3 focos da semana
## 📅 Plano por dia (seg-dom, realista, encaixando os eventos)
## 🗂 Projetos — uma decisão por projeto aberto (continuar / pausar com condição de retomada / retomar / focar / concluir / encerrar) e o porquê em 1 linha; no máximo 3 em foco; aponte os estagnados
## 📥 Inbox e TODOs zumbis — ação curta para cada (virar tarefa com prazo, fazer agora, reescrever menor, reagendar ou matar)
## 🔥 Hábitos — o que vai bem, o mais frágil e 1 ajuste
## 💰 Finanças — estou no caminho? 1-2 sugestões
Omita uma seção se não houver dados. Não invente compromissos que não estão no contexto.

Contexto (hoje é {{hoje}}):
Horas trabalhadas nos últimos 7 dias: {{horas}}h {{minutos}}m

Projetos:
{{projetos}}

Inbox ({{qtdInbox}}):
{{inbox}}

TODOs abertos há +14 dias ({{qtdZumbis}}):
{{zumbis}}

Tarefas abertas ({{qtdAbertas}}, as 20 mais prioritárias):
{{abertas}}

Hábitos (últimos 7 dias):
{{habitos}}

Finanças do mês {{mes}}: receitas {{receitas}} · gastos {{gastos}} · orçamento {{orcamento}}

Eventos dos próximos 7 dias:
{{eventos}}{{memoria}}`,
  preparar: (p) => {
    const list = (xs: string[]): string => xs.join('\n') || '(nenhum)'
    return {
      hoje: String(p.hoje),
      horas: String(Math.floor(p.minutosTrabalhados / 60)),
      minutos: String(p.minutosTrabalhados % 60),
      projetos: String(p.projetos || '(nenhum)'),
      qtdInbox: String(p.inbox.length),
      inbox: String(list(p.inbox.map((t) => `- ${t}`))),
      qtdZumbis: String(p.zumbis.length),
      zumbis: String(list(p.zumbis.map((t) => `- ${t}`))),
      qtdAbertas: String(p.totalAbertas),
      abertas: String(list(p.abertas.map((t) => `- ${t.title}${t.dueDate ? ` (prazo ${t.dueDate})` : ''}`))),
      habitos: String(list(p.habitos)),
      mes: String(p.mes),
      receitas: String(p.receitas.toFixed(0)),
      gastos: String(p.gastos.toFixed(0)),
      orcamento: String(p.orcamento.toFixed(0)),
      memoria: anexo(p.memoria),
      eventos: String(list(p.eventos.map((e) => `- ${e.title} (${e.startTime.slice(0, 16).replace('T', ' ')})`)))
    }
  },
  exemplo: { hoje: ex('hoje'), mes: ex('mês'), minutosTrabalhados: 0, projetos: ex('resumo dos projetos'), inbox: [ex('item do inbox')], zumbis: [ex('TODO antigo')], totalAbertas: 1, abertas: [{ title: ex('tarefa'), dueDate: ex('prazo') }], habitos: [`- ${ex('hábito')}: 5/7`], receitas: 0, gastos: 0, orcamento: 0, eventos: [{ title: ex('evento'), startTime: '2026-01-01T09:00' }], memoria: ex('bloco de Memória Pessoal') }
})
