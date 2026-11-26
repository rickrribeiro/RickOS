# Avaliação dos prompts de Estudos (Codex real)

- Versão dos prompts: `estudos-pedagogia-2026-11-26.1`
- Data: 2026-11-26T11:13:52.007Z

| Caso | Operação | Modelo / effort | Latência | Tokens | Status | Rubricas |
|---|---|---|---|---|---|---|
| masterclass-backend-unity | masterclass | gpt-6.2-astra/high | 158.1 s | 21055 in / 4609 out | ok | 6/6 |
| masterclass-remarcar-mandarim | masterclass | gpt-6.2-astra/high | 81.0 s | 21057 in / 3067 out | ok | 6/6 |
| editorial-tcp | revisao | gpt-6.2-sol/low | 10.1 s | 20277 in / 255 out | ok | 3/3 |
| subtopico-mandarim | subtopicos | gpt-6.2-sol/low | 11.9 s | 20216 in / 308 out | ok | 3/3 |

## masterclass-backend-unity

- ✅ dependências coerentes (pré-requisito vem antes) — ok
- ✅ conteúdo específico do objetivo (≥ 60% dos módulos) — 7/8
- ✅ primeiro passo executável (curto e concreto) — Hoje, em dez minutos, desenhe três colunas em uma folha com os títulos ‘Ana’, ‘quem decide’ e ‘Beto’. Trace os dois pedi
- ✅ perguntas diagnósticas e critérios observáveis — ok
- ✅ entrega final ligada ao objetivo — Entregar um registro de decisão de arquitetura acompanhado de um diagrama da sessão e de um protótipo mínimo em Unity com dois clientes. O registro deve compara
- ✅ escala 5–20 módulos — 8

<details><summary>Saída</summary>

