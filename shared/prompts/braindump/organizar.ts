import { definirChamada, ex } from '../definicao'
import { CLAUDE_MODEL } from '../padroes'

/**
 * Brain dump → transforma o "despejo mental" em tarefas, projetos, próximos passos e agenda (JSON).
 * Usado em: src/modules/braindump/pages/BrainDumpPage.tsx.
 */
export const braindumpOrganizar = definirChamada<{ hoje: string; despejo: string }>({
  id: 'braindump.organizar',
  modulo: 'braindump',
  tipo: 'executa',
  motor: 'claude-code',
  modelo: CLAUDE_MODEL,
  effort: null,
  arquivo: 'braindump/organizar.ts',
  usadoEm: 'src/modules/braindump/pages/BrainDumpPage.tsx',
  template: `Você é meu organizador pessoal. Abaixo está um "despejo mental" — tudo que está na minha cabeça agora, desorganizado. Transforme em um plano acionável.

Responda APENAS com um JSON válido (sem markdown, sem comentários, sem texto fora do JSON), exatamente neste formato:
{
  "tasks": [{ "title": string, "notes": string|null, "priority": 0|1|2|3, "dueDate": "YYYY-MM-DD"|null }],
  "projects": [{ "name": string, "description": string|null }],
  "nextSteps": [string],
  "calendar": [{ "title": string, "date": "YYYY-MM-DD", "time": "HH:MM"|null, "durationMin": number|null }]
}

Regras:
- Títulos curtos e acionáveis, começando com um verbo.
- priority: 3 = alta, 0 = nenhuma.
- Hoje é {{hoje}}; use como referência para prazos e sugestões de agenda.
- "nextSteps": 3 a 5 primeiros passos concretos para começar já.
- "calendar": sugira blocos/eventos com data (e horário/duração quando fizer sentido).
- Agrupe temas grandes em "projects"; itens soltos viram "tasks".
- Se alguma seção não se aplica, use lista vazia.

Despejo mental:
"""
{{despejo}}
"""`,
  preparar: (p) => ({ hoje: p.hoje, despejo: p.despejo }),
  exemplo: { hoje: ex('hoje'), despejo: ex('seu despejo mental') }
})
