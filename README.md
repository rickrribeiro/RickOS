# RickOS — Personal OS (Local-First Desktop App)

Um "sistema operacional pessoal" de mesa, **local-first**: começou como time tracker e cresceu para um painel único que reúne organização, projetos/GitHub, finanças, viagens, estudos (Learning OS) e uma camada de IA que roda o **Claude Code local**. Tudo roda offline; os dados ficam num único arquivo SQLite na sua máquina.

> Stack: **Electron + React + TypeScript + Vite + Fastify + sql.js (SQLite em WASM) + Zustand**. Um servidor local atende o desktop e a web/celular; sem nuvem obrigatória.
>
> **Vai mexer no código (humano ou IA)?** Leia o [`CLAUDE.md`](CLAUDE.md): arquitetura, receita de feature e regras.

---

## ✨ Módulos

| Grupo | O que faz |
|-------|-----------|
| **🏠 Dashboard** | Visão do dia: tarefa ativa, top tarefas (recorrentes só aparecem na data), hábitos, horas da semana, próxima viagem, daily standup, card de **revisão semanal** (relatório salvo) e o botão **🧠 Despejar minha cabeça** (brain dump → IA sugere tarefas/projetos/agenda). |
| **⏱ Time Tracker** | Timeline contínua 00:00–23:59 com blocos arrastáveis/redimensionáveis, tarefa ativa com timer, tags (com produtividade e vínculo a projeto), calendário mensal com heatmap, eventos do Google Calendar e aniversários, estatísticas, e **modo Pomodoro** que cria a task na timeline. |
| **🗂 Organização** | **Inbox** (captura rápida, atalho global) · **TODO** (prioridade/prazo/projeto/notas, recorrentes que voltam na data, filtros, concluídas paginadas, visualização em **quadro** com arrastar cards) · **Brain Dump** · **Metas** mensais (livres ou ligadas a projeto/tópico de estudo, com quantidade e unidade) · **Hábitos** (grade mensal + insights) · **Automações** (regras de aviso: sem foco produtivo, estouro de orçamento, trabalho esquecido em branches, flashcards acumulando; e prompts agendados que a IA roda num horário) · **Base de Conhecimento** (o que a IA e as recomendações devem saber sobre você). |
| **🎓 Estudos (Learning OS)** | Tópicos → roadmap em árvore (drag-and-drop) → anotações em Markdown (editor + preview) → flashcards (manuais ou gerados por IA) → revisão espaçada **SM-2** → quiz automático → busca → export (caderno `.md`, JSON, pasta Obsidian). |
| **💰 Finanças** | Contas, transações (import CSV), orçamento, investimentos com **histórico mensal, variação (valor e %) e gráfico de evolução**, evolução de gastos em 12 meses, card de IOF, relatórios, câmbio manual, modo privacidade (ocultar valores), e Open Finance via **Pluggy**. |
| **👥 Social** | **Pessoas** (CRM: follow-ups, aniversários, prioridade/VIP, tags, redes com link para abrir a conversa, busca por expressões como `cidade=null`, `tag=`, `rede=`) e **Chats**, a Central de Mensagens: WhatsApp, Instagram, LinkedIn… via Beeper numa inbox só, com fotos, não lido × não respondido, menções em grupos, triagem em lote, lembretes, radar de pessoas esquecidas e sugestões de resposta com IA (só das mensagens que você selecionar). Ver `docs/mensagens.md`. |
| **📁 Projetos** | **Central de Projetos**: situação (incubadora, fila, foco, pausado, concluído, encerrado) × estágio, limite de projetos em foco, próxima ação, ciclos com prazo, cockpit e página de cada projeto, roadmap lido do `ROADMAP_RICKOS.md` do repositório (ver `docs/ROADMAP_RICKOS.md`), radar diário de projetos parados, "onde parei" automático a partir das sessões do Claude Code, **delegação** de tarefas ao Claude (worktree + PR), changelog, ritual de fechamento e sugestão de projetos novos achados em `~/Projects`. **Issues (Kanban)** sincronizadas com o **GitHub** (token ou SSH), com criação via Claude local. |
| **🌿 Worktrees & Branches** | Estado de todas as branches/worktrees locais (projetos + pastas escaneadas): 🔴 em risco, 🟠 esquecida, 👻 órfã, 🟡 em andamento, 🟢 pode limpar. Detalhes (commits/arquivos/diff), criar PR, continuar no Prompt Runner, limpar mergeadas, prune; card na Home e regra de aviso em Automações. |
| **✈️ Viagens** | Viagens com destinos, documentos e recomendações; monitoramento inteligente de **passagens** (origens/destinos flexíveis, restrições, países proibidos para conexão, ranking, histórico, alertas e busca no Skyscanner via Chrome — ver `docs/passagens.md`). **Hospedagens** (busca ranqueada por custo-benefício, ainda com dados de demonstração) e **Roteiro** (em breve: pontos, rotas e horários montados pela IA) estão em desenvolvimento. |
| **🤖 IA** | **Assistente**, biblioteca de **Skills** e **Agentes**, **Prompt Runner** e **Histórico** de execuções. O Prompt Runner conversa com o Claude CLI em abas paralelas com streaming: continua (`--resume`) e ramifica conversas, aprova permissões e responde perguntas pela UI, fila de prompts, imagens, worktree por conversa com mudanças/commit/PR, importa sessões do terminal, usa as skills/comandos do Claude Code, fixa/arquiva sessões e mostra os limites de uso (5 h e semanal) do Claude e do Codex. |
| **🧞 Jarvis** | Assistente pessoal (em desenvolvimento). |
| **⚙️ Configurações / 🔗 Links** | Integrações (GitHub, Google Calendar multi-conta, Pluggy, Beeper, comando/ferramentas do Claude), **Módulos** (ocultar grupos inteiros ou páginas individuais da sidebar), skins (`classic`, `devlytics`) e tema claro/escuro; e uma lista de links com tags/filtros e "abrir marcados/por tag". |

