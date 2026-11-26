/**
 * Casos de avaliação (entradas pequenas). Reutilizáveis: `npm run estudos:evals` roda com o Codex
 * real (gasta tokens); `server/estudos/__tests__/evals.test.ts` roda as mesmas rubricas sobre
 * fixtures (sem tokens).
 */
export const CASO_BACKEND = {
  id: 'masterclass-backend-unity',
  topico: { name: 'Backend multiplayer', goal: 'decidir a arquitetura do meu jogo Unity' },
  pedido: 'quero estudar backend multiplayer para decidir a arquitetura do meu jogo Unity',
  termos: ['unity', 'jogo', 'multiplayer', 'jogador', 'partida', 'arquitetura'],
  escala: { min: 5, max: 20 }
}

export const CASO_MANDARIM = {
  id: 'masterclass-remarcar-mandarim',
  topico: { name: 'Mandarim', goal: 'conseguir remarcar um encontro em mandarim', kind: 'language' as const, targetLanguage: 'zh' },
  pedido: 'quero conseguir remarcar um encontro em mandarim',
  termos: ['remarc', 'encontro', '见面', '改', '星期', '明天', 'sabado', 'amanha'],
  escala: { min: 2, max: 8 }
}

/** Nota com voz própria e uma imprecisão pontual: a revisão deve ser mínima. */
export const CASO_EDITORIAL = {
  id: 'editorial-tcp',
  nota: `# TCP na real

tcp = conexão confiável, tipo carta registrada.
handshake: SYN, SYN-ACK, ACK. aí tá conectado.
se perde pacote o tcp reenvia sozinho, por isso é mais lento q udp sempre.
pra jogo eu acho q udp ganha pq não espera retransmissão.`,
  maxItens: 3
}

/** Mapa onde falta "Dias da semana" sob "Situação comunicativa" (id 2). */
export const CASO_SUBTOPICO = {
  id: 'subtopico-mandarim',
  nos: [
    { id: 2, parentId: null, title: 'Situação comunicativa' },
    { id: 3, parentId: 2, title: 'Horas (几点)' },
    { id: 4, parentId: 2, title: 'Remarcar (改到…可以吗)' }
  ],
  nota: '改到星期六可以吗？ = pode ser no sábado?\n星期六 eu ainda confundo com 星期天.',
  esperado: { parentId: 2, termo: 'semana' }
}
