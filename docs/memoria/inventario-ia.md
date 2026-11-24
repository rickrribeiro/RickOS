# Memória Pessoal — inventário das funcionalidades de IA (Fase 0)

Levantamento de **todas** as chamadas de IA do rickOS em 2026-11-25, para decidir quem pode
consumir/produzir Memória Pessoal. Regra: **na dúvida, NONE**. Nenhuma integração externa é
habilitada sem a aprovação da matriz final (Fase 3, `integracoes.md`).

Toda IA do app passa por `runClaude()` (`server/services/claude.ts`), direto no servidor ou via
`ai:run` / `ai:start` / `ai:runStream` (`server/rpc.ts`). O uso de tokens vai para `ai_usage`
(`source`). Não há cliente genérico de LLM com contexto global e **não haverá**: a memória nunca
é injetada em `runClaude`, `ai:*` nem em `buildProjectContext`.

## Base de Conhecimento atual (o que será substituído)

| Item | Onde |
|---|---|
| Armazenamento | `settings.knowledge_base` (um Markdown livre) |
| Edição | `src/modules/knowledge/pages/KnowledgePage.tsx` (textarea) |
| Seed / parser | `src/modules/knowledge/constants.ts` (`DEFAULT_KNOWLEDGE`, `knowledgeBullets`: linhas `- `) |
| Consumidor 1 | `AIPage.tsx` → atalho **Roteiro de viagem** monta `profile` = bullets do KB (texto preenchido no prompt, usuário vê e edita antes de executar) |
| Consumidor 2 | `travel/components/Recommendations.tsx` → catálogo estático por palavra-chave (sem LLM) |
| Perfil paralelo | `settings.travel_profile` em `StayFinderPage.tsx` (não é o KB, mas é o mesmo tipo de dado) |

Riscos de regressão: os dois consumidores leem a chave diretamente no front; manter
`knowledge_base` intacto e o comportamento deles idêntico até a migração ser aprovada.

## Inventário

Legenda da recomendação: **NONE** · **CONSUMER** · **PRODUCER** · **BOTH** (todas como *candidatas*,
desabilitadas até aprovação).

| # | Módulo / caso de uso | Código | Contexto usado hoje | Usa KB? | Recom. | Categorias relevantes | Justificativa / riscos |
|---|---|---|---|---|---|---|---|
| 1 | Assistente — Roteiro de viagem | `src/modules/ai/pages/AIPage.tsx` (`ACTIONS.trip`) | destino/datas da próxima viagem + bullets do KB | **sim** | CONSUMER | Viagens, Preferências, Interesses, Finanças (só faixa de orçamento, PRIVATE) | benefício direto e já existente; budget ~400 tokens; latência zero extra (recuperação local) |
| 2 | Recomendações de viagem (catálogo) | `src/modules/travel/components/Recommendations.tsx` | bullets do KB (sem LLM) | **sim** | CONSUMER | Viagens, Interesses | determinístico; só precisa de memórias NORMAL de preferências |
| 3 | Análise de hospedagens | `src/modules/travel-stays/pages/StayFinderPage.tsx` | `travel_profile` + resultados | não | CONSUMER | Viagens, Preferências (hospedagem) | substituiria o perfil de texto paralelo; budget ~250 tokens |
| 4 | Assistente — prompt livre / Planejar semana / Resumo semanal / Priorizar | `AIPage.tsx` | todos, hábitos, eventos, horas | não | CONSUMER (só Planejar semana) · NONE (demais) | Produtividade, Hábitos e rotina, Objetivos | planejamento pessoal ganha com preferências de rotina; priorizar/inbox já têm o contexto necessário |
| 5 | Revisão semanal | `src/modules/home/components/WeeklyReview.tsx` | dados da semana | não | BOTH | Objetivos, Produtividade, Aprendizados | reflexão pessoal; produzir **só** do texto que o usuário escreveu, com botão explícito |
| 6 | Briefing matinal | `src/modules/home/components/DailyStandup.tsx` | agenda/tarefas do dia | não | NONE | — | o contexto do dia é suficiente; reavaliar depois |
| 7 | Brain dump | `src/modules/braindump/pages/BrainDumpPage.tsx` | texto do dump | não | PRODUCER | qualquer (filtrado pela política) | texto livre do próprio usuário; só com ação explícita "sugerir memórias" |
| 8 | Jarvis (assistente pessoal, placeholder) | `src/modules/jarvis/pages/JarvisPage.tsx` | — | não | CONSUMER (futuro) | Core + domínio da pergunta | ainda não existe IA |
| 9 | Prompt Runner (conversas, commit sugerido, títulos) | `server/aiconv/*` | projeto/repo, agentes, skills | não | NONE | — | código/projetos; conhecimento de projeto ≠ pessoal |
| 10 | Execuções em background `ai:start` genéricas | `server/rpc.ts` | `buildProjectContext` | não | NONE | — | infraestrutura genérica: **nunca** recebe memória |
| 11 | Agentes agendados | `server/rpc.ts` (`runScheduledJobs`) | prompt do usuário | não | NONE | — | automação operacional |
| 12 | OCR do Inbox | `server/rpc.ts` (`inbox:ocr`) | imagem | não | NONE | — | extração de dados |
| 13 | Passagens: linguagem natural, regiões, alertas, Chrome assistido, promos | `server/flights/ai.ts`, `assisted.ts`, `promos.ts`, `runner.ts` | parâmetros da busca | não | NONE | — | o contexto já vem da operação (exigência explícita) |
| 14 | Mensagens: sugestões de resposta, resumo | `server/chats/ai.ts` | mensagens selecionadas (terceiros) | não | NONE | — | dados de terceiros; política de privacidade própria do módulo |
| 15 | CRM: mensagem de reconexão | `src/modules/crm/pages/CrmPage.tsx` | contexto do contato | não | NONE | — | foco no contato, não no usuário |
| 16 | Projetos: progresso, análises JSON/texto | `src/modules/projects/lib/ai.ts`, `ProgressModal.tsx` | contexto do projeto | não | NONE | — | IAs de projeto (exigência explícita) |
| 17 | Central de Projetos: changelog | `server/services/projectHub.ts` | commits | não | NONE | — | técnico |
| 18 | GitHub: criar issue | `server/services/github.ts` | issue | não | NONE | — | operacional |
| 19 | Delegação (planejar/executar tarefa em worktree) | `server/services/delegation.ts` | repo/tarefa | não | NONE | — | código |
| 20 | "Onde parei" (hook SessionEnd) | `server/services/claudeHook.ts` | transcript da sessão | não | NONE | — | projeto; nunca virar produtor (loop + conteúdo técnico) |
| 21 | Estudos: flashcards, lacunas, notas, quiz | `src/modules/estudos/components/*` | material do tópico | não | NONE | — | o material é o contexto; reavaliar "estilo de aprendizado" depois |

Itens sem LLM que aparecem no `ai_usage`/`source` (regras, notificações, Google) não entram.

## Resumo

* Consumidores atuais do KB: **#1 e #2**. Preservados sem mudança até a aprovação.
* Candidatos CONSUMER: #1, #2, #3, #4 (Planejar semana), #5, #8.
* Candidatos PRODUCER: #5, #7.
* Todo o resto: **NONE**, com teste de não interferência (Fase 3).

> **2026-11-25:** os candidatos #1, #2, #3, #4 (Planejar semana), #5, #7 e #8 (Jarvis) foram aprovados; ver `integracoes.md`. O resto continua NONE.
