# Memória Pessoal — guia técnico e operacional

> **Regra nº 1: nova funcionalidade de IA NÃO consome nem produz Memória Pessoal por padrão.**
> A adoção é explícita, por caso de uso, registrada em `server/memory/policy.ts` e aprovada pelo
> usuário. Na dúvida, não integre.

Docs relacionados: `arquitetura.md` (decisões e modelo), `inventario-ia.md` (todas as IAs do app),
`integracoes.md` (matriz aguardando aprovação), `tracker.md` (status).

## Mapa do código

| Arquivo | Papel |
|---|---|
| `shared/memory.ts` | tipos, enums, rótulos pt-BR, `normText`, `estimateTokens` |
| `server/memory/repo.ts` | CRUD, categorias, revisões, evidências, relações, exclusão definitiva, `currentOwner()` |
| `server/memory/policy.ts` | **política** deny-by-default, `resolveConsume` / `resolveProduce`, overrides que só restringem |
| `server/memory/retrieval.ts` | recuperação híbrida local (filtros + BM25 + score + camadas + orçamento), sanitização |
| `server/memory/context.ts` | `getMemoryContext` — única porta de saída para IA; trace em `memory_usage`; cache |
| `server/memory/suggestions.ts` | Inbox: proposta, dedupe, aprovação idempotente, lote seguro, rejeição/feedback, adiar, desfazer |
| `server/memory/agent.ts` | Memory Agent: extração de texto, análise/consolidação, eventos de produtores |
| `server/memory/ai.ts` | motor de IA injetável (Claude CLI sem ferramentas), limite diário, modelos por operação |
| `server/memory/cognitive.ts` | atualidade, cobertura, lacunas, entrevista, linha do tempo |
| `server/memory/transfer.ts` | exportar/importar JSON e Markdown, migração da Base antiga |
| `server/memory/jobs.ts` | jobs idempotentes com retry, tick do agendador, notificações agrupadas |
| `server/memory/rpc.ts` | canais `memory:*` e configurações validadas |
| `src/modules/memory/` | página (abas), store, componentes |
| `server/memory/__tests__/`, `server/memory/evals/` | testes e avaliações |

## Criar memórias

* **Manual** (botão "Nova memória"): nasce `active`, `reliability: stated`, confirmada, com evidência `manual`.
* **Texto livre / Markdown** ("Colar texto sobre mim"): IA → sugestões no Inbox; ou "uma por linha" sem IA.
* **Me conheça melhor**: cada resposta → sugestões (`sourceKind: interview`).
* **Lacunas**: responder uma lacuna → sugestões.
* **Importar JSON**: modo revisão (Inbox) ou direto (só arquivos exportados pelo próprio app).

Memória atômica = uma ideia. Conceitos separados: `extractionConfidence` (modelo) ≠ `reliability`
(declarada/observada/inferida) ≠ `importance` ≠ `stability` ≠ `confirmedAt` (só o usuário).

## Como o Memory Agent funciona

1. Entrada: texto do usuário dentro do módulo, ou `memory_events` de um **produtor autorizado**.
2. Recupera memórias parecidas (respeitando a política de consumo do caso) para dedupe/atualização.
3. **Uma** chamada de LLM por bloco/lote com: categorias permitidas, memórias parecidas, feedback de
   rejeição e o texto delimitado em `<texto>` como dado.
4. Cada item volta validado: operação válida, `targetIds` só entre os que a IA recebeu, citação
   conferida no texto (senão vira inferência com confiança ≤ 0,4), categoria e sensibilidade
   permitidas, dedupe contra memórias/sugestões/rejeições, teto por execução.
5. Vai para o Inbox. **Nada vira memória sem aprovação.**

Saídas do próprio agente nunca viram evidência (`submitEvidence` recusa `memory.*` e `memoria:*`).

## Sugestões e Inbox

