/**
 * Fixtures do tutor (sem gastar tokens): respostas no formato dos schemas para os cenários do
 * roteiro de aceite. Usadas pelos testes de contrato e pelos evals (server/estudos/evals).
 */
export const MASTERCLASS_BACKEND = {
  perguntas: [],
  suposicoes: ['Jogo Unity multiplayer com até 8 jogadores por partida; você conhece Unity e HTTP, não netcode.'],
  situacao: 'Decidir a arquitetura de backend do seu jogo Unity multiplayer antes de escrever o netcode.',
  jaSei: 'Unity, C#, APIs HTTP.',
  fundamentos: ['modelo de autoridade', 'tick rate e latência', 'replicação de estado'],
  demonstracaoFinal: 'Uma decisão de arquitetura documentada (ADR) e um experimento de latência que pode contrariá-la.',
  partes: [
    {
      titulo: 'Panorama ponta a ponta',
      porque: 'Antes dos mecanismos, ver o caminho de um input do jogador até o estado de todos.',
      modulos: [
        {
          titulo: 'Do input ao estado compartilhado',
          perguntaCentral: 'O que acontece entre apertar um botão no cliente e os outros 7 jogadores verem o efeito?',
          conceitos: ['cliente', 'servidor autoritativo', 'snapshot', 'RTT'],
          relacoes: 'O RTT limita o quão rápido a autoridade confirma o input; snapshots carregam o estado confirmado.',
          exemplo: 'Um tiro no seu jogo: input local, validação no servidor, snapshot para os outros.',
          atividade: 'Desenhe a sequência de mensagens de um tiro com 80 ms de RTT.',
          perguntaDiagnostica: 'Onde o tiro "acontece de verdade"?',
          criterioAvanco: 'Explicar o caminho sem consultar a nota.',
          opcional: false,
          minutos: 25,
          prerequisitos: []
        },
        {
          titulo: 'Autoridade: servidor, host ou relay',
          perguntaCentral: 'Quem decide o estado e o que isso custa em trapaça e infraestrutura?',
          conceitos: ['servidor dedicado', 'host-cliente', 'relay'],
          relacoes: 'Mais autoridade no servidor reduz trapaça e aumenta custo.',
          exemplo: 'Partida de 8 jogadores com host saindo no meio.',
          atividade: 'Liste o que quebra quando o host cai.',
          perguntaDiagnostica: 'Qual modelo tolera a saída do host?',
          criterioAvanco: 'Escolher um modelo com um critério explícito.',
          opcional: false,
          minutos: 30,
          prerequisitos: ['Do input ao estado compartilhado']
        }
      ]
    },
    {
      titulo: 'Mecanismos e falhas',
      porque: 'Predição e reconciliação decidem se o jogo parece responsivo.',
      modulos: [
        {
          titulo: 'Predição do cliente e reconciliação',
          perguntaCentral: 'Como o cliente se move sem esperar o servidor e corrige quando errou?',
          conceitos: ['predição', 'reconciliação', 'rollback'],
          relacoes: 'A predição esconde o RTT; a reconciliação paga o erro.',
          exemplo: 'Personagem correndo com 120 ms de RTT.',
          atividade: 'Simule um desvio e a correção.',
          perguntaDiagnostica: 'O que o jogador vê quando a predição erra?',
          criterioAvanco: 'Prever o efeito de dobrar o RTT.',
          opcional: true,
          minutos: 40,
          prerequisitos: ['Autoridade: servidor, host ou relay']
        }
      ]
    }
  ],
  ordemJustificativa: 'Do caminho completo para a decisão de autoridade, depois os mecanismos que ela exige.',
  aprofundamentosOpcionais: ['Lag compensation para hitscan'],
  workshops: [{ titulo: 'ADR da arquitetura', entrega: 'Decisão documentada com critérios', experimento: 'Medir RTT real entre 2 regiões e rever a decisão' }],
  coberturaReversa: 'ADR ← modelo de autoridade ← custos ← caminho do input.',
  aberturaPrimeiraAula: {
    titulo: 'Do input ao estado compartilhado',
    situacao: 'Você aperta "atirar" no seu jogo Unity. Outros 7 jogadores precisam ver o mesmo resultado.',
    primeiroPasso: 'Hoje: escreva em 5 linhas o caminho que você imagina para esse tiro.',
    pergunta: 'Em qual máquina o tiro "acontece de verdade"?'
  },
  aConferir: ['Preço atual do Unity Relay (depende de plano)']
}

