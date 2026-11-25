/**
 * Assistente (Jarvis) → botões de ação rápida. O texto vai para o Assistente, que roda o
 * Claude com o contexto do projeto (se houver). "Planejar a semana" e "Roteiro de viagem"
 * recebem Memória Pessoal, anexada pelo componente depois deste texto.
 * Usado em: src/modules/jarvis/pages/JarvisPage.tsx. Modelo: `claude_model`.
 */
const list = (items: string[]): string => items.map((t) => `- ${t}`).join('\n') || '(nenhum)'

export interface ViagemAssistente {
  destination: string
  startDate?: string | null
  endDate?: string | null
}

export function promptPriorizarTarefas(p: { tarefas: string[] }): string {
  return `Você é meu assistente de produtividade. Priorize as tarefas abaixo (mais importante primeiro), explicando brevemente o porquê:\n\n${list(p.tarefas)}`
}

export function promptRevisarInbox(p: { itens: string[] }): string {
  return `Revise minha inbox e sugira, para cada item, se vira tarefa, projeto, viagem ou financeiro, e a próxima ação:\n\n${list(p.itens)}`
}

export function promptPlanejarSemana(p: { tarefas: string[]; habitos: string[]; reunioes: string[] }): string {
  return `Monte um plano de semana equilibrado a partir de:\n\nTarefas abertas:\n${list(p.tarefas)}\n\nHábitos:\n${list(p.habitos)}\n\nReuniões:\n${list(p.reunioes)}`
}

export function promptRoteiroViagem(p: { viagem: ViagemAssistente | null }): string {
  return p.viagem
    ? `Crie um roteiro para uma viagem a ${p.viagem.destination}${p.viagem.startDate ? ` (a partir de ${p.viagem.startDate})` : ''}.`
    : 'Sugira um destino de viagem para mim.'
}

export function promptResumoSemanal(p: { horas: string; concluidas: string[]; abertas: string[]; habitos: string[] }): string {
  return `Faça um resumo da minha semana e sugira ajustes para a próxima.\n\nHoras trabalhadas: ${p.horas}\n\nTarefas concluídas:\n${list(p.concluidas)}\n\nTarefas em aberto:\n${list(p.abertas)}\n\nHábitos monitorados:\n${list(p.habitos)}`
}

export function promptChecklistViagem(p: { viagem: ViagemAssistente | null }): string {
  const v = p.viagem
  return v
    ? `Monte um checklist completo de preparação para a viagem a ${v.destination}${
        v.startDate ? ` (${v.startDate}${v.endDate ? ` a ${v.endDate}` : ''})` : ''
      }: documentos, bagagem, saúde/seguro, finanças/câmbio e itens específicos do destino.`
    : 'Monte um checklist genérico de preparação de viagem internacional (documentos, bagagem, saúde, finanças).'
}