Operações: CREATE, UPDATE (mostra atual × proposto), MERGE (originais → `superseded` + `DERIVED_FROM`),
ARCHIVE, RESOLVE (manter uma / usar a resolução proposta / "as duas valem"), ASK (pergunta).
Aprovar é idempotente (status checado na transação síncrona do sql.js). "Aprovar seguras" só aceita
CREATE + NORMAL + declarado. Rejeitar grava feedback com `normKey`; a mesma ideia não volta,
salvo `newEvidence`. Desfazer funciona se as memórias não mudaram desde a aprovação.

## Permissões (política)

```ts
// server/memory/policy.ts
{
  useCase: 'stays.analysis', label: 'Hospedagens: análise', module: 'viagens',
  purpose: 'Ranquear hospedagens com preferências de hospedagem.',
  internal: false, approved: false,                    // ← aprovação do usuário
  consume: { categories: ['viagens', 'preferencias'], types: ['PREFERENCE', 'CONSTRAINT'],
             maxSensitivity: 'NORMAL', maxTokens: 250, maxItems: 8, instructions: false },
  produce: false                                       // ← consumir não implica produzir
}
```

* Sensibilidade efetiva = máx(memória, categoria). Saúde, finanças, relacionamentos e história são PRIVATE por padrão.
* RESTRICTED só chega a quem tem `maxSensitivity: 'RESTRICTED'` (hoje: nenhum consumer).
* `instructions: true` autoriza memórias INSTRUCTION confirmadas de qualquer categoria, num bloco separado de precedência inferior.
* Configurações (`memory_policy_overrides`, `memory_extraction_categories`, `memory_consumers_enabled`) passam por `narrow*`: só restringem.

## Criar um novo Memory Consumer

1. Justifique no `inventario-ia.md` (benefício concreto, categorias, orçamento, riscos).
2. Adicione a política com `approved: false` e o menor escopo possível.
3. Peça aprovação (linha nova em `integracoes.md`). Só então `approved: true`.
4. No **servidor**, num handler dedicado que fixa o caso de uso:

```ts
// ✅ correto — servidor decide o caso de uso; contexto opcional; vazio é normal
const mem = await getMemoryContext({ useCase: 'stays.analysis', query: `${city} ${budgetHint}` })
const prompt = [mem.instructions, mem.text, tarefa].filter(Boolean).join('\n\n')
```

```ts
// ❌ errado — injeção global / caso de uso vindo do cliente / contexto em toda chamada
runClaude(prompt, cmd, { ... })                       // nunca adicionar memória aqui dentro
ipcMain.handle('memory:context', (_e, useCase) => getMemoryContext({ useCase }))  // front escolhe o caso
buildProjectContext(...) + (await getMemoryContext({ useCase: 'jarvis.assistant' })).text  // projeto ≠ pessoal
```

5. Teste: o caso recebe só o permitido; fallback funciona com memória indisponível (`degraded`).

## Criar um novo Memory Producer

1. Política com `produce: { categories, maxSensitivity, maxSuggestionsPerRun }`, `approved: false`, aprovação.
2. Envie **somente** conteúdo escrito/escolhido pelo usuário, por ação explícita:

