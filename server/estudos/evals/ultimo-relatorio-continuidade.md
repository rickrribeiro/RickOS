# Avaliação dos prompts de Estudos (Codex real)

- Versão dos prompts: `estudos-pedagogia-2026-11-27.1`
- Data: 2026-11-26T21:42:29.530Z

| Caso | Operação | Modelo / effort | Latência | Tokens | Status | Rubricas |
|---|---|---|---|---|---|---|
| continuidade-trama · abertura | masterclass | gpt-6.2-astra/high | 126.6 s | 21610 in / 5264 out | ok | 9/9 |
| continuidade-trama · turno 1 (dúvida) | aula | gpt-6.2-sol/medium | 17.9 s | 21878 in / 687 out | ok | 4/4 |
| continuidade-trama · turno 2 (follow-up) | aula | gpt-6.2-sol/medium | 20.7 s | 22407 in / 924 out | ok | 4/4 |
| continuidade-mandarim · abertura | masterclass | gpt-6.2-astra/high | 58.2 s | 21584 in / 2677 out | ok | 9/9 |
| continuidade-mandarim · turno 1 (dúvida) | aula | gpt-6.2-sol/medium | 22.1 s | 21508 in / 1002 out | ok | 3/3 |
| continuidade-mandarim · turno 2 (follow-up) | aula | gpt-6.2-sol/medium | 17.3 s | 22016 in / 785 out | ok | 4/4 |

## continuidade-trama · abertura

- ✅ dependências coerentes (pré-requisito vem antes) — ok
- ✅ conteúdo específico do objetivo (≥ 60% dos módulos) — 8/8
- ✅ primeiro passo executável (curto e concreto) — Em dez minutos, desenhe três colunas em papel para A, autoridade e B. Preencha uma linha após cada passo e circule a pri
- ✅ perguntas diagnósticas e critérios observáveis — ok
- ✅ entrega final ligada ao objetivo — Entregar uma decisão de arquitetura para o Trama e demonstrá-la com dois clientes Unity disputando uma das oito posições. Um cliente perde a confirmação, entra 
- ✅ escala 5–20 módulos — 8
- ✅ abertura ensina antes de perguntar (≥ 900 caracteres) — 2258 caracteres
- ✅ exemplo com começo, meio e fim (≥ 3 passos) — 10 marcadores de sequência
- ✅ termina numa pergunta — Logo depois que B recebe a versão 13, A ainda vê seu toque como pendente. Ao se reconectar, por que A deveria apresentar `A17` de novo em ve

<details><summary>Saída</summary>

