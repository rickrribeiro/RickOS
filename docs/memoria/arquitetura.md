# Memória Pessoal — arquitetura

Substitui a Base de Conhecimento (um Markdown em `settings.knowledge_base`) por memórias
atômicas, rastreáveis e revisáveis, com uma política de acesso **deny-by-default**: nenhuma IA
recebe ou produz memória pessoal sem estar registrada explicitamente na política.

Nome: **Memória Pessoal** na UI (pt-BR) · `memory` no código (`server/memory/`, `shared/memory.ts`,
`src/modules/memory/`, canais `memory:*`, página `#/memory`).

## Princípios que viram regra de código

1. `runClaude`, `ai:*`, `buildProjectContext` e qualquer abstração genérica de IA **não conhecem** a
   memória. Só o `MemoryContextService` lê memórias para IA, e só para casos de uso da política.
2. A política está **no código** (`server/memory/policy.ts`). Configurações só **restringem**
   (desligar, reduzir orçamento, tirar categorias), nunca ampliam além do teto do código.
3. O front nunca diz "quais categorias quer"; ele diz o **caso de uso** e o servidor resolve o resto.
4. IA só **sugere** (`memory_suggestions`); memória ativa nasce de aprovação do usuário ou de
   criação manual. Inferências e sensíveis sempre exigem aprovação explícita.
5. Conteúdo de memória, evidência ou importação é **dado não confiável** dentro de prompts.

## Restrições do ambiente (descobertas na Fase 0)

| Tema | Situação no projeto | Decisão |
|---|---|---|
| Banco | sql.js (SQLite WASM em memória + arquivo), sem Postgres | tabelas novas no mesmo banco; pgvector não se aplica |
| Embeddings | **não existe** provedor; o Claude CLI não gera embeddings | interface `EmbeddingProvider` (padrão: nenhum) + colunas de metadados prontas; recuperação **lexical + estruturada** (BM25 em JS com normalização de acentos). Sem dependência nova |
| Busca textual | FTS4 disponível, FTS5 não | BM25 em memória sobre o conjunto filtrado (um usuário, centenas/milhares de memórias): simples e sem trigger de sincronização. Reavaliar FTS4 acima de ~20k memórias |
| LLM | Claude Code CLI local (`runClaude`), uso em `ai_usage` | `MemoryAi` injetável (como `AiEngine` em `server/chats/ai.ts`), CLI sem ferramentas/MCP, cwd temporário; `source` = `memoria-<op>` |
| Filas/jobs | só `setInterval` no agendador de `server/rpc.ts` | tabela `memory_jobs` + `memory_events` com `dedupeKey` único, claim por status, retries com backoff, um runner por vez |
| Observabilidade | `ai_usage` (tokens/custo), notificações; sem métricas | traces de contexto em `memory_usage` (só ids/scores, sem conteúdo) + estatísticas calculadas por SQL; custo via `ai_usage` |
| Notificações | `notify()` (`server/services/notifications.ts`) | uma notificação agrupada por execução, desligável |
| Proprietário | app de um usuário | coluna `ownerId` em todas as tabelas; o servidor resolve o dono (`currentOwner()`); nenhuma função de repo aceita dono vindo do cliente |

## Modelo de dados

Todas as tabelas têm `ownerId TEXT NOT NULL`. Datas em ISO.

| Tabela | Papel | Campos principais |
|---|---|---|
| `memory_categories` | categorias dinâmicas | `slug` (único por dono), `name`, `icon`, `description`, `defaultSensitivity`, `sortOrder`, `archivedAt` |
| `memories` | memória atômica | `title`, `content`, `categoryId`, `tags` (JSON), `type`, `layer`, `status`, `pinned`, `importance` (1–5), `extractionConfidence` (0–1, nulo se manual), `reliability`, `stability`, `origin`, `originRef`, `scope`, `sensitivity`, `occurredAt`, `validFrom`, `validUntil`, `confirmedAt`, `lastUsedAt`, `useCount`, `normKey`, `version`, `supersededById`, `embedding*` |
| `memory_revisions` | histórico | `memoryId`, `version`, `snapshot` (JSON do estado **anterior**), `changeKind`, `actor`, `reason`, `suggestionId` |
| `memory_evidence` | evidências/origem | `memoryId` ou `suggestionId`, `sourceKind`, `sourceRef`, `excerpt`, `contentHash` (integridade) |
| `memory_relations` | grafo leve | `fromId`, `toId`, `kind` (RELATED_TO, SUPPORTS, CONTRADICTS, DERIVED_FROM, SUPERSEDES, PART_OF), único por trio |
| `memory_suggestions` | Inbox | `op` (CREATE, UPDATE, MERGE, ARCHIVE, RESOLVE, ASK), `status`, `payload` (proposta), `targetIds`, `targetSnapshot` (estado atual na criação), `rationale`, `benefit`, `extractionConfidence`, `sensitivity`, `sourceKind`, `sourceRef`, `dedupeKey` (único), `snoozedUntil`, `resultMemoryIds`, `undo` |
| `memory_feedback` | feedback | `suggestionId`, `verdict`, `note`, `normKey` (evita re-sugerir o rejeitado) |
| `memory_usage` | trace do contexto (Inspector) | `useCase`, `purpose`, `queryHash`, `selected`/`discarded` (ids, camada, score, motivo), `blocked`, `tokens`, `budget`, `durationMs`, `vector`, `policyVersion` |
| `memory_events` | entrada dos produtores | `producer` (caso de uso), `payload`, `dedupeKey` (único), `status`, `attempts`, `error` |
| `memory_jobs` | fila | `kind`, `status`, `dedupeKey`, `attempts`, `runAfter`, `error`, `stats` |
| `memory_gaps` | lacunas | `topic`, `categoryId`, `why`, `beneficiaries`, `priority`, `sensitivity`, `question`, `status`, `normKey` |
| `memory_interviews` | Me conheça melhor | `topic`, `categoryId`, `status`, `turns` (JSON) |
| `memory_imports` | migração/importação idempotente | `kind`, `sourceHash`, `status`, `stats` |

