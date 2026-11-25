import { spawn } from 'child_process'
import fs from 'fs'
import { getSetting, recordAiUsage } from '../../database/queries'
import { buildPath } from '../../services/claude'
import type { ExecucaoIa, MotorExecutor } from './tipos'

/**
 * Codex CLI (`codex exec --json`, prompt via stdin). Eventos JSONL:
 *  item.completed {item: {type: 'agent_message', text}} → resposta;
 *  turn.completed {usage} → tokens; turn.failed / error → erro.
 * Sem sessão salva (`--ephemeral`) e fora de repositório quando preciso (`--skip-git-repo-check`).
 */
export const motorCodex: MotorExecutor = {
  id: 'codex',
  async executar(req: ExecucaoIa): Promise<string> {
    const bin = ((await getSetting('codex_command')) || 'codex').trim()
    const sandbox = req.ferramentas === 'agentic' ? 'workspace-write' : 'read-only'
    const cwd = req.cwd && fs.existsSync(req.cwd) ? req.cwd : undefined
    const args = [
      'exec',
      '--json',
      '--skip-git-repo-check',
      '--ephemeral',
      '-s',
      sandbox,
      ...(req.modelo ? ['-m', req.modelo] : []),
      ...(req.effort ? ['-c', `model_reasoning_effort="${req.effort.replace(/[^a-z]/gi, '')}"`] : []),
      ...(cwd ? ['-C', cwd] : []),
      '-'
    ]
    const entrada = req.sistema ? `${req.sistema}\n\n---\n\n${req.prompt}` : req.prompt
    const inicio = Date.now()

    return new Promise<string>((resolve, reject) => {
      const child = spawn(bin, args, { env: { ...process.env, PATH: buildPath(), RICKOS_CLAUDE_RUN: '1' }, stdio: ['pipe', 'pipe', 'pipe'], cwd })
      req.registerChild?.(() => {
        try {
          child.kill('SIGKILL')
        } catch {
          // já terminou
        }
      })
      let buf = ''
      let stderr = ''
      let ultima = ''
      let erro: string | null = null
      let terminou = false
      let textoTotal = ''
      const timeout = req.timeoutMs ?? 120_000
      const timer = timeout > 0 ? setTimeout(() => {
        if (terminou) return
        terminou = true
        child.kill('SIGKILL')
        reject(new Error(`Codex não respondeu em ${Math.round(timeout / 1000)} s.`))
      }, timeout) : null

      const linha = (l: string): void => {
        const t = l.trim()
        if (!t) return
        let ev: { type?: string; item?: { type?: string; text?: string }; usage?: Record<string, number>; error?: { message?: string }; message?: string }
        try {
          ev = JSON.parse(t)
        } catch {
          return
        }
        if (ev.type === 'item.completed' && ev.item?.type === 'agent_message' && ev.item.text) {
          ultima = ev.item.text
          req.onChunk?.((textoTotal ? '\n\n' : '') + ev.item.text)
          textoTotal += ev.item.text
        } else if (ev.type === 'turn.completed' && ev.usage && req.usage) {
          const u = ev.usage
          const cache = u.cached_input_tokens ?? 0
          recordAiUsage({
            source: req.usage.source,
            projectId: req.usage.projectId ?? null,
            model: req.modelo || 'codex',
            inputTokens: Math.max(0, (u.input_tokens ?? 0) - cache),
            outputTokens: (u.output_tokens ?? 0) + (u.reasoning_output_tokens ?? 0),
            cacheReadTokens: cache,
            cacheCreationTokens: u.cache_write_input_tokens ?? 0,
            costUsd: 0,
            durationMs: Date.now() - inicio,
            numTurns: 1,
            isError: false
          }).catch(() => undefined)
        } else if (ev.type === 'turn.failed' || ev.type === 'error') {
          erro = ev.error?.message || ev.message || 'Codex falhou.'
        }
      }

      child.stdout.on('data', (d: Buffer) => {
        buf += d.toString()
        const partes = buf.split('\n')
        buf = partes.pop() ?? ''
        partes.forEach(linha)
      })
      child.stderr.on('data', (d: Buffer) => {
        stderr += d.toString()
      })
      child.on('error', (e: NodeJS.ErrnoException) => {
        if (terminou) return
        terminou = true
        if (timer) clearTimeout(timer)
        reject(new Error(e.code === 'ENOENT' ? `Codex CLI não encontrado ("${bin}"). Instale ou ajuste em Configurações.` : e.message))
      })
      child.on('close', (code) => {
        if (terminou) return
        terminou = true
        if (timer) clearTimeout(timer)
        if (buf) linha(buf)
        if (erro) return reject(new Error(erro))
        if (code !== 0 && !ultima) return reject(new Error(stderr.trim().split('\n').slice(-3).join(' ') || `Codex saiu com código ${code}.`))
        resolve(ultima.trim())
      })
      child.stdin.end(entrada)
    })
  }
}
