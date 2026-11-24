# Memória Pessoal — tracker de implementação

Status: ⬜ a fazer · 🟨 em andamento · ✅ concluído e validado · ⏸ bloqueado/aguardando · ✖ não feito (ver nota)

## Fase 0 — Discovery e planejamento

| # | Tarefa | Status | Critério de conclusão |
|---|---|---|---|
| 0.1 | Mapear a Base de Conhecimento atual | ✅ | armazenamento, consumidores e riscos em `inventario-ia.md` |
| 0.2 | Inventário das funcionalidades de IA | ✅ | todas as chamadas `runClaude`/`ai:*` classificadas |
| 0.3 | Arquitetura + tracker | ✅ | `arquitetura.md`, `tracker.md` |

## Fase 1 — Fundação

| # | Tarefa | Status | Critério |
|---|---|---|---|
| 1.1 | Schema + migração de versão (tabelas `memory_*`), categorias semeadas | ✅ | tabelas criadas em banco novo e existente |
| 1.2 | Repositório: CRUD, revisões, evidências, relações, exclusão definitiva, dono | ✅ | testes de CRUD/revisão/exclusão |
| 1.3 | Política de acesso (deny-by-default, narrow) | ✅ | testes adversariais |
| 1.4 | RPC `memory:*` + API/tipos no front | ✅ | typecheck |
| 1.5 | UI: lista, busca, filtros, editor, histórico, evidências, categorias, fixar | ✅ | desktop + 390px |
| 1.6 | Importação/exportação JSON e Markdown | ✅ | ida e volta testada |
| 1.7 | Migração assistida do KB (preview, idempotente, Markdown preservado) | ✅ | testes de idempotência |

## Fase 2 — Memory Agent e Inbox

| # | Tarefa | Status | Critério |
|---|---|---|---|
| 2.1 | Memory Agent (prompt, validação, dedupe, feedback) | ✅ | testes com IA mockada |
| 2.2 | Sugestões e aplicação (CREATE/UPDATE/MERGE/ARCHIVE/RESOLVE/ASK) + undo | ✅ | aprovação idempotente/concorrente |
| 2.3 | Memory Inbox (aprovar/lote/editar/rejeitar/adiar/diff) | ✅ | UI |
| 2.4 | Feedback e supressão de re-sugestões | ✅ | teste |
| 2.5 | Entrada inteligente (texto livre → memórias), "Analisar minhas memórias" | ✅ | UI + teste |
| 2.6 | Fila de eventos/jobs (lotes, retries, limites, frequência) | ✅ | testes |

## Fase 3 — Context Engine

| # | Tarefa | Status | Critério |
|---|---|---|---|
| 3.1 | `MemoryContextService` (política → recuperação → render → trace) | ✅ | testes |
| 3.2 | Recuperação híbrida + ranking + orçamento | ✅ | testes · estrutural + lexical; **vetorial não** (sem provedor de embeddings, ver limitações) |
| 3.3 | Segurança do contexto (delimitação, instruções separadas) | ✅ | testes de injeção |
| 3.4 | Context Inspector + simulação | ✅ | UI |
| 3.5 | Testes de não interferência | ✅ | `npm test` |
| 3.6 | Matriz de integração para aprovação (`integracoes.md`) | ✅ | aprovada em 2026-11-25; 6 integrações ligadas por canais dedicados, Jarvis aprovado sem ponto de chamada |

## Fase 4 — Cognitive Memory

| # | Tarefa | Status | Critério |
|---|---|---|---|
| 4.1 | Consolidação (agrupamento lexical + IA → sugestões MERGE/LEARNING) | ✅ | testes |
| 4.2 | Detecção de contradições (RESOLVE, sem sobrescrever) | ✅ | testes |
| 4.3 | Freshness (determinístico por estabilidade/tipo) | ✅ | testes |
| 4.4 | Knowledge Gaps | ✅ | testes |
| 4.5 | Cobertura qualitativa por domínio (critérios versionados) | ✅ | testes |
| 4.6 | Me conheça melhor (entrevista) | ✅ | UI + teste |
| 4.7 | Relações (UI) | ✅ | UI |
| 4.8 | Linha do tempo | ✅ | UI |

