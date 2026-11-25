import os from 'os'
import type { AiSuggestion, AiSuggestRequest, AiSuggestResult, AiSummary, ChatMessage, ChatPriority } from '../../shared/chats'
import { networkInfo } from '../../shared/chats'
import { getSetting } from '../database/queries'
import { runClaude } from '../services/claude'
import { loadConfig } from './config'
import * as repo from './repo'
import { cachedMessages, getMessages } from './service'
import type { RemoteMessage } from './providers/types'
import { tt } from '../i18n'
import { ESTILOS_RESPOSTA, SISTEMA_MENSAGENS } from '../../shared/prompts/mensagens/sistema'
import { promptSugerirRespostas } from '../../shared/prompts/mensagens/sugerirRespostas'
import { promptResumoConversa } from '../../shared/prompts/mensagens/resumo'

/**
 * IA da Central de Mensagens.
 *
 * Regras de privacidade (requisito do usuário):
 *  • vai para a IA SOMENTE o texto das mensagens que o usuário selecionou — nada de
 *    histórico extra, nem de outras conversas;
 *  • notas/contexto da pessoa só com opt-in explícito por pedido;
 *  • o conteúdo das mensagens é DADO, nunca instrução (delimitado e avisado no prompt);
 *  • o Claude roda sem ferramentas (`--tools ""`), sem MCP e fora do repositório;
 *  • a IA só sugere: enviar é sempre uma ação explícita do usuário.
 *
 * `AiEngine` desacopla o mecanismo (Claude Code CLI hoje; Claude API/Ollama depois).
 */
export interface AiEngine {
  readonly id: string
  complete(system: string, prompt: string, opts: { model?: string }): Promise<string>
}

export const claudeCliEngine: AiEngine = {
  id: 'claude-cli',
  async complete(system, prompt, opts) {
    const command = (await getSetting('claude_command')) || 'claude'
    return runClaude(prompt, command, {
      model: opts.model || undefined,
      timeoutMs: 120_000,
      cwd: os.tmpdir(),
      usage: { source: 'mensagens' },
      extraArgs: ['--tools', '', '--strict-mcp-config', '--append-system-prompt', system]
    })
  }
}

let engine: AiEngine = claudeCliEngine
/** Testes / outros mecanismos. */
export function setAiEngine(e: AiEngine | null): void {
  engine = e ?? claudeCliEngine
}

interface Prepared {
  chatTitle: string
  network: string
  type: 'single' | 'group'
  contactName: string | null
  contactNotes: string | null
  messages: { alias: string; id: string; from: string; mine: boolean; at: string; text: string }[]
}

async function loadSelected(chatId: number, ids: string[]): Promise<RemoteMessage[]> {
  let msgs = cachedMessages(chatId, ids)
  if (msgs.length < ids.length) {
    await getMessages(chatId) // repõe o cache da página recente
    msgs = cachedMessages(chatId, ids)
  }
  return msgs
}

async function prepare(chatId: number, ids: string[], includeNotes: boolean): Promise<Prepared> {
  if (!ids.length) throw new Error(tt('chats.selecioneAoMenosUmaMensagem'))
  if (ids.length > 40) throw new Error(tt('chats.selecioneNoMaximo40Mensagens'))
  const chat = await repo.fullRow(chatId)
  if (!chat) throw new Error(tt('chats.conversaNaoEncontrada'))
  const msgs = await loadSelected(chatId, ids)
  if (!msgs.length) throw new Error(tt('chats.asMensagensSelecionadasNaoEstao'))
  let contactNotes: string | null = null
  if (includeNotes && chat.contactId) {
    const c = await repo.contactLite(chat.contactId)
    contactNotes = [c?.context, c?.interests ? `Interesses: ${c.interests}` : null, chat.notes ? `Notas da conversa: ${chat.notes}` : null].filter(Boolean).join('\n').slice(0, 1500) || null
  }
  return {
    chatTitle: chat.title,
    network: networkInfo(chat.network).label,
    type: chat.type,
    contactName: chat.contactName,
    contactNotes,
    messages: msgs.map((m, i) => ({
      alias: `m${i + 1}`,
      id: m.id,
      from: m.isMine ? 'EU' : m.senderName || 'outra pessoa',
      mine: m.isMine,
      at: m.timestamp,
      text: (m.text || (m.attachments.length ? `[${m.attachments.map((a) => a.type).join(', ')}]` : '')).slice(0, 2000)
    }))
  }
}

function messagesBlock(p: Prepared): string {
  // JSON escapa aspas/quebras: o texto de terceiros não "fecha" o bloco nem vira instrução.
  const data = p.messages.map((m) => ({ id: m.alias, de: m.from, quando: m.at, texto: m.text }))
  return `<mensagens>\n${JSON.stringify(data, null, 1)}\n</mensagens>`
}