```json
{
  "mapa": [
    "Da tela do jogador à regra da partida: 1. O percurso de um toque | 2. As oito posições como contrato de jogo",
    "Quem decide e como o Unity acompanha: 3. Três lugares para decidir a mesma disputa | 4. Mensagens, versões e retorno ao jogo",
    "O que a experiência mobile e a operação exigem: 5. O que mostrar enquanto a jogada está em trânsito | 6. Da partida isolada à carga e ao custo",
    "Workshops de decisão do Trama: 7. Dois candidatos sob a mesma disputa | 8. A decisão e a condição para revê-la"
  ],
  "jaSei": "Conheço backend SaaS e Postgres.",
  "restricoes": [
    "Meu jogo é mobile em Unity.",
    "O jogo tem oito posições."
  ],
  "decisoesEmAberto": [
    "Quem tem autoridade para validar uma jogada e definir sua ordem?",
    "A partida avança por comandos, por passos de simulação ou pela combinação dos dois?",
    "Como o Unity envia ações, recebe mudanças e se recupera ao voltar do segundo plano?",
    "Que estado precisa sobreviver à queda de um processo e em que momento precisa ser persistido?",
    "Qual arquitetura atende aos requisitos de jogo, latência, capacidade, custo e operação do Trama?"
  ],
  "primeiroTurno": "### A posição 4 já tem dono. Quem sabe disso?\n\nImagine uma operação de backend SaaS que reserva a última vaga. Com Postgres, uma forma de decidir a disputa é atualizar a vaga sob a condição de ela continuar livre. Uma transação consegue ocupá-la. A outra, ao avaliar a condição sobre a vaga já ocupada, descobre que perdeu. Essa experiência ajuda a entender **onde a decisão acontece**. No Trama há outra questão prática: duas telas podem ter informações diferentes sobre uma decisão já tomada.\n\n1. **Antes dos toques**, a autoridade e os dois clientes conhecem a versão 12 da partida. Nela, a posição 4 está livre. Cada tela exibe a última informação que recebeu.\n2. **A toca na posição 4.** O Unity envia o comando `A17`, que identifica aquela tentativa de ocupar a posição. A interface destaca a posição como pendente. B também toca e envia `B09`. Até aqui, cada aparelho conhece seu próprio toque. Quem tocou primeiro no relógio local e qual mensagem chega primeiro podem ser coisas diferentes.\n3. **A autoridade processa `A17` primeiro.** Para ilustrar com Postgres, imagine que uma transação ocupe a posição, avance a partida para a versão 13 e registre o resultado de `A17`. Quando a transação confirma, A ganhou a posição segundo a regra do exercício. Nesse instante, os dois aparelhos ainda podem estar mostrando a versão 12.\n4. **`B09` é processado em seguida.** A posição já pertence a A. A autoridade responde a B que a tentativa foi rejeitada e devolve o estado da versão 13. O Unity de B retira o destaque pendente e mostra A na posição 4. A resposta destinada a A se perde quando o celular troca de rede. Agora B conhece o vencedor e o próprio vencedor ainda está esperando.\n5. **A se reconecta.** O cliente apresenta novamente `A17`. A autoridade reconhece o identificador, recupera o resultado registrado e devolve a confirmação junto do estado atual. A sai do estado pendente. Mesmo que outra jogada já tivesse alterado o tabuleiro, o registro de `A17` ainda explicaria o que aconteceu com aquele toque.\n\nPostgres tornou o ponto de decisão familiar. Para comparar depois com um processo de sala ou um anfitrião, acompanhe as mesmas três coisas em cada desenho: onde a jogada passa a valer, como o resultado fica associado à tentativa e por qual mensagem cada tela toma conhecimento dele.\n\n**Primeiro passo hoje:** Em dez minutos, desenhe três colunas em papel para A, autoridade e B. Preencha uma linha após cada passo e circule a primeira linha em que a posição já tem dono, mas nenhum dos jogadores recebeu a confirmação.\n\n**Pergunta:** Logo depois que B recebe a versão 13, A ainda vê seu toque como pendente. Ao se reconectar, por que A deveria apresentar `A17` de novo em vez de criar uma nova tentativa `A18`?"
}
```

</details>

## continuidade-trama · turno 1 (dúvida)

- ✅ aproveita minha experiência (SaaS/Postgres) — saas, postgres, banco
- ✅ explica onde a transação ajuda — transac
- ✅ relaciona ao que cada jogador vê — tela,  ve ,  vê, ver , latenc, latência
- ✅ retoma a aula com uma pergunta no fim — nviar `A17`? Compare com o caso original, em que `A17` já tinha sido aceito. Por que A deveria usar o mesmo identificador nos dois casos, em vez de criar `A18`?

<details><summary>Saída</summary>

```json
{
  "eu": "Se dois jogadores pegam a mesma gema, por que eu não resolveria isso com uma transação no Postgres?",
  "contextoChars": 6614,
  "tutor": "Se A e B pegam a mesma gema e a regra é que só um pode ficar com ela, uma transação no Postgres pode resolver a disputa. É o mesmo padrão da última vaga no SaaS. O que a experiência com a vaga resolve é quem fica com a gema. No jogo, cada Unity também precisa descobrir o resultado, mesmo se a resposta se perder.\n\nImagine que A e B veem a gema disponível na versão 12. A autoridade recebe `A17` e `B09`. Para cada comando, ela tenta atualizar a gema sob a condição de ela ainda estar disponível. Se `A17` efetiva a mudança primeiro, a mesma transação registra o resultado de `A17` e avança a partida para a versão 13. Quando a tentativa de B avalia a condição sobre a gema já ocupada, nenhuma linha é atualizada. B recebe a rejeição e vê A com a gema na versão 13. Se a resposta a A se perde, a gema continua com A, mas o Unity de A ainda mostra o toque como pendente. A transação definiu o resultado. As mensagens deram a cada tela evidência dele em momentos diferentes.\n\nPara coletas discretas, vale testar se uma ida ao banco por jogada atende à latência e à carga do Trama. Se a coleta depender de colisões em uma simulação contínua, um processo de sala pode decidir quem pegou a gema no passo da simulação e persistir o que precisa sobreviver. Isso permite tirar a ida ao banco do caminho de cada passo, mas exige definir como a sala se recupera de uma queda e quais resultados precisam estar gravados antes de serem confirmados.\n\nVoltando ao toque pendente, mude uma premissa. A conexão caiu **antes de `A17` chegar** e `B09` ocupou a gema. Que resultado você prevê quando A reenviar `A17`? Compare com o caso original, em que `A17` já tinha sido aceito. Por que A deveria usar o mesmo identificador nos dois casos, em vez de criar `A18`?"
}
```