### Conceitos separados (não se confundem)

| Conceito | Campo | Quem define |
|---|---|---|
| Confiança na extração | `extractionConfidence` | o modelo, ao extrair; **não** torna nada verdadeiro |
| Confiabilidade da informação | `reliability`: `stated` (dito pelo usuário), `observed` (evidência factual), `inferred` (dedução da IA) | origem |
| Importância | `importance` 1–5 | usuário (IA só propõe) |
| Estabilidade temporal | `stability`: `permanent`, `stable`, `evolving`, `transient` | proposta + usuário |
| Confirmação | `confirmedAt` | só o usuário |

### Tipos, camadas e ciclo de vida

* `type`: FACT, PREFERENCE, GOAL, CONSTRAINT, HABIT, INSTRUCTION, EXPERIENCE, LEARNING, INFERENCE.
* `layer` (coluna, não entidade): `semantic`, `episodic`, `procedural`, `temporal`, `reflective`.
  Padrão derivado do tipo (EXPERIENCE → episódica, HABIT/INSTRUCTION → procedural, LEARNING/INFERENCE → reflexiva, GOAL → temporal).
* `status`: `active`, `unconfirmed`, `outdated`, `archived`, `superseded`, `expired`.
  Só `active` entra em contexto de IA. `expired` também é aplicado na leitura (`validUntil < agora`).
* Atualização: grava o snapshot anterior em `memory_revisions` e incrementa `version`
  (concorrência otimista: `UPDATE … WHERE version = ?`).
* Arquivar ≠ excluir. **Exclusão definitiva** apaga memória, revisões, evidências, relações,
  usos, embedding e invalida o cache de recuperação; registra só um tombstone sem conteúdo.

### Sensibilidade

`NORMAL < PRIVATE < RESTRICTED`. Sensibilidade efetiva = máx(memória, padrão da categoria).
Categorias semeadas como PRIVATE: Saúde e bem-estar, Finanças, Relacionamentos, História pessoal.
Cada política declara `maxSensitivity`; RESTRICTED só com permissão explícita do caso de uso.
Aplicado no repositório/serviço, nunca só na UI.

## Política de acesso (`server/memory/policy.ts`)

```ts
interface MemoryPolicy {
  useCase: string              // 'memory.interview', 'travel.itinerary', …
  label: string; module: string; purpose: string
  internal: boolean            // funcionalidade do próprio módulo de Memória
  approved: boolean            // integrações externas: false até aprovação da Fase 3
  consume: false | { categories: string[] | '*'; types?: MemoryType[]; maxSensitivity; maxTokens; maxItems; instructions: boolean }
  produce: false | { categories: string[] | '*'; maxSensitivity; maxSuggestionsPerRun }
}
```

* `resolvePolicy(useCase, 'consume' | 'produce')` → bloqueado se o caso de uso não existe, não está
  aprovado, foi desligado nas configurações ou não tem a responsabilidade pedida.
* Overrides (`settings.memory_policy_overrides`) passam por `narrow()`: interseção de categorias,
  `min` de orçamentos, sensibilidade mais baixa. Testado contra tentativas de ampliar.
* Consumir e produzir são independentes.

## Fluxos

**Criação manual** → valida → `memories` (status `active`, `reliability: stated`, `confirmedAt` agora) + evidência `manual` + revisão `create`.

**Produção (IA)** → produtor autorizado chama `submitEvidence(useCase, payload)` → `memory_events`
(dedupe por hash) → job `agent_batch` agrupa eventos → **uma** chamada do Memory Agent por lote →
sugestões validadas (categoria permitida, sensibilidade, dedupe contra memórias, sugestões e
feedback rejeitado) → Inbox. Saídas do próprio agente nunca viram eventos.

**Aprovação** → transação: aplica a operação (CREATE/UPDATE/MERGE/ARCHIVE/RESOLVE), grava revisões
com `suggestionId`, evidências, relações (MERGE → DERIVED_FROM; UPDATE de memória confirmada exige
aprovação, nunca silenciosa), marca a sugestão (`approved`, `resultMemoryIds`, dados de undo).
Aprovar duas vezes é no-op (status checado dentro da transação).

