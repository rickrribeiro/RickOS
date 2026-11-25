/**
 * Inbox → "Capturar de imagem": o Claude abre a imagem (ferramenta Read) e devolve um JSON
 * com título/valor/data/link/nota para virar item do Inbox.
 * Usado em: server/rpc.ts (`inbox:ocr`). Modelo: `claude_model`.
 */
export function promptOcrImagem(p: { arquivo: string }): string {
  return `Você recebeu o caminho de uma imagem: ${p.arquivo}
Use a ferramenta Read para abrir a imagem e extraia as informações em JSON.
Responda APENAS com JSON válido (sem markdown, sem texto fora do JSON), no formato:
{ "title": string, "amount": number|null, "currency": string|null, "date": "YYYY-MM-DD"|null, "link": string|null, "note": string|null }
Regras:
- "title": tarefa/assunto curto e acionável que resume a imagem (comece com um verbo quando fizer sentido).
- "amount"/"currency": se houver valor monetário (boleto, comprovante, recibo).
- "date": se houver uma data relevante (vencimento, evento) — formato YYYY-MM-DD.
- "link": URL visível na imagem.
- "note": detalhes úteis (ex.: itens de um quadro branco, linha digitável do boleto).
- Campos ausentes = null.`
}
