# Estudos (Learning OS)

Abrir Estudos para começar ou retomar em segundos, guardar anotações do meu jeito e voltar para lembrar
ou aplicar. Três formas que convivem no mesmo tópico: **caderno** (escrever e ler material de fora),
**roteiro/masterclass** (o tutor desenha a trilha) e **aula conversacional**.

## Onde está cada coisa

| Caminho | O que é |
|---|---|
| `shared/estudos.ts` | tipos/DTOs e regras puras: grupos da biblioteca, **SM-2** (`schedule`, o mesmo de antes), lacuna, comparação de respostas |
| `server/estudos/repo.ts` | biblioteca, Continuar, Tenho N minutos, cartões por direção, fila diária, fontes, checkpoints, perguntas/tentativas — **sem IA** |
| `server/estudos/attachments.ts` | imagens do caderno (`<dataDir>/estudos/anexos`, link estável `anexos/<arquivo>`) |
| `server/estudos/bundle.ts` | exportação determinística (manifesto, Markdown, anexos, `dados.json`) e restauração |
| `server/estudos/git.ts` | vincular repositório, **Sincronizar**, restaurar |
| `server/estudos/adopt.ts` | adotar o acervo antigo do repositório por pasta, com prévia |
| `server/estudos/tutor.ts` | executor do tutor (Codex pelo gateway), masterclass (A), roteiro, aula (B) |
| `server/estudos/material.ts` | material do nó (C), revisão editorial (D), subtópicos (E), decisões |
| `server/estudos/contexto.ts` | o que o app **envia ao provedor** (orçamentos em caracteres) |
| `shared/prompts/estudos/pedagogia/textos.ts` | **textos-base A–E** + camada comum (assets revisáveis) |
| `shared/prompts/estudos/pedagogia/schemas.ts` | contratos de saída (JSON Schema estrito → `--output-schema`) |
| `shared/prompts/estudos/perfis.ts` | perfis de modelo/effort só de Estudos |
| `server/estudos/evals/` | casos + rubricas; `npm run estudos:evals` roda com o Codex real |
| `src/modules/estudos/` | telas: Home, caderno (roteiro · leitura/aula/material · notas), cartões, perguntas, revisões, testar |

Tabelas novas: `study_card_categories`, `study_card_states` (agenda por direção), `study_sources`,
`study_checkpoints`, `study_questions`, `study_attempts`, `study_attachments`, `study_origins`,
`study_ai_runs`, `study_plans`, `study_lessons`, `study_lesson_turns`, `study_materials`,
`study_suggestions`. Colunas novas nas antigas: migrações **45** e **46** (`server/database/db.ts`).

## Regras que o código garante

* **Zero chamadas de modelo** para abrir, retomar, filtrar, trocar aba, ver a última geração, revisar
  cartão, aprovar, exportar e sincronizar (testes contam as invocações do motor).
* **SRS**: o SM-2 é o de antes. O cartão antigo virou a direção `forward` com o histórico intacto.
  Comportamento real do **Again** (preservado e testado): ease −0,32 (piso 1,3), repetições 0,
  intervalo 0 e próxima revisão **hoje** — o cartão continua na fila do dia.
* Direções com agenda independente (Reconhecimento/Produção nos idiomas; frente→verso e reverso
  opcional nos temas). Desligar o reverso suspende sem apagar o histórico.
* Sugestões da IA (cartões, edições, subtópicos) ficam **fora** do baralho/nota/mapa até eu aprovar.
* Tutor: execução no servidor, dedupe por chave, a mais nova vence, falha/timeout/cancelamento/JSON
  inválido preservam o que era válido; Codex em sandbox read-only num diretório vazio, sem acesso a
  arquivos, notas ou Git. O **contexto** (mostrado antes de gerar) vai ao provedor.
* Memória Pessoal: **não integrada** (decisão do usuário). Nada de memória nos prompts de Estudos.
* **Briefing acompanha a aula**: o pedido do roteiro (`study_plans.request`, curto ou colado) e o que o
  plano registrou dele (situação, já sei, restrições, preferências, decisões em aberto, suposições,
  entrega final) entram no contexto de **toda** aula do roteiro. O plano certo vem da aula → nó →
  ancestral (`planoDaAula` em `contexto.ts`), então vários roteiros no mesmo tópico não se misturam.
  Sem IA extra: nada é resumido por modelo.
* **Abertura que ensina**: `aberturaPrimeiraAula.aula` (Markdown) vem na mesma geração do roteiro e
  vira o 1º turno ao aprovar (`textoAbertura`). Planos antigos, sem `aula`, continuam legíveis.
* **Turnos no contexto** (`turnosParaContexto`): abertura e último turno do tutor com cota própria e
  corte que preserva começo **e fim**; os demais do mais recente ao mais antigo; o que não cabe vira
  uma linha cada (minha fala / pergunta aberta salva). Orçamentos em `ORCAMENTO`.

## Configurar o Codex

1. Instale e entre: `npm i -g @openai/codex` e `codex login` no terminal da máquina do servidor.
2. Em Estudos → **🤖 IA de Estudos**: confira os perfis e clique **Diagnosticar Codex** (local: versão,
   login e se os modelos existem no catálogo do CLI; não envia contexto).