export const MASTERCLASS_MANDARIM = {
  perguntas: [],
  suposicoes: ['Nível iniciante; quer conseguir remarcar por mensagem e por voz.'],
  situacao: 'Remarcar um encontro com um amigo que fala mandarim, por mensagem ou ligação curta.',
  jaSei: '明天几点见面？',
  fundamentos: ['dias e horas', 'propor alternativa', 'confirmar'],
  demonstracaoFinal: 'Uma troca de 6 turnos remarcando de amanhã para sábado, com um imprevisto.',
  partes: [
    {
      titulo: 'Situação comunicativa',
      porque: 'Trilha curta: um objetivo delimitado.',
      modulos: [
        {
          titulo: 'Dias e horas',
          perguntaCentral: 'Como dizer quando, de forma que o outro entenda sem ambiguidade?',
          conceitos: ['明天', '星期六', '几点', '点/半'],
          relacoes: 'Tempo vem antes do verbo.',
          exemplo: '星期六下午三点见面，可以吗？',
          atividade: 'Produza 3 horários diferentes.',
          perguntaDiagnostica: 'Onde fica o tempo na frase?',
          criterioAvanco: 'Dizer 3 horários sem consultar.',
          opcional: false,
          minutos: 10,
          prerequisitos: []
        },
        {
          titulo: 'Remarcar e reagir ao imprevisto',
          perguntaCentral: 'Como propor outra data e responder a um "não posso"?',
          conceitos: ['改到', '可以吗', '不好意思'],
          relacoes: 'Desculpa + proposta + confirmação.',
          exemplo: '不好意思，明天不行，改到星期六可以吗？',
          atividade: 'Diálogo de 6 turnos com um imprevisto.',
          perguntaDiagnostica: 'Como reagir se o outro também não pode sábado?',
          criterioAvanco: 'Conduzir o diálogo com um imprevisto.',
          opcional: false,
          minutos: 15,
          prerequisitos: ['Dias e horas']
        }
      ]
    }
  ],
  ordemJustificativa: 'Primeiro o "quando", depois a troca.',
  aprofundamentosOpcionais: [],
  workshops: [{ titulo: 'Diálogo com imprevisto', entrega: 'Gravação de 6 turnos', experimento: 'Trocar sábado por domingo de surpresa' }],
  coberturaReversa: 'diálogo ← remarcar ← horários.',
  aberturaPrimeiraAula: { titulo: 'Dias e horas', situacao: 'Seu amigo pergunta 明天几点见面？', primeiroPasso: 'Diga em voz alta: 星期六下午三点。', pergunta: 'Como você responderia propondo sábado?' },
  aConferir: []
}

export const AULA_TURNO = {
  resposta: 'Você disse que o tiro acontece no cliente. **Entendi:** você vê o efeito local primeiro. **Corrigir:** num servidor autoritativo, o tiro só vale quando o servidor confirma. Tente de novo: o que o servidor precisa receber para validar?',
  tipo: 'feedback',
  minhaResposta: { entendi: 'o efeito aparece primeiro no cliente', corrigir: 'quem confirma é o servidor', proximaTentativa: 'diga o que o servidor recebe' },
  hipoteses: ['assumi servidor dedicado'],
  perguntaAberta: 'O que o servidor precisa receber para validar o tiro?',
  pontoDeRetorno: null,
  fraseDeRetomada: 'Paramos na validação do tiro pelo servidor.'
}

/** Pacote C completo sobre a nota de mandarim (trecho exato: "明天 = amanhã"). */
export function pacoteMandarim(parentId: number | null): Record<string, unknown> {
  return {
    explicacao: { conteudo: 'Em mandarim, o **tempo vem antes do verbo**: 明天(amanhã) + 见面(encontrar-se).', vazio: null },
    resumo: { conteudo: 'Tempo → (sujeito) → verbo. 明天几点见面？ pergunta o horário de amanhã.', vazio: null },
    exercicios: { itens: [{ enunciado: 'Diga "sábado às 3 da tarde".', pista: '星期六 + 下午', solucao: '星期六下午三点', criterios: 'tempo antes do verbo' }], vazio: null },
    socraticas: { itens: [{ pergunta: 'Onde fica 明天 na frase?', referencia: 'antes do verbo' }, { pergunta: 'E se for sábado?', referencia: '星期六' }], vazio: null },
    revisaoAtiva: { itens: [{ pedido: 'Sem olhar: como se pergunta "a que horas nos vemos amanhã?"', referencia: '明天几点见面？' }], vazio: null },
    revisaoEditorial: {
      itens: [
        { trecho: '明天 = amanhã', motivo: 'Falta a leitura, que você usa para pronunciar.', tipo: 'acrescimo', sugestao: '(míngtiān)', substituicao: null },
        { trecho: '几点 = que horas', motivo: 'Dúvida de intenção: quer anotar 点 sozinho?', tipo: 'pergunta', sugestao: 'Quer anotar 点 (hora) separado?', substituicao: null }
      ],
      vazio: null
    },
    subtopicos: {
      itens: [{ parentId, posicao: 0, titulo: 'Dias da semana (星期)', motivo: 'Sem eles não dá para propor sábado.', conexaoObjetivo: 'remarcar para outro dia', tipo: 'pre-requisito', prerequisito: null }],
      vazio: null
    },
    cartoes: { itens: [{ front: '星期六', back: 'sábado', exemplo: '星期六见！', leitura: 'xīngqīliù' }, { front: '你好', back: 'olá', exemplo: null, leitura: null }], vazio: null }
  }
}
