# Prompts do rickOS

Todo texto enviado a uma IA (Claude Code, Codex ou Gemini) mora aqui, **um arquivo por chamada**, para dar para revisar tudo num lugar só.

## Como funciona

```
chamador ──(id + dados)──▶ gateway (server/ia/gateway.ts) ──▶ motor (factory criarMotor: claude-code | codex)
                              │  lê a config no banco (ai_chamadas)
                              │  monta o prompt: template padrão OU o sobrescrito pelo usuário
                              └─ resolve motor / modelo / effort
```

* **Factory `definirChamada()`** (`definicao.ts`): cada arquivo exporta uma definição com id, módulo, padrões de motor/modelo/effort, o prompt como **template** com variáveis `{{nome}}`, a função `preparar(dados)` (dados do chamador → variáveis) e um `exemplo`.
* O chamador **nunca** monta o prompt: passa o id e os dados. Servidor: `executarChamada(id, dados, opções)` ou `montarChamada(id, dados)`. Front: `window.api.ai.start({ chamada, params })`, `window.api.ai.executar(...)` (`runJson`/`runText`) ou `window.api.iaChamadas.montar(...)` (chamadas do tipo `texto`).
* **Prompt sobrescrito**: em Configurações → IA → "Ver onde a IA é usada" → Editar prompt. Fica em `ai_chamadas` (template/sistema); "Reverter para o padrão" apaga. O texto sobrescrito usa as mesmas variáveis do padrão; partes condicionais (ex.: um bloco que só aparece se houver dado) já vêm prontas dentro da variável.
* **Motor**: cada definição tem um `motor` padrão e, em `alternativas`, os outros motores que aceita (com os padrões de modelo/effort de cada um; `ALT_CODEX`/`ALT_CLAUDE` em `padroes.ts`). Sem `alternativas` = só roda no padrão (ex.: precisa de ferramenta exclusiva do Claude Code). O usuário escolhe em Configurações → IA; fica em `ai_chamadas.motor` e o gateway ignora motor não aceito.
* **Modelo e effort**: os padrões de cada motor vêm da definição (`modelo`/`effort` ou `alternativas`; com `setting`, a chave de Configurações vence o padrão). O usuário pode escolher outro em Configurações → IA (`ai_chamadas.modelo/effort`, valem para o motor em uso; trocar o motor limpa). Opções por motor em `motores.ts`; no Codex o padrão é o do `~/.codex/config.toml`.
* Fica em `shared/` porque o servidor e o front usam (os dois tsconfigs incluem `shared/`). Nada de `window`, Node ou i18n aqui: prompts são sempre em **pt-BR**.
* Privacidade/orçamento (ex.: só as mensagens selecionadas, limite de caracteres) continua no chamador.
* **Memória Pessoal**: nenhum prompt daqui busca memória. Os que recebem já estavam aprovados (ver `docs/memoria/integracoes.md`) e o bloco chega como dado (`{{memoria}}`).
* `registro`: `catalogo.ts` (`DEFINICOES`, `IdChamadaIa`, `ParamsDe<id>`). O guardrail `server/ia/__tests__/guardrails.test.ts` quebra o `npm test` se aparecer chamada de IA fora daqui.

Fora daqui (de propósito): os **prompts do usuário** (agentes, skills e jobs agendados ficam no banco e são editados na UI; as sementes estão em `server/database/aiSeeds.ts`) e o schema de resposta do Gemini (`TOPICS_SCHEMA` em `server/services/news.ts`). Blocos auxiliares que não são chamadas: `projetos/contextoProjeto.ts`, `projetos/resumoProjeto.ts`, `memoria/blocoContexto.ts`, `memoria/regras.ts`, `mensagens/sistema.ts`, `exemplos.ts`, `padroes.ts`.

## Nova chamada de IA (checklist)