```json
{
  "perguntas": [
    "Que ações os jogadores fazem juntos, e o que acontece se uma delas chegar meio segundo depois?",
    "O que precisa continuar funcionando se quem criou a sessão sair ou se todos fecharem o jogo?"
  ],
  "suposicoes": [
    "Vou usar como caso de estudo uma partida curta em Unity, com poucos jogadores em tempo real. A interação de referência será disputar a coleta de um item. Gênero, escala e requisitos do seu jogo continuam em aberto.",
    "Se o jogo for por turnos ou assíncrono, a trilha dará mais peso a comandos, histórico de jogadas e retomada. Se exigir um mundo contínuo, dará mais peso à persistência e à recuperação. Os tempos indicados estimam o estudo e as atividades de cada módulo."
  ],
  "situacao": "Você precisa decidir onde a partida roda, quem tem a palavra final sobre cada ação e quais dados sobrevivem ao fim da sessão. A decisão ganha forma quando você consegue dizer o que os dois jogadores verão ao tentar pegar o mesmo item, inclusive se uma mensagem atrasar ou alguém sair.",
  "jaSei": "O contexto informa que a decisão é para um jogo Unity. Sua experiência com Unity, redes e operação de servidores ainda é desconhecida. O mapa está vazio e não há notas para usar como ponto de partida.",
  "fundamentos": [
    "Traduzir uma mecânica em regras de consistência, tempo de resposta e continuidade.",
    "Distinguir o caminho para encontrar e entrar em uma partida do caminho usado por uma ação durante a partida.",
    "Separar autoridade, hospedagem, transporte e armazenamento. Cada escolha responde a uma pergunta diferente.",
    "Relacionar atraso, perda, duplicação e reordenação de mensagens ao que cada jogador percebe.",
    "Comparar alternativas sob a mesma carga e usar medidas para sustentar ou rever a decisão."
  ],
  "demonstracaoFinal": "Entregar um registro de decisão de arquitetura acompanhado de um diagrama da sessão e de um protótipo mínimo em Unity com dois clientes. O registro deve comparar pelo menos duas arquiteturas plausíveis para uma mecânica real do jogo, explicar a escolha com medições e custos estimados e indicar qual resultado faria você mudar de ideia. O protótipo deve permitir que outra pessoa repita uma disputa pela mesma ação e uma falha de conexão.",
  "partes": [
    {
      "titulo": "1. Da mecânica ao caminho de uma jogada",
      "porque": "Uma única interação mostra quais tarefas o backend precisa assumir e quais escolhas ainda podem esperar.",
      "modulos": [
        {
          "titulo": "1. Seguir uma ação de uma tela à outra",
          "perguntaCentral": "Do convite à partida até a coleta confirmada nas duas telas, quem precisa falar com quem?",
          "conceitos": [
            "entrada na sessão",
            "conexão entre participantes",
            "intenção do jogador",
            "estado da partida",
            "confirmação visual"
          ],
          "relacoes": "Encontrar a sessão fornece um caminho para entrar. Depois da entrada, o pedido de coleta precisa chegar a quem decide o resultado, e esse resultado precisa voltar aos participantes. Esses caminhos podem passar por componentes diferentes.",
          "exemplo": "Ana convida Beto. Os dois veem uma chave no chão e apertam o botão de coleta. O convite já cumpriu sua função quando surge a pergunta sobre quem ficou com a chave.",
          "atividade": "Desenhe a entrada, a coleta e a saída em uma folha. Rotule cada seta com o que viaja por ela. Use uma caixa chamada ‘quem decide’ enquanto a hospedagem estiver em aberto.",
          "perguntaDiagnostica": "Se os dois já entraram na sala, que troca de mensagens ainda falta para ambos saberem com quem ficou a chave?",
          "criterioAvanco": "Seu desenho permite seguir a intenção de cada jogador até uma única decisão e localizar como as duas telas recebem o resultado.",
          "opcional": false,
          "minutos": 35,
          "prerequisitos": []
        },
        {
          "titulo": "2. Dar critérios de aceite à mecânica",
          "perguntaCentral": "O que pode aparecer com atraso, o que pode ser corrigido depois e qual erro invalida uma partida?",
          "conceitos": [
            "regra invariável",
            "resposta local",
            "confirmação da ação",
            "tolerância a atraso",
            "continuidade da sessão"
          ],
          "relacoes": "O tempo até o botão reagir e o tempo até a posse estar confirmada são medidas distintas. A regra de posse define o resultado aceitável mesmo quando as telas recebem a confirmação em instantes diferentes.",
          "exemplo": "A mão do personagem pode reagir imediatamente. A porta que consome a chave precisa consultar uma posse válida. Autorizar duas aberturas com uma única chave quebra a mecânica.",
          "atividade": "Escolha uma ação real do seu jogo. Escreva uma regra que sempre deve valer, duas medidas de tempo e o comportamento desejado quando o anfitrião sai. Registre os limites ainda desconhecidos como hipóteses para um teste de jogabilidade.",
          "perguntaDiagnostica": "Um jogador relata que a coleta ‘parece lenta’. Quais dois intervalos você mediria antes de trocar a arquitetura?",
          "criterioAvanco": "Você tem uma ficha com eventos de início e fim para cada medida, uma condição observável de erro e um requisito explícito para a saída do anfitrião.",
          "opcional": false,
          "minutos": 45,
          "prerequisitos": [
            "1. Seguir uma ação de uma tela à outra"
          ]
        }
      ]
    },
    {
      "titulo": "2. Autoridade e sincronização dentro da partida",
      "porque": "Antes de escolher onde rodar o jogo, você precisa saber qual trabalho será executado ali e como os clientes conviverão com o atraso.",
      "modulos": [
        {
          "titulo": "3. Resolver duas intenções incompatíveis",
          "perguntaCentral": "Como decidir a posse da chave se dois pedidos chegarem juntos ou se o vencedor repetir o pedido?",
          "conceitos": [
            "comando",
            "autoridade sobre o estado",
            "validação",
            "ordem de processamento",
            "identificador de operação",
            "idempotência"
          ],
          "relacoes": "O cliente envia uma intenção. A autoridade verifica o jogador e o estado atual, aplica uma regra de desempate e altera a posse uma vez. Reconhecer uma operação repetida permite responder novamente sem repetir seu efeito.",
          "exemplo": "Ana coleta a chave, mas perde a confirmação. Ao reenviar o pedido, ela precisa descobrir o resultado original, inclusive se Beto já tentou coletá-la nesse intervalo.",
          "atividade": "Escreva em pseudocódigo a transição de ‘disponível’ para ‘com um jogador’. Percorra em papel três sequências de pedidos, incluindo chegada em ordem inversa e reenvio após perda da resposta. Discuta quem sua regra de desempate favorece.",
          "perguntaDiagnostica": "Se o cliente puder declarar diretamente ‘a chave é minha’, qual regra da partida deixa de ter um responsável confiável?",
          "criterioAvanco": "Para cada sequência, você identifica o dono final, a resposta a cada cliente e o ponto exato que impede uma segunda concessão.",
          "opcional": false,
          "minutos": 60,
          "prerequisitos": [
            "2. Dar critérios de aceite à mecânica"
          ]
        },
        {
          "titulo": "4. Escolher o que transmitir e o que mostrar entre mensagens",
          "perguntaCentral": "Uma posição antiga e uma confirmação de posse atrasada merecem o mesmo tratamento?",
          "conceitos": [
            "tick de simulação",
            "frequência de envio",
            "snapshot ou retrato do estado",
            "entrega confiável e ordenada",
            "interpolação",
            "predição e reconciliação"
          ],
          "relacoes": "A simulação pode avançar várias vezes entre dois envios. Para movimento remoto, a interpolação suaviza a apresentação ao custo de exibir um instante anterior. Para a ação local, a predição antecipa um efeito e exige uma correção caso a autoridade decida de outro modo.",
          "exemplo": "Uma posição recente de Beto pode substituir uma posição perdida. Já a posse da chave precisa chegar a um estado confirmado, por resposta ao pedido ou por um retrato posterior que inclua o dono.",
          "atividade": "Desenhe uma linha do tempo com dois clientes e a autoridade. Atrase uma mensagem, descarte outra e entregue uma posição antiga por último. Marque o que cada tela mostra e como reconhece o estado mais recente. Para um jogo por turnos, faça o exercício com números de jogada.",
          "perguntaDiagnostica": "Se aumentar a frequência de envio, qual parcela da espera pode diminuir e qual parcela depende do trajeto de rede?",
          "criterioAvanco": "Você especifica conteúdo, frequência ou gatilho, tratamento de mensagens antigas e recuperação de perda para uma atualização frequente e uma ação discreta.",
          "opcional": false,
          "minutos": 75,
          "prerequisitos": [
            "3. Resolver duas intenções incompatíveis"
          ]
        }
      ]
    },
    {
      "titulo": "3. Hospedar a sessão e lidar com sua interrupção",
      "porque": "Com as regras da partida definidas, fica possível comparar quem pode executá-las e o que se perde quando esse participante desaparece.",
      "modulos": [
        {
          "titulo": "5. Comparar anfitrião, relay e servidor dedicado",
          "perguntaCentral": "Quem executaria a simulação em cada alternativa e por onde passariam os pedidos dos dois jogadores?",
          "conceitos": [
            "anfitrião jogador",
            "servidor dedicado",
            "conexão direta",
            "relay ou retransmissor",
            "alcance de rede",
            "confiança no anfitrião"
          ],
          "relacoes": "Hospedagem define onde a simulação roda. Um relay encaminha tráfego e pode viabilizar a comunicação quando a conexão direta é difícil. A autoridade sobre a chave continua no processo escolhido para executar a regra.",
          "exemplo": "Com Ana como anfitriã e um relay no caminho, Beto envia seu pedido por meio do relay para Ana. Com um dedicado autoritativo, os dois enviam pedidos ao processo do servidor. A saída de Ana tem consequências diferentes nos dois desenhos.",
          "atividade": "Desenhe duas alternativas viáveis para sua ficha de requisitos. Em cada uma, trace o pedido do anfitrião e o do convidado, indique quem pode alterar a posse e descreva o que acontece se esse processo parar. Para um jogo assíncrono, inclua uma alternativa que processe cada jogada a partir de estado persistido.",
          "perguntaDiagnostica": "Se adicionar um relay à partida hospedada por Ana, quem passa a poder confirmar a coleta depois que ela fecha o jogo?",
          "criterioAvanco": "Você consegue apontar, nos dois desenhos, o caminho dos dados, a autoridade, a dependência de disponibilidade e uma consequência para a experiência dos jogadores.",
          "opcional": false,
          "minutos": 60,
          "prerequisitos": [
            "3. Resolver duas intenções incompatíveis",
            "4. Escolher o que transmitir e o que mostrar entre mensagens"
          ]
        },
        {
          "titulo": "6. Entrar de novo e recuperar o estado correto",
          "perguntaCentral": "Que informação permite a Beto retomar a partida sem perder nem duplicar a chave?",
          "conceitos": [
            "identidade do jogador",
            "vínculo com a sessão",
            "reconexão",
            "estado em memória",
            "checkpoint",
            "persistência de progresso"
          ],
          "relacoes": "Uma conexão nova precisa ser associada ao participante correto. Se a autoridade sobreviveu, ela pode enviar o estado atual. Se também caiu, a retomada depende de uma cópia recuperável e de uma regra para o intervalo desde a última gravação.",
          "exemplo": "Beto cai depois de pegar a chave e antes de ver a confirmação. Recuperar sua mochila de uma gravação e o chão de outra pode fazer a chave reaparecer em dois lugares.",
          "atividade": "Monte uma tabela para queda de cliente, queda do anfitrião e encerramento normal. Para cada caso, registre o comportamento prometido, a fonte do estado e o que pode ser perdido. Se encerrar a partida for aceitável, descreva como o jogador descobre o destino do progresso.",
          "perguntaDiagnostica": "Qual dado ainda estaria disponível se você desligasse agora o processo que mantém a sessão?",
          "criterioAvanco": "Em cada falha, você consegue dizer de onde vem a posse válida da chave, como o jogador é identificado e em que condição a sessão termina ou continua.",
          "opcional": false,
          "minutos": 55,
          "prerequisitos": [
            "5. Comparar anfitrião, relay e servidor dedicado"
          ]
        }
      ]
    },
    {
      "titulo": "4. Medir as alternativas e tomar a decisão",
      "porque": "A mesma mecânica, a mesma carga e os mesmos critérios permitem investigar se uma diferença entre arquiteturas realmente importa para o jogo.",
      "modulos": [
        {
          "titulo": "7. Estimar capacidade e custo por sessão",
          "perguntaCentral": "Que recursos cada alternativa consome por hora de partida e o que muda com salas parcialmente ocupadas?",
          "conceitos": [
            "jogadores simultâneos",
            "ocupação por sala",
            "sessões por processo",
            "tráfego de saída",
            "capacidade ociosa",
            "unidade de cobrança"
          ],
          "relacoes": "Dividir jogadores simultâneos pela ocupação média estima as salas ativas. A capacidade medida por processo ajuda a estimar quantos processos serão necessários. Tráfego faturável depende dos bytes transmitidos, do número de destinatários e do trajeto cobrado.",
          "exemplo": "Como exercício hipotético, 40 jogadores em salas com média de quatro ocupantes pedem cerca de dez salas. Se a média cair para dois, serão cerca de vinte. O efeito no custo depende de quantas salas cabem em cada processo e de como o serviço cobra.",
          "atividade": "Monte cenários de baixa ocupação e de pico para as duas alternativas. Use variáveis para tarifas e capacidade desconhecidas. Inclua horas de processo, tráfego e tarefas operacionais como publicar uma versão e investigar uma sala travada.",
          "perguntaDiagnostica": "Duas opções anunciam o mesmo preço por GB. Que medidas ainda faltam para comparar o custo por hora de partida?",
          "criterioAvanco": "Sua planilha mantém unidades consistentes, distingue hipóteses de medições e identifica pelo menos uma variável capaz de inverter a comparação.",
          "opcional": false,
          "minutos": 60,
          "prerequisitos": [
            "5. Comparar anfitrião, relay e servidor dedicado",
            "6. Entrar de novo e recuperar o estado correto"
          ]
        },
        {
          "titulo": "8. Instrumentar um protótipo comparável em Unity",
          "perguntaCentral": "Como descobrir se a demora está antes da decisão, no processamento da ação ou na apresentação do resultado?",
          "conceitos": [
            "cena mínima",
            "dois clientes independentes",
            "correlação por ID de ação",
            "tempo de ida e volta",
            "atraso e perda controlados",
            "repetição de ensaios"
          ],
          "relacoes": "Um ID liga os registros de envio, decisão e apresentação. Intervalos medidos pelo mesmo relógio permitem calcular o tempo percebido pelo cliente e o tempo de processamento na autoridade. Comparar horários absolutos de máquinas diferentes exige considerar a sincronização dos relógios.",
          "exemplo": "Ao apertar o botão, o cliente registra o instante local e o ID. Ao exibir o dono confirmado, registra novamente. A autoridade registra o mesmo ID e o intervalo gasto para processá-lo. Isso permite investigar uma coleta lenta mesmo com relógios diferentes.",
          "atividade": "Crie uma cena com dois avatares, uma chave e um indicador de dono. Separe a regra de coleta da apresentação para exercitar a mesma regra nas duas configurações candidatas. Execute uma rodada de referência e rodadas com atraso, perda e desconexão. Guarde configuração, logs e instruções de repetição.",
          "perguntaDiagnostica": "Se tudo funcionar com dois clientes na mesma máquina, qual hipótese sobre a experiência de um convidado pela internet continua em aberto?",
          "criterioAvanco": "Outra pessoa consegue repetir o ensaio, identificar a mesma ação nos registros, verificar a posse final nos clientes e comparar a distribuição dos tempos de confirmação com os limites da ficha.",
          "opcional": false,
          "minutos": 150,
          "prerequisitos": [
            "4. Escolher o que transmitir e o que mostrar entre mensagens",
            "6. Entrar de novo e recuperar o estado correto",
            "7. Estimar capacidade e custo por sessão"
          ]
        }
      ]
    }
  ],
  "ordemJustificativa": "A mecânica define o que merece ser medido. A regra de autoridade estabelece qual processo precisa existir, e o estudo de sincronização revela o tráfego que ele gera. Só então faz sentido posicionar esse processo, planejar sua queda e estimar seu custo. O protótipo usa os critérios escritos antes da implementação para que a alternativa mais fácil de demonstrar não ganhe por conveniência.",
  "aprofundamentosOpcionais": [
    "Rollback e simulação determinística, se o jogo exigir precisão de poucos quadros em confrontos.",
    "Compensação de latência para acertos, se a validade de uma ação depender de onde outro jogador estava no instante percebido pelo atacante.",
    "Migração de anfitrião, se continuar a mesma partida após a saída dele for um requisito.",
    "Replicação por área de interesse e divisão do mundo, se o conjunto de entidades relevantes for muito diferente para cada jogador.",
    "Concorrência entre turnos e notificações, se a sessão precisar avançar com jogadores desconectados."
  ],
  "workshops": [
    {
      "titulo": "Disputar a chave e derrubar a sessão",
      "entrega": "Um pacote reproduzível com a cena Unity, duas configurações candidatas, registros das ações e uma tabela com dono final, tempo de confirmação e comportamento após a saída de um participante.",
      "experimento": "Faça os dois clientes disputarem a chave. Repita sob as mesmas condições em cada configuração, troque os papéis de anfitrião e convidado quando aplicável e interrompa a conexão depois da decisão, antes da confirmação. Compare o que cada tela mostra ao retornar com a regra escrita no módulo 2."
    },
    {
      "titulo": "Defender a arquitetura e tentar derrubar a escolha",
      "entrega": "Um registro de decisão com requisitos, diagrama, alternativas, medições, modelo de custo, limitações do ensaio e uma condição explícita de revisão.",
      "experimento": "Escolha a hipótese mais frágil da alternativa favorita. Por exemplo, se ela depende de salas cheias, reduza a ocupação e recalcule o custo. Se depende de o convidado tolerar atraso, repita a mecânica com atraso crescente e registre quando o critério de jogabilidade falha. Use o resultado para manter, restringir ou trocar a escolha."
    }
  ],
  "coberturaReversa": "Para defender a escolha, você precisa mostrar em que condição a segunda opção venceria. Isso exige um custo comparável e um ensaio repetível dos módulos 7 e 8. Para interpretar uma queda nesse ensaio, os módulos 5 e 6 localizam a autoridade e a fonte de recuperação. Para interpretar um atraso ou uma coleta duplicada, os módulos 3 e 4 especificam a transição válida e as mensagens. O módulo 2 fornece os limites de aceite, e o módulo 1 garante que o ensaio percorra uma ação inteira do jogo.",
  "aberturaPrimeiraAula": {
    "titulo": "Uma chave, dois jogadores, uma decisão",
    "situacao": "Ana e Beto veem a mesma chave no chão. Ana aperta primeiro na própria tela. O pedido de Beto chega primeiro a quem decide. Um instante depois, Beto perde a conexão.",
    "primeiroPasso": "Hoje, em dez minutos, desenhe três colunas em uma folha com os títulos ‘Ana’, ‘quem decide’ e ‘Beto’. Trace os dois pedidos de coleta, circule o instante em que a chave ganha um dono e desenhe as confirmações. Corte a seta de confirmação para Beto e anote o que cada participante sabe naquele momento. Se a mecânica central do seu jogo for outra, use-a no lugar da chave.",
    "pergunta": "Que informação Beto precisaria receber ao voltar para saber se pode usar a chave?"
  },
  "aConferir": [
    "Versão do Unity, plataformas-alvo e compatibilidade dos pacotes de rede candidatos com o modo de execução escolhido.",
    "Suporte efetivo a conexão direta, relay, servidor dedicado e simulação de condições de rede nas ferramentas que entrarem na comparação.",
    "Regiões disponíveis, limites de sessão, cotas, unidades de cobrança e tarifas vigentes de cada serviço considerado. Registrar fonte oficial e data antes de fechar a estimativa."
  ]
}
```