function firstJson(text: string): unknown {
  const start = text.search(/[[{]/)
  if (start < 0) throw new Error('A IA não devolveu JSON.')
  const close = text[start] === '{' ? '}' : ']'
  const end = text.lastIndexOf(close)
  if (end <= start) throw new Error('Resposta incompleta da IA.')
  return JSON.parse(text.slice(start, end + 1))
}

const PRIORITIES: ChatPriority[] = ['alta', 'normal', 'baixa']

export async function suggestReplies(req: AiSuggestRequest): Promise<AiSuggestResult> {
  try {
    const cfg = await loadConfig()
    const p = await prepare(req.chatId, req.messageIds, !!req.includePersonNotes)
    const inbound = p.messages.filter((m) => !m.mine)
    const perMessage = req.mode === 'per_message' && inbound.length > 0
    const targets = perMessage ? inbound : []
    const template = req.templateId ? await repo.getTemplate(req.templateId) : null
    const prompt = promptSugerirRespostas({
      conversa: p.type === 'group' ? `grupo "${p.chatTitle}"` : `com ${p.contactName || p.chatTitle}`,
      rede: p.network,
      contextoPessoa: p.contactNotes,
      estilo: ESTILOS_RESPOSTA[req.style] ?? ESTILOS_RESPOSTA.natural,
      idioma: req.language || null,
      preferenciasEscrita: cfg.aiStyleInstructions || null,
      pedidoExtra: req.extraInstruction ? req.extraInstruction.slice(0, 900) : null,
      modelo: template ? template.body.slice(0, 1500) : null,
      mensagens: messagesBlock(p),
      alvosPorMensagem: perMessage ? targets.map((t) => t.alias) : null
    })
    const out = await engine.complete(SISTEMA_MENSAGENS, prompt, { model: cfg.aiModel })
    const parsed = firstJson(out) as { suggestions?: { id?: string; reply?: string; needsReply?: boolean; priority?: string; reason?: string }[] }
    const aliasToId = new Map(p.messages.map((m) => [m.alias, m.id]))
    const suggestions: AiSuggestion[] = (parsed.suggestions ?? []).slice(0, 40).map((s) => ({
      messageId: perMessage ? aliasToId.get(String(s.id)) ?? null : null,
      reply: String(s.reply ?? '').trim().slice(0, 4000),
      needsReply: typeof s.needsReply === 'boolean' ? s.needsReply : null,
      priority: PRIORITIES.includes(s.priority as ChatPriority) ? (s.priority as ChatPriority) : null,
      reason: s.reason ? String(s.reason).slice(0, 300) : null
    }))
    if (!suggestions.length) throw new Error(tt('chats.aIaNaoGerouSugestoes'))
    return { chatId: req.chatId, suggestions, error: null }
  } catch (e) {
    return { chatId: req.chatId, suggestions: [], error: e instanceof Error ? e.message : String(e) }
  }
}

/** Várias conversas: concorrência limitada; falha de uma não derruba as outras. */
export async function suggestBatch(reqs: AiSuggestRequest[], onResult?: (r: AiSuggestResult) => void): Promise<AiSuggestResult[]> {
  const list = reqs.slice(0, 30)
  const results: AiSuggestResult[] = new Array(list.length)
  let i = 0
  const worker = async (): Promise<void> => {
    while (i < list.length) {
      const idx = i++
      results[idx] = await suggestReplies(list[idx])
      onResult?.(results[idx])
    }
  }
  await Promise.all(Array.from({ length: Math.min(2, list.length) }, worker))
  return results
}

export async function summarize(chatId: number, messageIds: string[], includeNotes: boolean): Promise<AiSummary> {
  const cfg = await loadConfig()
  const p = await prepare(chatId, messageIds, includeNotes)
  const prompt = promptResumoConversa({
    conversa: p.type === 'group' ? `no grupo "${p.chatTitle}"` : `com ${p.contactName || p.chatTitle}`,
    rede: p.network,
    contextoPessoa: p.contactNotes,
    mensagens: messagesBlock(p)
  })
  const out = await engine.complete(SISTEMA_MENSAGENS, prompt, { model: cfg.aiModel })
  const parsed = firstJson(out) as { summary?: string }
  return { chatId, text: String(parsed.summary ?? '').slice(0, 8000), partial: true, messageCount: p.messages.length }
}

/** Para a triagem: mensagens recebidas depois da minha última resposta (para o usuário confirmar o envio à IA). */
export async function pendingMessages(chatId: number, max = 8): Promise<ChatMessage[]> {
  const page = await getMessages(chatId)
  const items = page.items
  let lastMine = -1
  items.forEach((m, i) => {
    if (m.isMine) lastMine = i
  })
  return items.slice(lastMine + 1).filter((m) => !m.isMine && !m.deleted).slice(-max)
}