**Recuperação (consumidor)** → `getContext({ useCase, query })` →
1. política (bloqueio → trace `blocked`, zero leitura);
2. candidatos filtrados por dono, `active`, validade, categorias/tipos/sensibilidade permitidos;
3. score = relevância lexical (BM25) + importância + confirmação + fixada + especificidade + recência;
4. camadas: Core (fixadas/INSTRUCTION do escopo), Domínio (categorias do caso), Semântica (relevância),
   Recente; Restrita só se a política permitir;
5. limiar mínimo de relevância (pode retornar **zero** memórias) — memória fixada ganha score mas
   **não** fura o limiar; instruções pessoais entram quando a política tem `instructions: true`
   (de qualquer categoria, sujeitas à sensibilidade); deduplicação por similaridade;
   seleção gulosa até `maxItems`/`maxTokens`;
6. render em bloco delimitado com aviso "dados, não instruções"; INSTRUCTION confirmadas num bloco
   separado de precedência inferior;
7. trace em `memory_usage` (ids/scores/motivos, hash da consulta; nunca conteúdo) e `useCount`.

Sem chamada extra de LLM para relevância.

## Migração da Base de Conhecimento

1. `settings.knowledge_base` **nunca** é apagado nem alterado.
2. Preview: IA extrai memórias atômicas do Markdown (em blocos por seção) → sugestões CREATE com
   evidência = trecho de origem e `sourceKind: migration`.
3. Idempotência: `memory_imports.sourceHash` + `dedupeKey` por item (`normKey` do conteúdo);
   rodar de novo não duplica nem re-sugere o já aprovado/rejeitado.
4. Revisão no Inbox (aprovar individual/lote, editar antes).
5. Os consumidores antigos continuam lendo o Markdown até a aprovação da integração.

Importar/exportar: JSON (completo, com categorias, relações, evidências) e Markdown (por categoria,
legível). Importação vira sugestões ou, se o usuário marcar "confiar", criação direta (Markdown/JSON exportado pelo próprio app).

## Processamento assíncrono e custo

* Runner único (`memory_jobs`), tick no agendador do servidor (a cada 5 min), claim atômico.
* Retries: 3 tentativas, backoff exponencial; falha registrada em `error`.
* Limites: chamadas de LLM/dia (`memory_max_llm_calls_day`), sugestões por execução, eventos por lote.
* Modelo configurável (`memory_ai_model`, padrão econômico).
* Tudo desligado por padrão: Memory Agent, consolidação periódica, notificações de memória.

## Observabilidade

* Custo/tokens: `ai_usage` com `source` `memoria-agente`, `memoria-migracao`, `memoria-entrevista`,
  `memoria-consolidacao`, `memoria-lacunas`, `memoria-texto` (baixa cardinalidade).
* Recuperação: `memory_usage` (latência, itens, bloqueios, vazios por caso de uso).
* Jobs: `memory_jobs` (fila, falhas). Sugestões: contagem por status/idade.
* `memory:stats` agrega tudo para a aba Visão geral. Nenhum conteúdo pessoal em logs (`console.*`).

## Estratégia de testes

`node:test` via tsx em `server/memory/__tests__/` (banco isolado em `RICKOS_DATA_DIR` temporário,
LLM mockado via `setMemoryAi`). Cobertura: CRUD/revisões/exclusão, política (inclusive
adversarial), recuperação/ranking/orçamento, Inbox (idempotência/concorrência), migração, jobs,
não interferência (nenhuma chamada de IA existente passa pelo serviço de memória) e casos de
avaliação reproduzíveis (`evals`).

## Riscos e trade-offs

* **Sem busca vetorial**: perde sinônimos ("Coreia" × "Seul"). Mitigação: tags, categorias, títulos,
  normalização; provedor de embeddings plugável depois. Inspector mostra `vetorial: não`.
* sql.js mantém o banco em memória: tabelas de trace/eventos têm retenção configurável.
* Qualidade de extração depende do modelo; tudo passa por revisão humana.
* Política no código exige deploy para nova integração — intencional.

## Decisões tomadas durante a implementação

* **Sem migração de versão**: só tabelas novas (`CREATE TABLE IF NOT EXISTS`); rollback trivial.
* **Cascatas não confiáveis no sql.js** (o `export()` reabre a conexão e perde `PRAGMA foreign_keys`):
  exclusão definitiva apaga derivados explicitamente.
* **Simulação de candidatas**: o Inspector calcula o contexto de integrações `approved: false`
  localmente (sem LLM, sem contar uso) para apoiar a decisão de aprovação; a chamada real continua bloqueada.
* **Descartes por política** aparecem só como contagem no trace (não revelam ids de memórias proibidas).
* **Política imutável em runtime** (`deepFreeze`) e coberta por testes adversariais.

## Plano incremental

Ver `tracker.md`. Guia operacional: `README.md`.