</details>

## continuidade-trama · turno 2 (follow-up)

- ✅ retoma a aula com uma pergunta no fim — be primeiro só a versão 13, que mostra a gema com A. O que essa atualização já permite mostrar na tela e que informação falta para encerrar o pendente de `A17`?
- ✅ responde ao detalhe citado do fim da resposta anterior — resultado, quando, reenviar, aceito
- ✅ o trecho citado chegou ao provedor (contexto do turno 2) — 8587 caracteres de contexto
- ✅ o briefing chegou ao provedor — pedido original no contexto

<details><summary>Saída</summary>

```json
{
  "eu": "Sobre o que você disse no final (\"Que resultado você prevê quando A reenviar A17? Compare com o caso original, em que A17 já tinha sido aceito.\"): como isso fica no celular de cada um dos oito jogadores?",
  "contextoChars": 8587,
  "tutor": "A abre o Trama de novo e ainda vê **coleta pendente**. B já vê a gema com um dono. Para visualizar os oito celulares, vamos supor oito jogadores, de A a H, com A e B disputando a gema da posição 4. Cada celular exibe a última versão confirmada que recebeu e pode ter um toque local pendente.\n\n| Celular | `A17` foi aceito, mas A perdeu a resposta | `A17` nunca chegou e `B09` ocupou a gema |\n|---|---|---|\n| **A** | O toque fica pendente até A receber o resultado de `A17`. Ao reenviá-lo, A recebe o aceite já registrado e vê a gema com A. | O toque também fica pendente. Ao reenviar `A17`, a autoridade o avalia pela primeira vez, encontra a gema com B e rejeita a jogada. A remove o pendente e vê a gema com B. |\n| **B** | Ao receber a rejeição de `B09` com a versão 13, remove o pendente e vê a gema com A. | Ao receber o aceite de `B09` com a versão 13, remove o pendente e vê a gema com B. |\n| **C a H** | Cada um vê a gema com A quando recebe a versão 13. Até lá, quem ainda está na versão 12 a vê livre. | Cada um vê a gema com B quando recebe a versão 13. Até lá, quem ainda está na versão 12 a vê livre. |\n\nA transação do Postgres, como na reserva da última vaga, fixa o vencedor no instante em que confirma a coleta. A versão 13 informa **quem ficou com a gema**. O resultado associado a `A17` informa ao celular de A **o que aconteceu com aquele toque**. As duas informações podem chegar juntas ou em momentos diferentes.\n\nAo voltar do segundo plano, A reutiliza `A17` para identificar o mesmo toque. Se já houver um resultado registrado, a autoridade o devolve sem reaplicar a jogada. Se for a primeira vez que recebe `A17`, avalia a tentativa pelo estado vigente. Usar `A18` apresentaria o toque como uma nova tentativa, sujeita a uma nova avaliação.\n\n**De volta ao toque pendente.** Imagine que `A17` foi aceito e, ao voltar, A recebe primeiro só a versão 13, que mostra a gema com A. O que essa atualização já permite mostrar na tela e que informação falta para encerrar o pendente de `A17`?"
}
```

</details>

## continuidade-mandarim · abertura

