/**
 * Brain dump → transforma o "despejo mental" em tarefas, projetos, próximos passos e agenda (JSON).
 * Usado em: src/modules/braindump/pages/BrainDumpPage.tsx. Modelo: `claude_model`.
 */
export function promptOrganizarBrainDump(p: { hoje: string; despejo: string }): string {
  return `Você é meu organizador pessoal. Abaixo está um "despejo mental" — tudo que está na minha cabeça agora, desorganizado. Transforme em um plano acionável.

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
- Hoje é ${p.hoje}; use como referência para prazos e sugestões de agenda.
- "nextSteps": 3 a 5 primeiros passos concretos para começar já.
- "calendar": sugira blocos/eventos com data (e horário/duração quando fizer sentido).
- Agrupe temas grandes em "projects"; itens soltos viram "tasks".
- Se alguma seção não se aplica, use lista vazia.

Despejo mental:
"""
${p.despejo}
"""`
}
