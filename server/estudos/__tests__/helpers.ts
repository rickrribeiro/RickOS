import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/** Banco isolado: precisa rodar ANTES de importar qualquer módulo do servidor. */
export function isolateDb(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `rickos-${prefix}-`))
  process.env.RICKOS_DATA_DIR = dir
  return dir
}

/** Contador de chamadas ao provedor: instala um motor falso no gateway. */
export async function contarChamadas(responder: (prompt: string) => string = () => '{}'): Promise<{ total: () => number; prompts: string[]; reset: () => void }> {
  const { definirMotorDeTeste } = await import('../../ia/motores')
  const prompts: string[] = []
  definirMotorDeTeste((motor) => ({
    id: motor,
    async executar(req) {
      prompts.push(req.prompt)
      return responder(req.prompt)
    }
  }))
  return { total: () => prompts.length, prompts, reset: () => (prompts.length = 0) }
}

/** Limpa todas as tabelas de Estudos (entre testes). */
export async function resetStudies(): Promise<void> {
  const { getDb } = await import('../../database/db')
  const db = await getDb()
  for (const t of [
    'study_attempts',
    'study_questions',
    'study_checkpoints',
    'study_sources',
    'study_review_log',
    'study_card_states',
    'study_flashcards',
    'study_notes',
    'study_nodes',
    'study_quiz_attempts',
    'study_topics'
  ]) {
    try {
      db.run(`DELETE FROM ${t}`)
    } catch { /* tabela de etapa futura */ }
  }
  db.run("DELETE FROM settings WHERE key LIKE 'study_%'")
}