</details>

## masterclass-remarcar-mandarim

- ✅ dependências coerentes (pré-requisito vem antes) — ok
- ✅ conteúdo específico do objetivo (≥ 60% dos módulos) — 4/4
- ✅ primeiro passo executável (curto e concreto) — Hoje, leia a pergunta em voz alta. Localize 改到 e anote o dia, o período e a hora que vêm depois. Se precisar de apoio, 星
- ✅ perguntas diagnósticas e critérios observáveis — ok
- ✅ entrega final ligada ao objetivo — Em um diálogo oral sem roteiro, parta do encontro de sexta às 19h no café. Peça para mudar, faça uma proposta e responda a uma contraproposta que você só conhec
- ✅ escala 2–8 módulos — 4

<details><summary>Saída</summary>

```json
{
  "perguntas": [],
  "suposicoes": [
    "Vou partir de um encontro informal entre duas pessoas que já combinaram dia, hora e lugar.",
    "A prática principal será uma conversa oral. Os exemplos usam caracteres simplificados e pinyin com marcas de tom para apoiar a fala.",
    "Os tempos são estimativas e podem ser ajustados ao seu ritmo."
  ],
  "situacao": "Você marcou de encontrar alguém no café na sexta às sete da noite. Surgiu um imprevisto. Você precisa pedir a mudança, entender que horário funciona para a outra pessoa e sair da conversa com um novo combinado claro.",
  "jaSei": "O app informa seu objetivo e não traz notas sobre seu nível de mandarim. A primeira atividade permite descobrir se você já consegue distinguir o horário original da nova proposta.",
  "fundamentos": [
    "Reconhecer dia da semana, período do dia, hora e meia hora na fala.",
    "Usar 改到 (gǎi dào) para indicar para quando o encontro vai mudar.",
    "Suavizar o pedido com 不好意思 (bù hǎoyìsi) e dar espaço para a outra pessoa responder com 可以吗？(kěyǐ ma?).",
    "Reconhecer uma recusa, extrair uma contraproposta e pedir esclarecimento quando faltar um detalhe.",
    "Repetir dia, hora e lugar no encerramento para que as duas pessoas possam confirmar o mesmo combinado."
  ],
  "demonstracaoFinal": "Em um diálogo oral sem roteiro, parta do encontro de sexta às 19h no café. Peça para mudar, faça uma proposta e responda a uma contraproposta que você só conhecerá na hora. Esclareça um detalhe ambíguo e confirme dia, hora e lugar. Ao final, cada pessoa anota o combinado separadamente. As duas anotações devem coincidir.",
  "partes": [
    {
      "titulo": "Do horário antigo ao pedido de mudança",
      "porque": "Para fazer um pedido compreensível, você precisa saber qual horário está deixando para trás e qual está oferecendo.",
      "modulos": [
        {
          "titulo": "1. De sexta às sete para sábado às três",
          "perguntaCentral": "Ao ouvir dois horários na mesma fala, como descubro qual deles é a nova proposta?",
          "conceitos": [
            "星期五 e 星期六 (xīngqīwǔ e xīngqīliù) para sexta e sábado",
            "下午 e 晚上 (xiàwǔ e wǎnshang) para tarde e noite",
            "Ordem usual de uma indicação de horário: dia, período, hora",
            "改到 (gǎi dào) antes do novo horário"
          ],
          "relacoes": "Em 星期六下午三点 (xīngqīliù xiàwǔ sān diǎn), você ouve primeiro sábado, depois tarde e por fim três horas. Quando esse bloco vem depois de 改到, ele indica o destino da mudança. A pergunta ao final mostra que o novo horário ainda depende de aceitação.",
          "exemplo": "星期五晚上七点我来不了。改到星期六下午三点，可以吗？ (Xīngqīwǔ wǎnshang qī diǎn wǒ lái bù liǎo. Gǎi dào xīngqīliù xiàwǔ sān diǎn, kěyǐ ma?) — Sexta às sete da noite não consigo ir. Podemos mudar para sábado às três da tarde?",
          "atividade": "Leia a fala em voz alta e anote o horário original e o proposto. Depois inverta os dois blocos de tempo e diga a nova versão. Confira se agora é a sexta que aparece depois de 改到.",
          "perguntaDiagnostica": "Se você ouvir 改到星期六晚上七点，可以吗？, que horário colocaria na agenda como proposta?",
          "criterioAvanco": "Você identifica dia, período e hora nas duas versões e consegue inverter a direção da mudança sem trocar tarde por noite.",
          "opcional": false,
          "minutos": 15,
          "prerequisitos": []
        },
        {
          "titulo": "2. Pedir a mudança com naturalidade",
          "perguntaCentral": "Como aviso que não posso ir e proponho outro horário sem soar como se já estivesse decidido?",
          "conceitos": [
            "不好意思 (bù hǎoyìsi) para reconhecer o transtorno",
            "我临时有事 (wǒ línshí yǒu shì) para dizer que surgiu um imprevisto",
            "可以改到……吗？ (kěyǐ gǎi dào… ma?) para fazer uma proposta"
          ],
          "relacoes": "A abertura reconhece o efeito da mudança sobre a outra pessoa. O motivo pode caber em uma frase curta. A pergunta com 可以……吗 deixa o horário em aberto até a resposta.",
          "exemplo": "不好意思，我星期五晚上临时有事。可以改到星期六下午三点吗？ (Bù hǎoyìsi, wǒ xīngqīwǔ wǎnshang línshí yǒu shì. Kěyǐ gǎi dào xīngqīliù xiàwǔ sān diǎn ma?) — Desculpa, surgiu um imprevisto para sexta à noite. Podemos mudar para sábado às três da tarde?",
          "atividade": "Use somente as pistas “sexta à noite / imprevisto / sábado às 15h” para fazer o pedido em voz alta. Repita propondo sábado às 19h. Em cada tentativa, termine a pergunta e dê a vez à outra pessoa.",
          "perguntaDiagnostica": "Como você transformaria 改到星期六下午三点 em um pedido que a outra pessoa possa aceitar ou recusar?",
          "criterioAvanco": "Com apenas as pistas da agenda, você faz dois pedidos compreensíveis, indica o novo horário de cada um e solicita a concordância da outra pessoa.",
          "opcional": false,
          "minutos": 20,
          "prerequisitos": [
            "1. De sexta às sete para sábado às três"
          ]
        }
      ]
    },
    {
      "titulo": "Da contraproposta ao encontro confirmado",
      "porque": "O horário que funciona para você pode ser justamente o que a outra pessoa recusa. A segunda metade da conversa depende de entender a resposta e agir sobre ela.",
      "modulos": [
        {
          "titulo": "3. Ouvir a recusa e negociar outra opção",
          "perguntaCentral": "Se a pessoa disser que três horas é cedo demais, consigo perceber o horário que ela oferece e decidir se posso ir?",
          "conceitos": [
            "不太方便 (bú tài fāngbiàn) como recusa suave de um horário",
            "……怎么样？ (… zěnmeyàng?) para sugerir uma alternativa",
            "点半 (diǎn bàn) para a meia hora",
            "你什么时候方便？ (Nǐ shénme shíhou fāngbiàn?) para pedir uma opção"
          ],
          "relacoes": "Quando a resposta menciona dois horários, 不太方便 sinaliza qual deles não funciona. 怎么样 convida você a avaliar a alternativa. Se a pessoa apenas recusar, uma pergunta aberta ajuda a descobrir quando ela pode.",
          "exemplo": "A outra pessoa diz 三点不太方便，四点半怎么样？ (Sān diǎn bú tài fāngbiàn, sì diǎn bàn zěnmeyàng?) — Três não dá muito certo. Que tal quatro e meia? Se puder, responda 四点半可以。 (Sì diǎn bàn kěyǐ.) — Quatro e meia dá.",
          "atividade": "Faça duas rodadas com a proposta de sábado às 15h. Na primeira, responda à sugestão de 16h30 conforme sua agenda. Na segunda, a outra pessoa diz apenas 星期六不太方便。 (Xīngqīliù bú tài fāngbiàn.) — Sábado não dá muito certo. Continue a conversa até surgir outra opção.",
          "perguntaDiagnostica": "Ao ouvir 三点半不太方便，四点怎么样？, você responderia sobre 15h30 ou 16h? Que trecho orienta sua escolha?",
          "criterioAvanco": "Você responde ao horário oferecido, preserva a diferença entre hora cheia e meia hora e pede outra opção quando a recusa vem sozinha.",
          "opcional": false,
          "minutos": 20,
          "prerequisitos": [
            "2. Pedir a mudança com naturalidade"
          ]
        },
        {
          "titulo": "4. Esclarecer o que faltou e fechar o combinado",
          "perguntaCentral": "Quando a pessoa diz só “oito horas”, como descubro se é de manhã ou à noite e confirmo onde vamos nos encontrar?",
          "conceitos": [
            "早上 (zǎoshang) e 晚上 (wǎnshang) para distinguir manhã e noite",
            "还是 (háishi) entre duas opções em uma pergunta",
            "那就……见 (nà jiù… jiàn) para fechar o combinado",
            "在咖啡馆见 (zài kāfēiguǎn jiàn) para combinar de se ver no café"
          ],
          "relacoes": "Uma pergunta com 还是 recupera apenas o detalhe que faltou. Com a resposta, você recompõe o combinado inteiro e dá à outra pessoa a oportunidade de corrigir o que ouviu.",
          "exemplo": "Você ouve 星期六八点怎么样？ (Xīngqīliù bā diǎn zěnmeyàng?) — Que tal sábado às oito? Pergunte 早上八点还是晚上八点？ (Zǎoshang bā diǎn háishi wǎnshang bā diǎn?) — Oito da manhã ou da noite? Se a resposta for 晚上, feche com 好，那就星期六晚上八点在咖啡馆见。 (Hǎo, nà jiù xīngqīliù wǎnshang bā diǎn zài kāfēiguǎn jiàn.) — Combinado, então nos vemos sábado às oito da noite no café.",
          "atividade": "Ensaie duas vezes a partir de 星期六八点怎么样？ Em uma rodada a resposta será 早上, na outra, 晚上. Em cada rodada, esclareça o período, diga o combinado completo e espere a confirmação ou correção.",
          "perguntaDiagnostica": "Você anotou sábado às 20h, mas a pessoa só disse 星期六八点. Qual pergunta curta resolve a dúvida antes de fechar?",
          "criterioAvanco": "Você pede o detalhe ausente e incorpora a resposta na confirmação oral com dia, período, hora e lugar corretos nas duas rodadas.",
          "opcional": false,
          "minutos": 15,
          "prerequisitos": [
            "3. Ouvir a recusa e negociar outra opção"
          ]
        }
      ]
    }
  ],
  "ordemJustificativa": "Primeiro você aprende a ouvir para quando o encontro está sendo movido. Depois usa essa mesma estrutura para fazer seu pedido. A recusa entra quando você já tem uma proposta à qual o interlocutor pode reagir. O encerramento vem por último porque precisa refletir o que os dois acabaram de negociar.",
  "aprofundamentosOpcionais": [
    "Repetir a situação com alguém que você conhece pouco e praticar uma abertura mais cuidadosa, como 不好意思，请问可以改个时间吗？ (Bù hǎoyìsi, qǐngwèn kěyǐ gǎi ge shíjiān ma?) — Desculpe, podemos mudar o horário?",
    "Retomar o combinado no dia seguinte por mensagem, escrevendo uma confirmação curta em mandarim sem consultar o diálogo."
  ],
  "workshops": [
    {
      "titulo": "Duas agendas e uma mudança de última hora",
      "entrega": "Uma conversa oral completa e duas anotações independentes do dia, horário e lugar combinados.",
      "experimento": "Comecem com sexta às 19h no café. Você pede para mudar para sábado às 15h. A outra pessoa escolhe em segredo outro dia ou horário que funcione para ela, recusa sua proposta e oferece a alternativa omitindo um detalhe, como o período do dia. Negociem até ambos poderem ir. Comparem as anotações e, se houver divergência, retomem em mandarim o turno em que ela surgiu."
    }
  ],
  "coberturaReversa": "Para que as anotações coincidam, os dois precisam ouvir e confirmar o mesmo dia, hora e lugar, inclusive o detalhe que faltava (módulo 4). Esse combinado depende de reconhecer a recusa e responder à contraproposta (3). Para haver algo a negociar, você precisa formular um pedido que convide a uma resposta (2) e distinguir o horário original daquele que está propondo (1).",
  "aberturaPrimeiraAula": {
    "titulo": "Qual horário vai para a agenda?",
    "situacao": "Na sua agenda está escrito “sexta, 19h, café”. Chega a pergunta 改到星期六下午三点，可以吗？ (Gǎi dào xīngqīliù xiàwǔ sān diǎn, kěyǐ ma?).",
    "primeiroPasso": "Hoje, leia a pergunta em voz alta. Localize 改到 e anote o dia, o período e a hora que vêm depois. Se precisar de apoio, 星期六 é sábado, 下午 é à tarde e 三点 é três horas.",
    "pergunta": "Que horário a pessoa está propondo, e qual trecho mostra que ela ainda espera sua resposta?"
  },
  "aConferir": []
}
```