- ✅ dependências coerentes (pré-requisito vem antes) — ok
- ✅ conteúdo específico do objetivo (≥ 60% dos módulos) — 3/3
- ✅ primeiro passo executável (curto e concreto) — Leia a fala de B em voz alta uma vez. Depois cubra a fala e deixe à vista só 明天 · 晚上 · 八点 para responder à sua vez.
- ✅ perguntas diagnósticas e critérios observáveis — ok
- ✅ entrega final ligada ao objetivo — Em uma conversa curta, remarque um encontro sem ler um roteiro. A outra pessoa vai recusar sua primeira proposta e sugerir outro horário. Ao terminar, cada um r
- ✅ escala 2–8 módulos — 3
- ✅ abertura com diálogo no idioma-alvo (≥ 2 falas) — 4 linhas no idioma-alvo
- ✅ explica o suficiente sem virar aula longa (250–3500 caracteres) — 717 caracteres
- ✅ me dá a vez no fim — hã) + **晚上** (*wǎnshang*, à noite) + **七点** (*qī diǎn*, sete horas). Para propor oito da noite, troque apenas **七点** por **八点** (*bā diǎn*).

<details><summary>Saída</summary>

```json
{
  "mapa": [
    "Fazer a primeira proposta: De hoje para amanhã",
    "Negociar e fechar o novo horário: Ouvir a recusa até o fim | Confirmar o que ficou combinado"
  ],
  "jaSei": "Meu objetivo é «conseguir remarcar um encontro em mandarim». Ainda não informei o que já sei do idioma.",
  "restricoes": [
    "As explicações ficam em pt-BR. As falas e os exercícios de prática ficam em mandarim, com apoio em pt-BR."
  ],
  "decisoesEmAberto": [],
  "primeiroTurno": "### Podemos passar para amanhã?\n\n**A** 今天晚上七点见？  \n*Jīntiān wǎnshang qī diǎn jiàn?*  \nA gente se vê hoje às sete da noite?\n\n**B** 不好意思，我今天去不了了。能改到明天晚上七点吗？  \n*Bù hǎoyìsi, wǒ jīntiān qù bù liǎo le. Néng gǎi dào míngtiān wǎnshang qī diǎn ma?*  \nDesculpa, hoje não vou conseguir ir. Podemos passar para amanhã às sete da noite?\n\n**A** 可以，明天晚上七点见！  \n*Kěyǐ, míngtiān wǎnshang qī diǎn jiàn!*  \nPode ser. Até amanhã às sete da noite!\n\nUse **不好意思，我今天去不了了** como uma fala inteira para avisar do imprevisto. Em seguida, encaixe o novo horário em **能改到……吗？**. Monte o horário do maior para o menor: **明天** (*míngtiān*, amanhã) + **晚上** (*wǎnshang*, à noite) + **七点** (*qī diǎn*, sete horas). Para propor oito da noite, troque apenas **七点** por **八点** (*bā diǎn*).\n\n**Primeiro passo hoje:** Leia a fala de B em voz alta uma vez. Depois cubra a fala e deixe à vista só 明天 · 晚上 · 八点 para responder à sua vez.\n\n**Pergunta:** **A** 今天晚上七点见？ (*Jīntiān wǎnshang qī diǎn jiàn?* — A gente se vê hoje às sete da noite?) **Sua vez como B:** hoje você não consegue ir. Como pede para passar para amanhã às oito da noite?"
}
```

</details>

## continuidade-mandarim · turno 1 (dúvida)

- ✅ continua a conversa no idioma-alvo — 。, ？, 吗, 好, 可以
- ✅ reage ao que eu disse (sábado/amanhã) — 星期六, 明天, sábado, sabado, amanhã, amanha
- ✅ retoma a aula com uma pergunta no fim —  wǎnshang qī diǎn jiàn?*). Se amanhã às sete também ficou ruim, mas às oito funciona, como você avisa que hoje não consegue ir e propõe amanhã às oito da noite?

<details><summary>Saída</summary>

