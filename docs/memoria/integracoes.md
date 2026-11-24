# Memória Pessoal — matriz de integração (Fase 3.8) · **APROVADA em 2026-11-25 (itens 1–7)**

Todas as 7 linhas foram aprovadas pelo usuário em 2026-11-25 e estão com `approved: true` em
`server/memory/policy.ts`. Cada uma tem um canal dedicado em `server/memory/integrations.ts`
que fixa o caso de uso no servidor (o front só manda a consulta). Memória vazia/indisponível →
bloco vazio e a funcionalidade segue como antes. O Jarvis (#7) está aprovado, mas ainda não tem
ponto de chamada (o módulo é placeholder).

| # | Canal | Onde é usado |
|---|---|---|
| 1 | `memory:ctxTripItinerary` | Assistente → "Roteiro de viagem" (bloco anexado ao prompt, visível antes de executar) |
| 2 | `memory:ctxTravelInterests` | Viagens → Destinos → Recomendações (sem LLM) |
| 3 | `memory:ctxStays` | Hospedagens → análise por IA (o campo de texto virou "observações desta busca") |
| 4 | `memory:ctxWeekPlan` | Assistente → "Planejar a semana" |
| 5 | `memory:ctxWeeklyReview` · `memory:produceWeeklyReview` | Revisão semanal (consome) · campo "O que aprendi nesta semana" → Inbox (produz) |
| 6 | `memory:produceBraindump` | Brain dump → botão "🧬 Sugerir memórias" → Inbox |
| 7 | — | Jarvis (sem ponto de chamada ainda) |

A Base de Conhecimento antiga (`settings.knowledge_base`) e o perfil padrão do código deixaram de
ser lidos.

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

## Nova integração

Funcionalidade nova de IA → perguntar ao usuário se quer integrar (regra no `CLAUDE.md`). Se sim:
linha nova aqui com `approved: false`, aprovação explícita, canal dedicado em `integrations.ts`, teste.
