/**
 * Prompt Runner → "Sugerir mensagem de commit" para as mudanças da conversa.
 * Usado em: server/aiconv/rpc.ts (`conv:suggestCommit`). Modelo: haiku.
 * `contexto`: diff/stat + commits recentes (`commitContext`).
 */
export function promptMensagemCommit(p: { contexto: string }): string {
  return `Escreva UMA mensagem de commit para as mudanças abaixo, no mesmo estilo e idioma dos commits recentes (ex.: convencional "tipo(escopo): resumo"). Responda só com a mensagem, sem aspas nem explicação; corpo opcional depois de uma linha em branco.\n\n${p.contexto}`
}