```json
{
  "eu": "不好意思，明天不行。星期六下午可以吗？",
  "contextoChars": 3782,
  "tutor": "Se alguém tivesse acabado de propor amanhã, sua fala funcionaria bem. **不好意思，明天不行。星期六下午可以吗？** (*Bù hǎoyìsi, míngtiān bù xíng. Xīngqīliù xiàwǔ kěyǐ ma?*) quer dizer “Desculpa, amanhã não dá. Sábado à tarde pode ser?” O trecho **明天不行** recusa amanhã, e **星期六下午可以吗？** propõe sábado à tarde, deixando a hora para combinar depois.\n\nAqui, A está confirmando **hoje às sete da noite**. Dá para aproveitar a estrutura que você usou: primeiro avise qual dia deixou de funcionar, depois proponha o novo horário. Veja como isso funciona se a proposta for **amanhã às sete**:\n\n**B** 不好意思，我今天去不了了。能改到明天晚上七点吗？  \n*Bù hǎoyìsi, wǒ jīntiān qù bù liǎo le. Néng gǎi dào míngtiān wǎnshang qī diǎn ma?*  \nDesculpa, hoje não vou conseguir ir. Podemos passar para amanhã às sete da noite?\n\n**A** 可以，明天晚上七点见！  \n*Kěyǐ, míngtiān wǎnshang qī diǎn jiàn!*  \nPode ser. Até amanhã às sete da noite!\n\n**今天** (*jīntiān*, hoje) está na parte que explica o imprevisto. **明天晚上七点** vem depois de **改到** (*gǎi dào*) e indica para quando você quer passar o encontro. **可以吗？** (*kěyǐ ma?*) também funciona para sugerir um horário quando o contexto já está claro. **能改到……吗？** deixa explícito que você quer mudar o combinado.\n\n**Sua vez.** A diz **今天晚上七点见？** (*Jīntiān wǎnshang qī diǎn jiàn?*). Se amanhã às sete também ficou ruim, mas às oito funciona, como você avisa que hoje não consegue ir e propõe amanhã às oito da noite?"
}
```

</details>

## continuidade-mandarim · turno 2 (follow-up)

- ✅ retoma a aula com uma pergunta no fim — be que **amanhã às oito** funciona. **A** 今天晚上七点见？ (*Jīntiān wǎnshang qī diǎn jiàn?*) Como você avisa que hoje não consegue ir e propõe amanhã às oito da noite?
- ✅ responde ao detalhe citado do fim da resposta anterior — 今天晚上七点见, jintian, wanshang
- ✅ o trecho citado chegou ao provedor (contexto do turno 2) — 5151 caracteres de contexto
- ✅ o briefing chegou ao provedor — pedido original no contexto

<details><summary>Saída</summary>

```json
{
  "eu": "Sobre o que você disse no final (\"Sua vez. A diz 今天晚上七点见？ (Jīntiān wǎnshang qī diǎn jiàn?).\"): e se meu amigo responder que sábado também não dá?",
  "contextoChars": 5151,
  "tutor": "Se você sugerir sábado à tarde e seu amigo disser **星期六下午也不行** (*Xīngqīliù xiàwǔ yě bù xíng* — Sábado à tarde também não dá), o **也** (*yě*, “também”) indica que mais uma opção caiu. Aí você pode perguntar quando funciona para ele.\n\n**Você** 那你什么时候有空？  \n*Nà nǐ shénme shíhou yǒu kòng?* — Então, quando você está livre?\n\n**Amigo** 星期天晚上七点可以吗？  \n*Xīngqītiān wǎnshang qī diǎn kěyǐ ma?* — Domingo às sete da noite pode ser?\n\n**Você** 可以，星期天晚上七点见！  \n*Kěyǐ, xīngqītiān wǎnshang qī diǎn jiàn!* — Pode ser. Até domingo às sete da noite!\n\nNesse exemplo, se domingo funcionar para você, repetir o dia e a hora deixa claro o que ficou combinado. Se você já tiver outro horário livre, também pode propor esse horário direto com **那……可以吗？** (*Nà … kěyǐ ma?* — Então, … pode ser?). Perguntar quando seu amigo está livre dá espaço para ele escolher. Propor um horário específico facilita uma resposta de sim ou não, mas pode exigir mais uma rodada se ele também estiver ocupado.\n\nVoltando à primeira proposta, seu amigo ainda está falando de **hoje às sete** e você já sabe que **amanhã às oito** funciona. **A** 今天晚上七点见？ (*Jīntiān wǎnshang qī diǎn jiàn?*) Como você avisa que hoje não consegue ir e propõe amanhã às oito da noite?"
}
```

</details>
