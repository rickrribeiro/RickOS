import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/** Banco isolado: precisa rodar ANTES de importar qualquer módulo do servidor. */
export function isolateDb(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `rickos-${prefix}-`))
  process.env.RICKOS_DATA_DIR = dir
  return dir
}

const MEMORY_TABLES = [
  'memory_usage',
  'memory_feedback',
  'memory_evidence',
  'memory_relations',
  'memory_revisions',
  'memory_suggestions',
  'memory_events',
  'memory_jobs',
  'memory_gaps',
  'memory_interviews',
  'memory_imports',
  'memory_tombstones',
  'memories',
  'memory_categories'
]

/** Limpa todas as tabelas da Memória Pessoal e as configurações `memory_*`. */
export async function resetMemory(): Promise<void> {
  const { getDb } = await import('../../database/db')
  const repo = await import('../repo')
  const db = await getDb()
  for (const t of MEMORY_TABLES) db.run(`DELETE FROM ${t}`)
  db.run("DELETE FROM settings WHERE key LIKE 'memory_%'")
  db.run("DELETE FROM ai_usage WHERE source LIKE 'memoria%'")
  repo.resetSeedCache()
}