> **Princípio:** o app e a IA **sugerem**; você aprova cada criação, agrupamento ou vínculo.

---

## 🚀 Começando

Pré-requisitos: **Node.js 18+** e npm. Para os recursos de IA, o **Claude Code CLI** instalado (`claude`).

```bash
npm install
npm run dev        # desktop (Electron); o servidor sobe embutido
npm run dev:web    # web: servidor + Vite em http://127.0.0.1:5317
```

### Uso no dia a dia

```bash
npm run app:install   # gera o TimeTracker.app e instala em /Applications (rode de novo após mudanças)
npm run desktop       # bin/rickos-desktop: sobe o servidor (se preciso) e abre o TimeTracker.app
npm run web           # bin/rickos-web: sobe o servidor (se preciso) e abre http://127.0.0.1:4318
npm run stop          # bin/rickos-stop: desliga o servidor iniciado pelos scripts
```

- O servidor só sobe quando você roda um dos scripts e fica ligado até o `stop`. Os logs ficam em `~/Library/Logs/rickOS/`.
- Os scripts recompilam a web sozinhos quando o código muda.
- Abrir o `TimeTracker.app` direto (Dock/Spotlight) também funciona: sem servidor rodando, o app sobe um embutido, que serve a web em `:4318` e desliga ao sair do app.

Desktop e web usam **o mesmo servidor e o mesmo banco**. Se o `dev:web` já estiver rodando, o Electron reaproveita o servidor dele.

Build de produção:

```bash
npm run build            # desktop: typecheck + bundle (main/preload/renderer)
npx electron-builder     # empacota o app (saída em release/)
npm run build:web        # web: front em dist/ + servidor em dist-server/
npm start                # servidor de produção (serve a web em http://127.0.0.1:4318)
```

### Celular

```bash
RICKOS_HOST=0.0.0.0 RICKOS_TOKEN=<um-segredo-longo> npm start
```

