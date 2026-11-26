import type { Database } from 'sql.js'
import { getDb, saveDb } from '../database/db'

/**
 * Acesso ao banco do módulo de Estudos. sql.js não aceita parâmetros em `db.exec`, então
 * tudo é prepare/step. Escritas agrupadas em `tx()` salvam o arquivo uma vez só no fim.
 */
export type P = string | number | null

export function all<T>(db: Database, sql: string, params: P[] = []): T[] {
  const st = db.prepare(sql)
  if (params.length) st.bind(params)
  const out: T[] = []
  while (st.step()) out.push(st.getAsObject() as T)
  st.free()
  return out
}

export function one<T>(db: Database, sql: string, params: P[] = []): T | null {
  return all<T>(db, sql, params)[0] ?? null
}

/** Executa e devolve o id inserido (quando é INSERT). */
export function exec(db: Database, sql: string, params: P[] = []): number {
  const st = db.prepare(sql)
  st.run(params)
  st.free()
  if (!/^\s*(INSERT|REPLACE)\b/i.test(sql)) return 0
  const r = db.prepare('SELECT last_insert_rowid() AS id')
  r.step()
  const id = Number(r.getAsObject().id)
  r.free()
  return id
}

let depth = 0

/**
 * Transação com um único save no fim. `fn` é SÍNCRONA de propósito: sem `await` no meio,
 * nenhuma outra requisição intercala comandos dentro da transação (sql.js é single-thread).
 */
export async function tx<T>(fn: (db: Database) => T): Promise<T> {
  const db = await getDb()
  if (depth > 0) return fn(db)
  depth++
  db.run('BEGIN')
  try {
    const r = fn(db)
    db.run('COMMIT')
    depth--
    saveDb()
    return r
  } catch (e) {
    try {
      db.run('ROLLBACK')
    } catch { /* já encerrada */ }
    depth--
    throw e
  }
}

export async function read<T>(fn: (db: Database) => T): Promise<T> {
  return fn(await getDb())
}

export const nowIso = (): string => new Date().toISOString()

export class StudyError extends Error {}