## Fase 5 — Experiência completa

| # | Tarefa | Status | Critério |
|---|---|---|---|
| 5.1 | Visão geral | ✅ | dados reais |
| 5.2 | Navegação por abas | ✅ | |
| 5.3 | Conexões | ✅ | |
| 5.4 | Configurações com efeito no backend | ✅ | testes |
| 5.5 | Notificações agrupadas | ✅ | |
| 5.6 | Polimento visual / responsivo | ✅ | 390px |

## Fase 6 — Performance, segurança, observabilidade

| # | Tarefa | Status | Critério |
|---|---|---|---|
| 6.1 | Índices, paginação, cache de recuperação | ✅ | |
| 6.2 | Custos (`ai_usage` por op, limites diários, anti-loop) | ✅ | testes |
| 6.3 | Estatísticas/observabilidade | ✅ | |
| 6.4 | Revisão de segurança | ✅ | |
| 6.5 | Degradação controlada | ✅ | testes |

## Fase 7 — Validação e documentação

| # | Tarefa | Status | Critério |
|---|---|---|---|
| 7.1 | Suíte de testes completa | ✅ | `npm test` verde |
| 7.2 | Evals reproduzíveis | ✅ | |
| 7.3 | Revisão final | ✅ | |
| 7.4 | Documentação operacional (`docs/memoria/README.md`) | ✅ | |
| 7.5 | Relatório final | ✅ | |

## Limitações conhecidas (estado honesto)

* **Busca vetorial: não implementada** — não há provedor de embeddings no projeto. Recuperação é estrutural + lexical (BM25). Colunas e ponto de extensão prontos (ver README).
* **Desktop (Electron) não foi aberto nesta implementação**: validado na web (mesmo servidor e mesmo front) em 1366px e 390px, nas duas skins e nos temas claro/escuro. Abrir o `npm run dev` depois de reiniciar o servidor.
* Notificações cobrem novas sugestões do agente e consolidação; memórias que pedem revisão e lacunas aparecem na Visão geral, sem notificação própria.
* Busca de lacunas é manual (botão); não há agendamento automático.
* "Solicitar mais informações" marca a sugestão e guarda a nota; o agente não age sozinho sobre a nota.
* Responder uma pergunta (ASK) no Inbox dispara a extração em background sem barra de progresso.
* Isolamento por dono: todas as consultas filtram `ownerId`, mas o app tem um único dono (`currentOwner()` = `me`).
* Recuperação carrega as memórias ativas do dono em memória a cada consulta (sem cache: ~ms para milhares). Reavaliar FTS4 acima de ~20 mil.

## Log

* 2026-11-25 — Fase 0 concluída (inventário, arquitetura, tracker).
* 2026-11-25 — Fases 1–2: modelo, repositório, política, Inbox, Memory Agent, migração, import/export (testes).
* 2026-11-25 — Fases 3–4: Context Engine + Inspector, não interferência, atualidade, cobertura, lacunas, entrevista, linha do tempo.
* 2026-11-25 — Fase 5: página completa (9 abas), validada em 1366px/390px, skins classic/devlytics, claro/escuro.
* 2026-11-25 — Fases 6–7: custos/limites, degradação, evals (recuperação no `npm test`; extração 7/7 com LLM real), docs. 3.6 aguardando aprovação.
* 2026-11-25 — Página "Base (legado)" removida a pedido do usuário (Base antiga vazia; `settings.knowledge_base` e `knowledge/constants.ts` mantidos para os consumidores atuais até a aprovação das integrações 1 e 2).
* 2026-11-25 — Integrações 1–7 aprovadas e ligadas (`server/memory/integrations.ts`); perfil padrão e `knowledge/constants.ts` removidos; stem corrigido (viagem/viagens, café/cafés).