</details>

## editorial-tcp

- ✅ trechos citados existem exatamente na nota — ok
- ✅ mudanças mínimas (sem reescrever) — ok
- ✅ no máximo 3 propostas — 2

<details><summary>Saída</summary>

```json
{
  "itens": [
    {
      "trecho": "por isso é mais lento q udp sempre",
      "motivo": "A espera pela retransmissão pode atrasar a entrega dos dados seguintes no TCP, e o impacto depende de haver perda.",
      "tipo": "erro-factual",
      "sugestao": "se perde, os dados seguintes podem ficar esperando tb, pq o tcp entrega em ordem",
      "substituicao": "se perde, os dados seguintes podem ficar esperando tb, pq o tcp entrega em ordem"
    },
    {
      "trecho": "udp ganha pq não espera retransmissão",
      "motivo": "O exemplo de posição mostra quando descartar uma atualização perdida faz sentido pro jogo.",
      "tipo": "ajuste",
      "sugestao": "udp ganha pra posição, por ex.: se perde uma atualização, dá pra usar a próxima q chegar",
      "substituicao": "udp ganha pra posição, por ex.: se perde uma atualização, dá pra usar a próxima q chegar"
    }
  ],
  "vazio": null
}
```

</details>

## subtopico-mandarim

- ✅ pai certo em todos os itens — ok (1 item/itens)
- ✅ não repete item existente — ok
- ✅ (informativo) citou "semana" — não — sugeriu: Responder à proposta e confirmar o novo horário

<details><summary>Saída</summary>

```json
{
  "itens": [
    {
      "parentId": 1,
      "posicao": 3,
      "titulo": "Responder à proposta e confirmar o novo horário",
      "motivo": "Sem praticar a resposta, fica faltando como fechar a remarcação quando a outra pessoa aceita ou diz que o horário não funciona. Vale um nó próprio porque essa etapa exige praticar os dois caminhos da conversa.",
      "conexaoObjetivo": "Depois de propor a mudança, pratique confirmar o combinado com 好，那就星期六下午三点见。 (Certo, então nos vemos sábado às três da tarde.) ou fazer uma contraproposta com 星期六不行，星期天下午三点可以吗？ (Sábado não dá. Domingo às três da tarde pode ser?).",
      "tipo": "pre-requisito",
      "prerequisito": "Horas (几点) e Remarcar (改到…可以吗)"
    }
  ],
  "vazio": null
}
```

</details>