1. `shared/prompts/<módulo>/<nome>.ts` com `definirChamada({ id, modulo, tipo, motor, modelo, effort, alternativas?, arquivo, usadoEm, template, preparar, exemplo })`.
2. Entrada em `DEFINICOES` (`catalogo.ts`) e nome em `settings.iaChamada.<id>` (pt-BR, en, es).
3. Chamar pelo gateway (nunca `runClaude`/CLI direto) e registrar arquivo → id no `MANIFESTO` do guardrail.
4. Linha no índice abaixo.

## Índice

| Arquivo | O que faz | Usado em |
|---|---|---|
| **assistente/** | | |
| `livre.ts` | Texto digitado no Assistente | `src/modules/jarvis/pages/JarvisPage.tsx` |
| `acoesRapidas.ts` | Botões do Assistente: priorizar tarefas, revisar inbox, planejar a semana*, roteiro de viagem*, resumo semanal, checklist de viagem | `src/modules/jarvis/pages/JarvisPage.tsx` |
| **automacoes/** | | |
| `agendado.ts` | Agente agendado (prompt do usuário) | `server/rpc.ts` |
| **braindump/** | | |
| `organizar.ts` | Despejo mental → tarefas, projetos, próximos passos e agenda (JSON) | `src/modules/braindump/pages/BrainDumpPage.tsx` |
| **crm/** | | |
| `retomarContato.ts` | 2-3 opções de mensagem para retomar contato | `src/modules/crm/pages/CrmPage.tsx` |
| **estudos/** | | |
| `tutor.ts` | Botões do tutor (explicar simples, resumir, exercícios, lacunas, socrático, recall ativo) | `src/modules/estudos/components/NoteEditor.tsx` |
| `flashcards.ts` | Gerar flashcards de uma anotação | `src/modules/estudos/components/FlashcardPanel.tsx` |
| `lacunasRoadmap.ts` | Pré-requisitos que faltam no roadmap do tópico | `src/modules/estudos/components/GapsModal.tsx` |
| `quiz.ts` | Quiz de múltipla escolha | `src/modules/estudos/components/QuizModal.tsx` |
| `pedagogia/textos.ts` | **Textos-base A–E** (masterclass, aula, material do nó, revisão editorial, subtópicos) + camada comum + blocos de seção; `VERSAO_PEDAGOGIA` | (assets, montados pelos arquivos abaixo) |
| `pedagogia/schemas.ts` | Contratos de saída (JSON Schema estrito, `--output-schema` do Codex) | `server/estudos/tutor.ts` |
| `perfis.ts` | Perfis de modelo/effort só de Estudos (`study_ai_*`) | (padrões das chamadas abaixo) |
| `masterclass.ts` | A: "quero estudar X para Y" → mapa completo + abertura da 1ª aula (Codex, astra/high) | `server/estudos/tutor.ts` |
| `aula.ts` | B: aula conversacional, um turno por vez (Codex, sol/medium) | `server/estudos/tutor.ts` |
| **github/** | | |
| `criarIssue.ts` | Cria no GitHub (via `gh`) uma issue local | `server/services/github.ts` |
| **home/** | | |
| `briefingMatinal.ts` | Briefing matinal (prioridades e agenda do dia) | `src/modules/home/components/DailyStandup.tsx` |
| `revisaoSemanal.ts` | Relatório da revisão semanal* | `src/modules/home/components/WeeklyReview.tsx` |
| **inbox/** | | |
| `ocrImagem.ts` | Imagem → item do Inbox (JSON) | `server/rpc.ts` (`inbox:ocr`) |
| `classificarProjetos.ts` | Sugere o projeto de cada item do inbox | `src/modules/inbox/pages/InboxPage.tsx` |
| **memoria/** | | |
| `regras.ts` | Regras de segurança comuns a todo system prompt da Memória | (incluído pelos abaixo) |
| `extracao.ts` | Memory Agent: texto → sugestões de memória (system + prompt + formato) | `server/memory/agent.ts` |
| `analise.ts` | Analisar/consolidar memórias (merge, padrões, contradições) | `server/memory/agent.ts` |
| `lacunas.ts` | Lacunas de conhecimento pessoal | `server/memory/cognitive.ts` |
| `entrevista.ts` | Entrevista "Me conheça melhor" | `server/memory/cognitive.ts` |
| `blocoContexto.ts` | Como a memória entra nos prompts das integrações (`<memoria_pessoal>`, `<preferencias_do_usuario>`) | `server/memory/context.ts` |
| **mensagens/** | | |
| `sistema.ts` | System prompt da Central de Mensagens + estilos de resposta | `server/chats/ai.ts` |
| `sugerirRespostas.ts` | Sugerir resposta(s) às mensagens selecionadas | `server/chats/ai.ts` |
| `resumo.ts` | Resumir trecho da conversa | `server/chats/ai.ts` |
| **noticias/** | | |
| `resumoCategoria.ts` | Resumo diário de notícias por categoria (Gemini)* | `server/services/news.ts` |
| **passagens/** | | |
| `criarMonitor.ts` | Pedido em linguagem natural → configuração do monitor | `server/flights/ai.ts` |
| `importarAlerta.ts` | Texto de alerta/e-mail → ofertas | `server/flights/ai.ts` |
| `analiseOfertas.ts` | Trade-offs e riscos das melhores ofertas | `server/flights/ai.ts` |
| `consultaSkyscanner.ts` | Busca assistida no Skyscanner pelo Chrome | `server/flights/assisted.ts` |
| **projetos/** | | |
| `contextoProjeto.ts` | Cabeçalho "CONTEXTO DO PROJETO" (repo/pasta/workspace) do Assistente e do Prompt Runner | `server/rpc.ts` |
| `resumoProjeto.ts` | Bloco de contexto de um projeto (usado pelos prompts de projeto do front) | `src/modules/projects/lib/ai.ts` |
| `plano.ts` | Plano para terminar a entrega atual | `src/modules/projects/pages/ProjectDetailPage.tsx` |
| `proximaAcao.ts` | 3 opções de próxima ação | `src/modules/projects/components/NextActionModal.tsx` |
| `ondePareiProjeto.ts` | "Onde parei" a partir da atividade recente | `src/modules/projects/pages/ProjectDetailPage.tsx` |
| `ondePareiTimer.ts` | "Onde parei" ao parar o timer | `src/modules/projects/components/SaveContextModal.tsx` |
| `ondePareiSessao.ts` | "Onde parei" no fim de uma sessão do Claude Code (hook) | `server/services/claudeHook.ts` |
| `retrospectiva.ts` | Retrospectiva no encerramento do projeto | `src/modules/projects/components/ClosingRitualModal.tsx` |
| `resumoProgresso.ts` | Resumo de progresso via `gh` | `src/modules/projects/components/ProgressModal.tsx` |
| `changelog.ts` | Changelog do ciclo a partir dos commits | `server/services/projectHub.ts` |
| `delegacao.ts` | Delegar a próxima ação ao Claude (worktree isolado) | `server/services/delegation.ts` |
| `montarPromptDelegacao.ts` | Escrever o prompt de delegação (só leitura) | `server/services/delegation.ts` |
| `delegarRoadmap.ts` | Tarefa + regras para delegar itens do roadmap | `src/modules/projects/lib/roadmap.ts` |
| `continuarBranch.ts` | Entregar uma branch a um agente para terminar | `src/modules/projects/git.ts` |
| **promptRunner/** | | |
| `sistemaConversa.ts` | Conversas: system prompt (contexto do projeto + agente + skills) | `server/rpc.ts` → `server/aiconv/runner.ts` |
| `composicao.ts` | Montagem agente → skills → prompt do usuário (modo antigo, sem uso hoje) | `src/modules/ai/compose.ts` |
| `mensagemCommit.ts` | Sugerir mensagem de commit | `server/aiconv/rpc.ts` |
| **viagens/** | | |
| `analiseHospedagem.ts` | As 3 melhores hospedagens da busca* | `src/modules/travel-stays/pages/StayFinderPage.tsx` |

\* recebe Memória Pessoal (integração aprovada).
