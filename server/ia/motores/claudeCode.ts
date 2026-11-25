import { getSetting } from '../../database/queries'
import { runClaude } from '../../services/claude'
import type { ExecucaoIa, MotorExecutor } from './tipos'

/** Claude Code CLI (`claude -p`), via `runClaude`. */
export const motorClaudeCode: MotorExecutor = {
  id: 'claude-code',
  async executar(req: ExecucaoIa): Promise<string> {
    const command = req.claudeCommand?.trim() || (await getSetting('claude_command')) || 'claude'
    const ferramentas = req.ferramentas ?? 'padrao'
    const args = [
      ...(ferramentas === 'nenhuma' ? ['--tools', '', '--strict-mcp-config'] : []),
      ...(req.claudeArgs ?? []),
      ...(req.effort ? ['--effort', req.effort] : []),
      ...(req.sistema ? ['--append-system-prompt', req.sistema] : [])
    ]
    return runClaude(req.prompt, command, {
      model: req.modelo || undefined,
      extraArgs: args,
      cwd: req.cwd,
      timeoutMs: req.timeoutMs,
      agentic: ferramentas === 'agentic',
      permissionMode: req.permissionMode,
      // com onChunk, stream-json mostra texto ao vivo e ainda traz o uso de tokens no fim
      streamJson: ferramentas !== 'agentic' && !!req.onChunk,
      onChunk: req.onChunk,
      registerChild: req.registerChild,
      usage: req.usage
    })
  }
}