```ts
// ✅ correto — evidência explícita, deduplicada, processada em lote pelo agente
await submitEvidence('home.weekly_review', textoQueOUsuarioEscreveu, `revisao#${semana}`)
```

```ts
// ❌ errado — captura indiscriminada
for (const msg of todasAsMensagens) await submitEvidence('chats', msg.text)   // dados de terceiros
await submitEvidence('memory.agent', saidaDoAgente)                            // recusado (anti-loop)
```

3. O Memory Agent precisa estar ligado (Configurações) para processar eventos; sem isso eles esperam.

## Recuperação

Filtros (dono, `active`, validade, categoria, tipo, sensibilidade, inferência confirmada) →
BM25 com normalização de acentos e stem leve → score (relevância 0,55, cobertura 0,10,
importância 0,15, confirmação 0,10, recência 0,05, fixada 0,05) → limiar de relevância 0,2
(fixada **não** fura o limiar; sem consulta só entra importância ≥ 4 ou fixada) → camadas
(Core, Domínio, Semântica, Recente, Restrita) → deduplicação (Jaccard ≥ 0,8) → orçamento.
Contexto vazio é resultado válido. Cache de 60 s invalidado por qualquer escrita/exclusão.

## Embeddings

Não há provedor de embeddings no projeto (Claude CLI não gera; sem Postgres/pgvector). As colunas
`embedding`, `embeddingModel`, `embeddingVersion`, `embeddedAt` existem e são zeradas a cada edição
de conteúdo. Para ligar busca vetorial no futuro: implementar um provedor, gerar só para memórias
`active` sem embedding (job em lote), combinar o cosseno ao score em `retrieval.ts` e marcar
`vector: true` no trace. Até lá o Inspector mostra "vetorial: não".

## Jobs, consolidação e custos

* Tick a cada 5 min (`memoryTick` em `server/rpc.ts`): expiração, retenção (traces/eventos),
  agente (se ligado, na frequência configurada) e consolidação (se ligada, a cada N dias).
* `memory_jobs`: `dedupeKey` por período (idempotente), 3 tentativas com backoff, erro registrado;
  limite diário estourado não tenta de novo no mesmo dia.
* Consolidação pré-agrupa por similaridade lexical; sem grupos → **zero** chamadas.
* Limites: `memory_max_llm_calls_day` (padrão 40), sugestões por execução (na política),
  `memory_batch_size`. Modelos: `memory_ai_model` (padrão sonnet) e `memory_ai_model_fast` (haiku).
* Custo/tokens: `ai_usage` com `source` `memoria-<op>`; resumo de 30 dias na Visão geral.

## Investigar problemas

| Sintoma | Onde olhar |
|---|---|
| Feature não recebeu memória | Inspector → traces (`blocked` diz o motivo: não registrada, aguardando aprovação, desligada) |
| Memória certa não veio | Inspector → simular; ver "descartadas" (relevância, orçamento, redundante) e "barradas pela política" (contagem) |
| Sugestões não aparecem | Configurações (agente ligado?), Visão geral (eventos falhos, jobs), limite diário |
| Job falhou | `memory_jobs.error` (Visão geral → Memory Agent) |
| Duplicatas | `memory_suggestions.dedupeKey`, `memories.normKey` |

Nenhum conteúdo pessoal vai para `console`/logs; traces guardam ids/scores, consulta só como hash.

## Migração da Base de Conhecimento

Memória Pessoal → Inbox → "Uma por linha (sem IA)" ou "Migrar com IA" (ou Configurações →
Reprocessar). Idempotente por hash do documento + dedupe por item. `settings.knowledge_base`
nunca é alterado; a página "Base (legado)" e os consumidores antigos continuam funcionando.

### Rollback

* Código: reverter os commits `feat(memoria)`; as tabelas `memory_*` ficam órfãs e inofensivas
  (só `CREATE TABLE IF NOT EXISTS`, nenhuma tabela existente foi alterada, nenhuma migração de versão).
* Dados: exportar JSON antes; para zerar, excluir as tabelas `memory_*` (ou restaurar um snapshot
  diário do banco). A Base antiga segue intacta.

## Exportar e excluir

* Exportar: Configurações → JSON (completo, com evidências e relações) ou Markdown. Restritas só com opt-in.
* Arquivar ≠ excluir. **Excluir** (detalhe da memória) apaga memória, revisões, evidências,
  relações, embedding, ids em sugestões/traces e invalida cache; fica só um tombstone sem conteúdo.
* Retenção: traces (`memory_trace_retention_days`, 30) e conteúdo de eventos processados
  (`memory_event_retention_days`, 14).

## Testes e avaliações

```bash
npm test                 # inclui server/memory/__tests__ (política, recuperação, Inbox, agente com IA falsa, jobs, não interferência, evals de recuperação)
npm run memory:evals     # extração com o LLM real, banco temporário (~7 chamadas)
```
