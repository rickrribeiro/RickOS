/**
 * Home → "Revisão semanal": relatório final (focos, plano por dia, decisão por projeto,
 * inbox/zumbis, hábitos, finanças). Recebe Memória Pessoal (`home.weekly_review`), anexada
 * pelo componente depois deste texto.
 * Usado em: src/modules/home/components/WeeklyReview.tsx. Modelo: `claude_model`.
 */
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
}

const list = (xs: string[]): string => xs.join('\n') || '(nenhum)'

export function promptRevisaoSemanal(p: DadosRevisaoSemanal): string {
  return `Você é meu chefe de gabinete fazendo minha REVISÃO SEMANAL. Com base no contexto abaixo, escreva o RELATÓRIO FINAL em Markdown, direto e honesto, com estas seções (curtas, sem repetir o contexto):
## 🎯 3 focos da semana
## 📅 Plano por dia (seg-dom, realista, encaixando os eventos)
## 🗂 Projetos — uma decisão por projeto aberto (continuar / pausar com condição de retomada / retomar / focar / concluir / encerrar) e o porquê em 1 linha; no máximo 3 em foco; aponte os estagnados
## 📥 Inbox e TODOs zumbis — ação curta para cada (virar tarefa com prazo, fazer agora, reescrever menor, reagendar ou matar)
## 🔥 Hábitos — o que vai bem, o mais frágil e 1 ajuste
## 💰 Finanças — estou no caminho? 1-2 sugestões
Omita uma seção se não houver dados. Não invente compromissos que não estão no contexto.

Contexto (hoje é ${p.hoje}):
Horas trabalhadas nos últimos 7 dias: ${Math.floor(p.minutosTrabalhados / 60)}h ${p.minutosTrabalhados % 60}m

Projetos:
${p.projetos || '(nenhum)'}

Inbox (${p.inbox.length}):
${list(p.inbox.map((t) => `- ${t}`))}

TODOs abertos há +14 dias (${p.zumbis.length}):
${list(p.zumbis.map((t) => `- ${t}`))}

Tarefas abertas (${p.totalAbertas}, as 20 mais prioritárias):
${list(p.abertas.map((t) => `- ${t.title}${t.dueDate ? ` (prazo ${t.dueDate})` : ''}`))}

Hábitos (últimos 7 dias):
${list(p.habitos)}

Finanças do mês ${p.mes}: receitas ${p.receitas.toFixed(0)} · gastos ${p.gastos.toFixed(0)} · orçamento ${p.orcamento.toFixed(0)}

Eventos dos próximos 7 dias:
${list(p.eventos.map((e) => `- ${e.title} (${e.startTime.slice(0, 16).replace('T', ' ')})`))}`
}
