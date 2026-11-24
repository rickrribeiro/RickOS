# Memória Pessoal — matriz de integração (Fase 3.8) · **AGUARDANDO APROVAÇÃO**

Nada aqui está habilitado. Cada linha já existe em `server/memory/policy.ts` com `approved: false`
(bloqueada em `resolveConsume`/`resolveProduce`, com teste). Aprovar uma linha = mudar para
`approved: true` **e** trocar o ponto de chamada indicado para usar `getMemoryContext` /
`submitEvidence`. Dá para ver o que cada uma receberia hoje, sem LLM, em
**Memória Pessoal → Inspector → Simular** (modo candidato).

Custos de recuperação: zero chamadas de LLM, zero embeddings, ~1–5 ms locais. O custo real é
o de **tokens a mais no prompt** do consumer (coluna "Orçamento").

| # | Caso de uso (`useCase`) | Tipo | Benefício concreto | Categorias · tipos | Sens. máx. | Orçamento | Custo / latência | Privacidade | Fallback |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `assistant.trip_itinerary` — Assistente → Roteiro de viagem (`src/modules/ai/pages/AIPage.tsx`) | CONSUMER | roteiro já usa o perfil do Markdown; passaria a usar só o relevante ao destino (ex.: Seoul, bairros caminháveis) | viagens, preferências, interesses · PREFERENCE, CONSTRAINT, FACT, EXPERIENCE, LEARNING | NORMAL | 400 tokens / 12 itens | +≤400 tokens de entrada por roteiro; latência ≈ 0 | sem saúde/finanças; o prompt é mostrado ao usuário antes de executar | Markdown antigo (comportamento atual) ou nenhum contexto |
| 2 | `travel.recommendations` — Viagens → Recomendações (`src/modules/travel/components/Recommendations.tsx`) | CONSUMER (sem LLM) | catálogo casado com interesses atuais em vez de bullets do Markdown | viagens, interesses, preferências · PREFERENCE, FACT | NORMAL | 300 / 15 | nenhum (não chama IA) | nada sai do app | bullets do Markdown |
| 3 | `stays.analysis` — Hospedagens → análise (`src/modules/travel-stays/pages/StayFinderPage.tsx`) | CONSUMER | substitui o `travel_profile` digitado à parte por preferências de hospedagem reais | viagens, preferências · PREFERENCE, CONSTRAINT | NORMAL | 250 / 8 | +≤250 tokens | orçamento (finanças) fica de fora por padrão | `travel_profile` atual |
| 4 | `assistant.week_plan` — Assistente → Planejar a semana | CONSUMER | plano respeita rotina/produtividade (ex.: trabalho profundo de manhã) e instruções pessoais | rotina, produtividade, objetivos + instruções pessoais | NORMAL | 400 / 12 | +≤400 tokens | sem sensíveis | prompt atual sem perfil |
| 5 | `home.weekly_review` — Revisão semanal (`src/modules/home/components/WeeklyReview.tsx`) | BOTH | consome objetivos/aprendizados; **produz** sugestões só do texto que você escrever na revisão, por botão explícito | consumo: objetivos, produtividade, aprendizados · produção: + rotina, valores | consumo NORMAL · produção PRIVATE | 500 / 12 · ≤5 sugestões | +≤500 tokens; produção = 1 chamada (modelo rápido) por clique | só o texto digitado por você; sugestões passam pelo Inbox | revisão sem memória |
| 6 | `braindump.extract` — Brain dump → "sugerir memórias" | PRODUCER | transforma pensamentos soltos em conhecimento revisável | todas (filtradas pelas suas configurações) | PRIVATE | ≤8 sugestões | 1 chamada (modelo rápido) por clique | só com ação explícita; nunca automático | brain dump como hoje |
| 7 | `jarvis.assistant` — Jarvis | CONSUMER | assistente pessoal geral (módulo ainda é placeholder) | todas · todos os tipos | NORMAL | 800 / 20 | +≤800 tokens | amplo: decidir quando o Jarvis existir | sem memória |

**Explicitamente NONE (sem política, com teste de não interferência):** Prompt Runner e `ai:*`
genéricos, agentes agendados, OCR do Inbox, todas as IAs de Passagens, Mensagens (sugestões e
resumos), CRM, Projetos/Central de Projetos/changelog, GitHub, Delegação, "Onde parei", Estudos,
Briefing matinal. Ver `inventario-ia.md`.

## Como aprovar

Responda com os números aprovados (ex.: "aprovo 1, 2 e 3"). Para cada um eu:
1. mudo `approved: true` na política (e ajusto o teto se você pedir);
2. troco a leitura de `settings.knowledge_base` / `travel_profile` por um canal **dedicado** no
   servidor (ex.: `ai:tripItinerary`), que fixa o `useCase` no próprio handler e chama
   `getMemoryContext({ useCase, query })` — o front nunca escolhe o caso de uso nem categorias.
   Fallback para o comportamento atual se a memória estiver vazia/indisponível;
3. adiciono teste de que o caso recebe só as categorias permitidas.

Enquanto não houver aprovação, os dois consumidores antigos (#1 e #2) continuam lendo o
Markdown, sem mudança.