| Operação | Perfil inicial |
|---|---|
| Masterclass / repensar currículo | `gpt-6.2-astra` / `high` |
| Aula, dúvida, material do nó | `gpt-6.2-sol` / `medium` |
| Revisão editorial, subtópicos | `gpt-6.2-sol` / `low` |
| Abrir, retomar, filtrar, revisar, aprovar, exportar, sincronizar | zero chamadas |

Os perfis valem só para Estudos (chaves `study_ai_*`); cada chamada também aparece em
Configurações → IA. Se o Codex estiver indisponível, nada troca de provedor: caderno, SRS e todo
material salvo continuam acessíveis e o erro traz o diagnóstico.

## Apontar o repositório de estudos

Estudos → **🔗 Repositório**: remoto, branch e pasta gerenciada (padrão `rickos-estudos/`) → **Ver
prévia** (clona numa pasta temporária; mostra se a pasta está livre, já é do rickOS ou ocupada) →
**Vincular**. Credenciais: as do git do servidor (chave SSH ou credential helper); o rickOS não guarda
token. O servidor usa um checkout dedicado em `<dataDir>/estudos/repo`.

* **Sincronizar**: exporta, faz fetch, fast-forward (ou merge limpo testado), adiciona só arquivos
  gerenciados, commita `estudos: sincronizar caderno` e faz push. Sem diferença → "Tudo sincronizado".
  Push falhou → "Commit local salvo · envio pendente" (o próximo clique reenvia). Arquivo gerenciado
  editado fora: o do repositório fica; se o banco também mudou, a versão do rickOS vai para
  `<dataDir>/estudos/divergencias/`. Nunca reset destrutivo nem force push.
* **Importar acervo**: escolha a pasta do repositório, veja reconhecidos/ignorados/colisões/links
  faltantes e importe como notas (subpastas viram seções) ou como fontes de leitura. Originais
  intactos; reimportar a mesma origem propõe atualizar ou ignorar.
* **Restaurar** (instalação nova): lê `manifest.json` + `dados.json` + `anexos/`.

## Reproduzir os dois cenários

**(a) Mandarim, sem IA**: criar tópico tipo Idioma (`zh`) → Caderno → Leitura → 📄 TXT/MD (prévia,
importar) → Minhas notas → 🖼 Imagem (ou colar) com legenda → Cartões → ＋ Cartão (expressão, frente
`明天几点见面？`, verso "Pergunte a que horas vamos nos encontrar amanhã", produção ligada, variantes,
exercício "mude para sábado") → Revisões (Reconhecimento e Produção em separado) → ⇅ Sincronizar.

**(b) Backend multiplayer, com IA**: criar tópico → 🗺️ Roteiro (IA) → "quero estudar backend
multiplayer para decidir a arquitetura do meu jogo Unity" → ver o contexto enviado → Gerar → editar,
aprovar → a primeira aula abre com a abertura do roteiro (sem nova chamada) → responder (1 chamada) →
＋ Adicionar à minha nota → abrir no celular: **Continuar** leva ao mesmo ponto.
Depois um pedido curto ("quero conseguir remarcar um encontro em mandarim") para ver a trilha mudar
de método e de escala.

**Continuidade com o Codex real**: `npm run estudos:evals -- continuidade` roda o briefing do Trama e o
de mandarim: masterclass → aprovar → abertura → uma dúvida → um follow-up que cita o fim da resposta
anterior, com rubricas e o tamanho do contexto de cada turno (`evals/ultimo-relatorio-continuidade.md`).

## Modelo de roadmap (exportar/importar a trilha)

Tópico → **Exportar → 🗺️ Modelo de roadmap** baixa `<tópico>.roteiro.json`: árvore do roadmap, o
briefing do roteiro aprovado (`roteiro.pedido` + `roteiro.plano`) e, opcionalmente, o conteúdo das
aulas (todos os turnos) e as minhas notas. **Não** vão progresso, cartões/agenda, perguntas nem
imagens anexadas. Home → **🗺️ Importar modelo**: prévia (itens, aulas, avisos), destino (tópico novo
ou existente, com os itens depois dos que já estão lá) e importação numa transação só. As aulas
abrem prontas (zero chamadas) e o briefing continua acompanhando cada aula. Código:
`server/estudos/modelo.ts`; formato: `ModeloRoadmap` em `shared/estudos.ts`. Escrito à mão, o mínimo é:

```json
{ "formato": "rickos-roteiro", "versao": 1, "topico": { "nome": "Mandarim", "tipo": "idioma", "idiomaAlvo": "zh" },
  "itens": [{ "titulo": "Dias e horas", "itens": [{ "titulo": "几点", "aula": { "titulo": "", "turnos": [{ "papel": "tutor", "conteudo": "明天几点见面？" }] } }] }] }
```

## Pedir ao Codex uma segunda revisão editorial dos prompts

Sem mexer no provedor nem no resto: edite **só** `shared/prompts/estudos/pedagogia/textos.ts`, suba
`VERSAO_PEDAGOGIA` e rode `npm run estudos:evals`. Sugestão de pedido ao Codex:

> Revise editorialmente os textos A–E em `shared/prompts/estudos/pedagogia/textos.ts` preservando a
> intenção e a densidade. Não altere schemas, transporte, perfis nem outros arquivos. Ao terminar,
> suba `VERSAO_PEDAGOGIA`, rode `npm run estudos:evals` e compare com
> `server/estudos/evals/ultimo-relatorio.md`.

Os testes de contrato (`npm test`) usam fixtures e não gastam tokens.
