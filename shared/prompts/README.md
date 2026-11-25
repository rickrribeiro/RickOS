# Prompts do rickOS

Todo texto enviado a uma IA (Claude CLI ou Gemini) mora aqui, **um arquivo por prompt**, para dar para revisar tudo num lugar só. O código só monta os dados e chama a função do prompt.

* Cada arquivo começa com um comentário: o que o prompt faz, **onde é usado** e qual modelo/configuração usa.
* Prompt simples = função `promptXxx({ ...dados })` que devolve a string. System prompts e regras fixas = constantes (`SISTEMA_*`, `REGRAS_*`).
* Fica em `shared/` porque o servidor e o front usam (os dois tsconfigs incluem `shared/`). Nada de `window`, Node ou i18n aqui: prompts são sempre em **pt-BR**.
* Os dados (listas, contexto do projeto, mensagens) chegam já recortados pelo chamador. O que é privacidade/orçamento (ex.: só as mensagens selecionadas, limite de caracteres) continua no chamador.
* **Memória Pessoal**: nenhum prompt daqui recebe memória por conta própria. Os que recebem já estavam aprovados (ver `docs/memoria/integracoes.md`) e o bloco é anexado pelo chamador.

Fora daqui (de propósito): os **prompts do usuário** (agentes, skills e jobs agendados ficam no banco e são editados na UI; as sementes estão em `server/database/aiSeeds.ts`) e o schema de resposta do Gemini (`TOPICS_SCHEMA` em `server/services/news.ts`).

## Índice

| Arquivo | O que faz | Usado em |
|---|---|---|
| **assistente/** | | |
| `acoesRapidas.ts` | Botões do Assistente: priorizar tarefas, revisar inbox, planejar a semana*, roteiro de viagem*, resumo semanal, checklist de viagem | `src/modules/jarvis/pages/JarvisPage.tsx` |
| **braindump/** | | |
| `organizar.ts` | Despejo mental → tarefas, projetos, próximos passos e agenda (JSON) | `src/modules/braindump/pages/BrainDumpPage.tsx` |
| **comum/** | | |
| `respostaJson.ts` | Sufixo "responda APENAS com JSON" do helper `runJson` | `src/modules/projects/lib/ai.ts` |
| **crm/** | | |
| `retomarContato.ts` | 2-3 opções de mensagem para retomar contato | `src/modules/crm/pages/CrmPage.tsx` |
| **estudos/** | | |
| `tutor.ts` | Botões do tutor (explicar simples, resumir, exercícios, lacunas, socrático, recall ativo) | `src/modules/estudos/components/NoteEditor.tsx` |
| `flashcards.ts` | Gerar flashcards de uma anotação | `src/modules/estudos/components/FlashcardPanel.tsx` |
| `lacunasRoadmap.ts` | Pré-requisitos que faltam no roadmap do tópico | `src/modules/estudos/components/GapsModal.tsx` |
| `quiz.ts` | Quiz de múltipla escolha | `src/modules/estudos/components/QuizModal.tsx` |
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
| `composicao.ts` | Montagem agente → skills → prompt do usuário | `src/modules/ai/compose.ts` |
| `mensagemCommit.ts` | Sugerir mensagem de commit | `server/aiconv/rpc.ts` |
| **viagens/** | | |
| `analiseHospedagem.ts` | As 3 melhores hospedagens da busca* | `src/modules/travel-stays/pages/StayFinderPage.tsx` |

\* recebe Memória Pessoal (integração aprovada).
