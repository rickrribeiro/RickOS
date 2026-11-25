import { definirChamada, ex } from '../definicao'
import { anexo, CLAUDE_MODEL } from '../padroes'

/**
 * Assistente (Jarvis) → botões de ação rápida. Cada um só MONTA o texto, que vai para a
 * caixa do Assistente; o usuário revisa e executa (chamada `assistente.livre`).
 * "Planejar a semana" e "Roteiro de viagem" recebem Memória Pessoal no fim (`{{memoria}}`).
 * Usado em: src/modules/jarvis/pages/JarvisPage.tsx.
 */
const list = (items: string[]): string => items.map((t) => `- ${t}`).join('\n') || '(nenhum)'

export interface ViagemAssistente {
  destination: string
  startDate?: string | null
  endDate?: string | null
}

const base = { modulo: 'assistente', tipo: 'texto', motor: 'claude-code', modelo: CLAUDE_MODEL, effort: null, arquivo: 'assistente/acoesRapidas.ts', usadoEm: 'src/modules/jarvis/pages/JarvisPage.tsx' } as const
const viagemEx: ViagemAssistente = { destination: ex('destino'), startDate: ex('início'), endDate: ex('fim') }

export const assistentePriorizar = definirChamada<{ tarefas: string[] }>({
  ...base,
  id: 'assistente.priorizar',
  template: 'Você é meu assistente de produtividade. Priorize as tarefas abaixo (mais importante primeiro), explicando brevemente o porquê:\n\n{{tarefas}}',
  preparar: (p) => ({ tarefas: list(p.tarefas) }),
  exemplo: { tarefas: [ex('tarefa aberta')] }
})

export const assistenteRevisarInbox = definirChamada<{ itens: string[] }>({
  ...base,
  id: 'assistente.revisarInbox',
  template: 'Revise minha inbox e sugira, para cada item, se vira tarefa, projeto, viagem ou financeiro, e a próxima ação:\n\n{{itens}}',
  preparar: (p) => ({ itens: list(p.itens) }),
  exemplo: { itens: [ex('item do inbox')] }
})

export const assistentePlanejarSemana = definirChamada<{ tarefas: string[]; habitos: string[]; reunioes: string[]; memoria: string }>({
  ...base,
  id: 'assistente.planejarSemana',
  template: 'Monte um plano de semana equilibrado a partir de:\n\nTarefas abertas:\n{{tarefas}}\n\nHábitos:\n{{habitos}}\n\nReuniões:\n{{reunioes}}{{memoria}}',
  preparar: (p) => ({ tarefas: list(p.tarefas), habitos: list(p.habitos), reunioes: list(p.reunioes), memoria: anexo(p.memoria) }),
  exemplo: { tarefas: [ex('tarefa aberta')], habitos: [ex('hábito')], reunioes: [ex('reunião (data)')], memoria: ex('bloco de Memória Pessoal') }
})

export const assistenteRoteiroViagem = definirChamada<{ viagem: ViagemAssistente | null; memoria: string }>({
  ...base,
  id: 'assistente.roteiroViagem',
  template: '{{pedido}}{{memoria}}',
  preparar: (p) => ({
    pedido: p.viagem
      ? `Crie um roteiro para uma viagem a ${p.viagem.destination}${p.viagem.startDate ? ` (a partir de ${p.viagem.startDate})` : ''}.`
      : 'Sugira um destino de viagem para mim.',
    memoria: anexo(p.memoria)
  }),
  exemplo: { viagem: viagemEx, memoria: ex('bloco de Memória Pessoal') }
})

export const assistenteResumoSemanal = definirChamada<{ horas: string; concluidas: string[]; abertas: string[]; habitos: string[] }>({
  ...base,
  id: 'assistente.resumoSemanal',
  template: 'Faça um resumo da minha semana e sugira ajustes para a próxima.\n\nHoras trabalhadas: {{horas}}\n\nTarefas concluídas:\n{{concluidas}}\n\nTarefas em aberto:\n{{abertas}}\n\nHábitos monitorados:\n{{habitos}}',
  preparar: (p) => ({ horas: p.horas, concluidas: list(p.concluidas), abertas: list(p.abertas), habitos: list(p.habitos) }),
  exemplo: { horas: ex('horas'), concluidas: [ex('tarefa concluída')], abertas: [ex('tarefa aberta')], habitos: [ex('hábito')] }
})

export const assistenteChecklistViagem = definirChamada<{ viagem: ViagemAssistente | null }>({
  ...base,
  id: 'assistente.checklistViagem',
  template: '{{pedido}}',
  preparar: (p) => {
    const v = p.viagem
    return {
      pedido: v
        ? `Monte um checklist completo de preparação para a viagem a ${v.destination}${
            v.startDate ? ` (${v.startDate}${v.endDate ? ` a ${v.endDate}` : ''})` : ''
          }: documentos, bagagem, saúde/seguro, finanças/câmbio e itens específicos do destino.`
        : 'Monte um checklist genérico de preparação de viagem internacional (documentos, bagagem, saúde, finanças).'
    }
  },
  exemplo: { viagem: viagemEx }
})