Abra `http://<ip-do-mac>:4318` no celular, cole o token e use "Adicionar à tela inicial" (é um PWA). Para usar fora de casa, rode numa VPS atrás de HTTPS (Caddy/sslip.io) e defina `RICKOS_PUBLIC_URL` para o OAuth do Google.

| Variável | Padrão | Uso |
|---|---|---|
| `RICKOS_DATA_DIR` | `~/Library/Application Support/time-tracker` | banco, snapshots e `secret.key` |
| `RICKOS_PORT` | `4318` | porta do servidor |
| `RICKOS_HOST` | `127.0.0.1` | `0.0.0.0` para acesso pela rede |
| `RICKOS_TOKEN` | (vazio) | obrigatório fora do localhost |
| `RICKOS_PUBLIC_URL` | (vazio) | URL pública (callback OAuth em `/api/google/callback`) |
| `RICKOS_SERVER_URL` | (vazio) | faz o desktop usar um servidor remoto |

> ⚠️ Mudanças em `electron/` ou `server/` exigem **reiniciar o `npm run dev`**. No `dev:web`, o servidor recarrega sozinho (`tsx watch`).

---

## 🤖 Integração com IA (Claude Code local)

Os recursos de IA (Assistente, Prompt Runner, Brain Dump, geração de flashcards, IA-tutor, quiz, delegação de projetos, sugestões de resposta) executam o **Claude Code CLI** na sua máquina via `child_process` (`services/claude.ts`) — nada é enviado a APIs pagas diretamente pelo app.

- Execuções rodam em **background no processo principal** (sobrevivem à navegação) com **streaming** ao vivo (texto, pensamento e uso de ferramentas).
- Configurável em **Configurações → IA**: o comando (`claude` por padrão, ou um alias) e as **ferramentas permitidas** (ex.: `Bash(gh:*) Bash(git:*) Read Write Edit`).
- Ao selecionar um projeto no Prompt Runner, o contexto do repositório é injetado no prompt (ex.: usar `gh --repo owner/repo`).

---

## 🔌 Integrações externas (opcionais)

Todas configuráveis em **Configurações**; o app funciona 100% sem elas.

| Integração | Uso | Observação |
|-----------|-----|-----------|
| **GitHub** | Issues (Kanban) + criar issues via Claude | Token ou SSH da máquina |
| **Google Calendar** | Eventos na timeline/dashboard | OAuth, **multi-conta**, sync automático 1×/dia |
| **Pluggy (Open Finance)** | Importar transações bancárias | Client ID/Secret + Pluggy Connect |
| **Beeper Desktop API** | Central de Mensagens (WhatsApp, Instagram, LinkedIn…) | `npm run beeper:setup` (instala, obtém o token por OAuth e configura); modo direto ou agente local no Mac — ver `docs/mensagens.md` |
| **Aviasales Data API / Duffel** | Preços de passagens (cache / ao vivo) | Token gratuito (Travelpayouts) / conta live Duffel — ver `docs/passagens.md` |

A data/hora da última sincronização de cada integração aparece em Configurações.

---

## 💾 Backup e dados

- **Exportar/Importar banco** (botões na sidebar): snapshot `.sqlite` completo, baixado no dispositivo ou enviado ao **Google Drive**.
- **Estudos**: export por tópico como caderno `.md`, backup JSON ou pasta Markdown (compatível com Obsidian).
- Como tudo é um arquivo SQLite, o backup completo já inclui todos os módulos.

---

## ⌨️ Atalhos

| Atalho | Ação |
|--------|------|
| `Ctrl/Cmd + Shift + Space` | Captura rápida (Inbox) — global |
| `Ctrl/Cmd + Space` | Parar tarefa ativa |
| `Ctrl/Cmd + 1–4` | Navegar entre páginas principais |
| No TODO | `↑/↓` navegar · `espaço` concluir · `p` adiar · `e` editar |

---

## 📄 Licença

Projeto pessoal. Uso interno.
