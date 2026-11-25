import initSqlJs, { Database } from 'sql.js'
import { dataDir } from '../config'
import path from 'path'
import fs from 'fs'
import { SCHEMA } from './schema'
import { seedAiLibrary } from './aiSeeds'
import { detectPaymentMethod, INVESTMENT_GROUPS } from '../../shared/finance'

let db: Database | null = null
let dbPath: string

/**
 * Lightweight migration runner keyed on `PRAGMA user_version`.
 * `SCHEMA` (CREATE TABLE IF NOT EXISTS) handles fresh databases; migrations
 * below carry schema changes to tables that already exist in older databases.
 * Each `run` must be idempotent (guarded) so re-runs are safe.
 */
interface Migration {
  version: number
  label: string
  run: (db: Database) => void
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    label: 'tasks.secondaryTagId',
    run: (db) => {
      try {
        db.run('ALTER TABLE tasks ADD COLUMN secondaryTagId INTEGER REFERENCES tags(id) ON DELETE SET NULL;')
      } catch {
        // column already exists
      }
    }
  },
  {
    version: 2,
    label: 'projects.claudeCommand',
    run: (db) => {
      try {
        db.run('ALTER TABLE projects ADD COLUMN claudeCommand TEXT;')
      } catch {
        // column already exists
      }
    }
  },
  {
    version: 3,
    label: 'github_issues.local + body',
    run: (db) => {
      try {
        db.run('ALTER TABLE github_issues ADD COLUMN local INTEGER NOT NULL DEFAULT 0;')
      } catch {
        // column already exists
      }
      try {
        db.run('ALTER TABLE github_issues ADD COLUMN body TEXT;')
      } catch {
        // column already exists
      }
    }
  },
  {
    version: 4,
    label: 'investment_history + backfill current month',
    run: (db) => {
      db.run(`CREATE TABLE IF NOT EXISTS investment_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        investmentId INTEGER NOT NULL REFERENCES investments(id) ON DELETE CASCADE,
        month TEXT NOT NULL,
        amount REAL NOT NULL DEFAULT 0
      );`)
      // Seed one snapshot for the current month from each investment's existing amount,
      // so the evolution chart has a starting point on already-populated databases.
      try {
        const now = new Date()
        const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
        db.run(
          `INSERT INTO investment_history (investmentId, month, amount)
           SELECT id, ?, amount FROM investments
           WHERE id NOT IN (SELECT investmentId FROM investment_history WHERE month = ?);`,
          [month, month]
        )
      } catch {
        // best-effort backfill
      }
    }
  },
  {
    version: 5,
    label: 'links.tags',
    run: (db) => {
      try {
        db.run("ALTER TABLE links ADD COLUMN tags TEXT NOT NULL DEFAULT '[]';")
      } catch {
        // column already exists
      }
    }
  },
  {
    version: 6,
    label: 'todos.aiGenerated',
    run: (db) => {
      try {
        db.run('ALTER TABLE todos ADD COLUMN aiGenerated INTEGER NOT NULL DEFAULT 0;')
      } catch {
        // column already exists
      }
    }
  },
  {
    version: 7,
    label: 'tasks.studyNodeId',
    run: (db) => {
      try {
        db.run('ALTER TABLE tasks ADD COLUMN studyNodeId INTEGER;')
      } catch {
        // column already exists
      }
    }
  },
  {
    version: 8,
    label: 'habit_entries.completedAt',
    run: (db) => {
      try {
        db.run('ALTER TABLE habit_entries ADD COLUMN completedAt TEXT;')
      } catch {
        // column already exists
      }
    }
  },
  {
    version: 9,
    label: 'todos.recurrence',
    run: (db) => {
      try {
        db.run('ALTER TABLE todos ADD COLUMN recurrence TEXT;')
      } catch {
        // column already exists
      }
    }
  },
  {
    version: 10,
    label: 'links.lastOpenedAt',
    run: (db) => {
      try {
        db.run('ALTER TABLE links ADD COLUMN lastOpenedAt TEXT;')
      } catch {
        // column already exists
      }
    }
  },
  {
    version: 11,
    label: 'projects.localPath',
    run: (db) => {
      try {
        db.run('ALTER TABLE projects ADD COLUMN localPath TEXT;')
      } catch {
        // column already exists
      }
    }
  },
  {
    version: 12,
    label: 'projects business pipeline fields',
    run: (db) => {
      // existing projects (work repos) default to the "trabalho" stage
      try { db.run("ALTER TABLE projects ADD COLUMN stage TEXT NOT NULL DEFAULT 'trabalho';") } catch { /* exists */ }
      try { db.run('ALTER TABLE projects ADD COLUMN businessModel TEXT;') } catch { /* exists */ }
      try { db.run('ALTER TABLE projects ADD COLUMN pricing TEXT;') } catch { /* exists */ }
      try { db.run('ALTER TABLE projects ADD COLUMN audience TEXT;') } catch { /* exists */ }
    }
  },
  {
    version: 13,
    label: 'todos.type',
    run: (db) => {
      // existing tasks default to the "projeto" kind
      try { db.run("ALTER TABLE todos ADD COLUMN type TEXT NOT NULL DEFAULT 'projeto';") } catch { /* exists */ }
    }
  },
  {
    version: 14,
    label: 'study_review_log backfill from lastReviewedAt',
    run: (db) => {
      // Seed the append-only review log with one row per already-reviewed card,
      // so the heatmap isn't empty for existing databases. New reviews append going forward.
      try {
        db.run(
          `INSERT INTO study_review_log (flashcardId, topicId, rating, reviewedAt)
           SELECT id, topicId, NULL, lastReviewedAt
           FROM study_flashcards
           WHERE lastReviewedAt IS NOT NULL AND lastReviewedAt <> ''`
        )
      } catch {
        // table missing or already seeded
      }
    }
  },
  {
    version: 15,
    label: 'contacts.country + contacts.state',
    run: (db) => {
      try { db.run('ALTER TABLE contacts ADD COLUMN country TEXT;') } catch { /* exists */ }
      try { db.run('ALTER TABLE contacts ADD COLUMN state TEXT;') } catch { /* exists */ }
    }
  },
  {
    version: 16,
    label: 'Central de Projetos: situação, área, foco, ciclos, vínculos com timer/todos',
    run: (db) => {
      const cols: [string, string][] = [
        ['status', "TEXT NOT NULL DEFAULT 'incubadora'"], // incubadora|fila|foco|pausado|concluido|encerrado
        ['area', "TEXT NOT NULL DEFAULT 'pessoal'"], // pessoal | profissional
        ['priority', 'INTEGER NOT NULL DEFAULT 0'],
        ['finishLine', 'TEXT'],
        ['scope', 'TEXT'],
        ['futureIdeas', 'TEXT'],
        ['nextAction', 'TEXT'],
        ['nextActionAt', 'TEXT'],
        ['whereLeftOff', 'TEXT'],
        ['whereLeftOffAt', 'TEXT'],
        ['blocker', 'TEXT'],
        ['blockerNeed', 'TEXT'],
        ['pauseReason', 'TEXT'],
        ['resumeAt', 'TEXT'],
        ['resumeCondition', 'TEXT'],
        ['closeReason', 'TEXT'],
        ['retrospective', 'TEXT'],
        ['closedAt', 'TEXT'],
        ['statusChangedAt', 'TEXT'],
        ['continuous', 'INTEGER NOT NULL DEFAULT 0'],
        ['triagedAt', 'TEXT'],
        ['lastReviewedAt', 'TEXT'],
        ['createdAt', 'TEXT']
      ]
      for (const [c, def] of cols) {
        try { db.run(`ALTER TABLE projects ADD COLUMN ${c} ${def};`) } catch { /* exists */ }
      }
      try { db.run('ALTER TABLE project_milestones ADD COLUMN cycleId INTEGER;') } catch { /* exists */ }
      try { db.run('ALTER TABLE project_milestones ADD COLUMN description TEXT;') } catch { /* exists */ }
      try { db.run('ALTER TABLE tasks ADD COLUMN projectId INTEGER;') } catch { /* exists */ }
      try { db.run('ALTER TABLE tags ADD COLUMN projectId INTEGER;') } catch { /* exists */ }
      try { db.run('ALTER TABLE todos ADD COLUMN milestoneId INTEGER;') } catch { /* exists */ }
      try { db.run('ALTER TABLE todos ADD COLUMN doneAt TEXT;') } catch { /* exists */ }
      // Dados existentes: "trabalho" era área disfarçada de estágio → estágio indefinido (triagem decide).
      // "morto"/arquivado → encerrado. Projetos antigos entram na incubadora até a triagem.
      const now = new Date().toISOString()
      try {
        db.run("UPDATE projects SET status = 'encerrado', closedAt = COALESCE(closedAt, ?) WHERE archived = 1 OR stage = 'morto'", [now])
        db.run("UPDATE projects SET stage = '' WHERE stage IN ('trabalho', 'morto')")
        db.run('UPDATE projects SET createdAt = ? WHERE createdAt IS NULL', [now])
        db.run('UPDATE projects SET statusChangedAt = ? WHERE statusChangedAt IS NULL', [now])
        db.run("UPDATE todos SET doneAt = createdAt WHERE status = 'done' AND doneAt IS NULL")
      } catch {
        // best-effort backfill
      }
    }
  },
  {
    version: 17,
    label: 'Projetos: tamanho da próxima ação, dias da semana, changelog de ciclo',
    run: (db) => {
      const cols: [string, string, string][] = [
        ['projects', 'nextActionSize', 'TEXT'], // rapida (⚡ 15 min) | longa (🧠 2 h)
        ['projects', 'workDays', 'TEXT'], // JSON: [2,4] (0=dom … 6=sáb)
        ['projects', 'workStart', 'TEXT'], // HH:MM do bloco
        ['projects', 'workMinutes', 'INTEGER'],
        ['projects', 'calendarEventId', 'TEXT'], // evento recorrente no Google
        ['projects', 'calendarAccount', 'TEXT'],
        ['project_cycles', 'changelog', 'TEXT']
      ]
      for (const [t, c, def] of cols) {
        try { db.run(`ALTER TABLE ${t} ADD COLUMN ${c} ${def};`) } catch { /* exists */ }
      }
    }
  },
  {
    version: 18,
    label: 'Pessoas: prioridade e VIP (Central de Mensagens)',
    run: (db) => {
      const cols: [string, string][] = [
        ['priority', "TEXT NOT NULL DEFAULT 'normal'"], // alta | normal | baixa
        ['vip', 'INTEGER NOT NULL DEFAULT 0']
      ]
      for (const [c, def] of cols) {
        try { db.run(`ALTER TABLE contacts ADD COLUMN ${c} ${def};`) } catch { /* exists */ }
      }
    }
  },
  {
    version: 19,
    label: 'Prompt Runner: worktree por conversa, ramificação e anexos',
    run: (db) => {
      const cols: [string, string, string][] = [
        ['ai_conversations', 'useWorktree', 'INTEGER NOT NULL DEFAULT 0'],
        ['ai_conversations', 'worktreeBranch', 'TEXT'],
        ['ai_conversations', 'repoPath', 'TEXT'],
        ['ai_conversations', 'baseRef', 'TEXT'],
        ['ai_conversations', 'forkFrom', 'TEXT'],
        ['ai_conv_turns', 'attachments', "TEXT NOT NULL DEFAULT '[]'"]
      ]
      for (const [t, c, def] of cols) {
        try { db.run(`ALTER TABLE ${t} ADD COLUMN ${c} ${def};`) } catch { /* exists */ }
      }
    }
  },
  {
    version: 20,
    label: 'Prompt Runner: "visto" por conversa (resposta não lida, sincronizado entre aparelhos)',
    run: (db) => {
      try { db.run('ALTER TABLE ai_conversations ADD COLUMN seenAt TEXT;') } catch { /* exists */ }
      // o que já existia conta como lido
      try { db.run('UPDATE ai_conversations SET seenAt = updatedAt WHERE seenAt IS NULL;') } catch { /* tabela nova */ }
    }
  },
  {
    version: 21,
    label: 'Projetos: tags usadas ao "Trabalhar nisso"',
    run: (db) => {
      for (const c of ['workTagId', 'workTagId2']) {
        try { db.run(`ALTER TABLE projects ADD COLUMN ${c} INTEGER;`) } catch { /* exists */ }
      }
    }
  },
  {
    version: 22,
    label: 'Pessoas: tags padrão (só uma vez; apagar uma não a recria)',
    run: (db) => {
      const defaults: [string, string][] = [
        ['Familia', '#ef4444'],
        ['Profissional', '#6366f1'],
        ['Amigo', '#22c55e'],
        ['Das antigas', '#64748b'],
        ['Squad Busters', '#f59e0b'],
        ['Jogos', '#a855f7'],
        ['Facul', '#06b6d4'],
        ['Viagem', '#ec4899']
      ]
      const now = new Date().toISOString()
      for (const [name, color] of defaults) {
        try {
          const st = db.prepare('INSERT OR IGNORE INTO labels (name, color, createdAt) VALUES (?, ?, ?)')
          st.run([name, color, now])
          st.free()
        } catch { /* tabela ausente */ }
      }
    }
  },
  {
    version: 23,
    label: 'Notificações: "Execução de IA concluída/falhou" vão para a aba Claude',
    run: (db) => {
      try {
        db.run("UPDATE notifications SET source = 'claude' WHERE source = 'ia' AND title LIKE '%Execução de IA%';")
      } catch { /* tabela ausente */ }
    }
  },
  {
    version: 24,
    label: 'Projetos: próxima ação vinculada a uma tarefa',
    run: (db) => {
      try { db.run('ALTER TABLE projects ADD COLUMN nextActionTodoId INTEGER;') } catch { /* exists */ }
    }
  },
  {
    version: 25,
    label: 'Central de Mensagens: fixar conversa no topo',
    run: (db) => {
      try { db.run('ALTER TABLE chat_org ADD COLUMN pinnedAt TEXT;') } catch { /* exists ou tabela ausente */ }
    }
  },
  {
    version: 26,
    label: 'Investimentos: encerrar a partir de um mês (snapshot closed)',
    run: (db) => {
      try { db.run('ALTER TABLE investment_history ADD COLUMN closed INTEGER NOT NULL DEFAULT 0;') } catch { /* exists */ }
    }
  },
  {
    version: 27,
    label: 'Transações: ignorar lançamento nos cálculos (ex.: pagamento de fatura)',
    run: (db) => {
      try { db.run('ALTER TABLE transactions ADD COLUMN ignoredReason TEXT;') } catch { /* exists */ }
    }
  },
  {
    version: 28,
    label: 'Transações: id externo (Pluggy), assinatura do banco e status pendente',
    run: (db) => {
      try { db.run('ALTER TABLE transactions ADD COLUMN externalId TEXT;') } catch { /* exists */ }
      try { db.run('ALTER TABLE transactions ADD COLUMN externalSig TEXT;') } catch { /* exists */ }
      try { db.run('ALTER TABLE transactions ADD COLUMN pending INTEGER NOT NULL DEFAULT 0;') } catch { /* exists */ }
      try { db.run('CREATE INDEX IF NOT EXISTS idx_transactions_external ON transactions(externalId);') } catch { /* tabela ausente */ }
    }
  },
  {
    version: 29,
    label: 'Transações: movimentação de investimento (aplicação/resgate) fora de receitas/gastos',
    run: (db) => {
      try { db.run('ALTER TABLE transactions ADD COLUMN investment INTEGER NOT NULL DEFAULT 0;') } catch { /* exists */ }
    }
  },
  {
    version: 30,
    label: 'Transações: transferência entre contas próprias fora de receitas/gastos',
    run: (db) => {
      try { db.run('ALTER TABLE transactions ADD COLUMN transfer INTEGER NOT NULL DEFAULT 0;') } catch { /* exists */ }
    }
  },
  {
    version: 31,
    label: 'Transações: forma de pagamento (preenche as existentes pela descrição)',
    run: (db) => {
      try { db.run('ALTER TABLE transactions ADD COLUMN paymentMethod TEXT;') } catch { /* exists */ }
      try {
        const sel = db.prepare('SELECT id, description FROM transactions WHERE paymentMethod IS NULL')
        const rows: { id: number; description: string | null }[] = []
        while (sel.step()) rows.push(sel.getAsObject() as unknown as { id: number; description: string | null })
        sel.free()
        const upd = db.prepare('UPDATE transactions SET paymentMethod = ? WHERE id = ?')
        for (const r of rows) {
          const pm = detectPaymentMethod(r.description)
          if (pm) upd.run([pm, r.id])
        }
        upd.free()
      } catch { /* tabela ausente */ }
    }
  },
  {
    version: 32,
    label: 'Transações: desfaz "depósito" detectado em nome de loja (regra mais estrita)',
    run: (db) => {
      try {
        const sel = db.prepare("SELECT id, description FROM transactions WHERE paymentMethod = 'deposito' AND externalId IS NULL")
        const ids: number[] = []
        while (sel.step()) {
          const r = sel.getAsObject() as unknown as { id: number; description: string | null }
          if (detectPaymentMethod(r.description) !== 'deposito') ids.push(r.id)
        }
        sel.free()
        for (const id of ids) db.run('UPDATE transactions SET paymentMethod = NULL WHERE id = ?', [id])
      } catch { /* tabela ausente */ }
    }
  },
  {
    version: 33,
    label: 'Investimentos: vínculo com o Open Finance (id externo, nome original e detalhes)',
    run: (db) => {
      try { db.run('ALTER TABLE investments ADD COLUMN externalId TEXT;') } catch { /* exists */ }
      try { db.run('ALTER TABLE investments ADD COLUMN externalName TEXT;') } catch { /* exists */ }
      try { db.run('ALTER TABLE investments ADD COLUMN details TEXT;') } catch { /* exists */ }
    }
  },
  {
    version: 34,
    label: 'Categorias: receita fixa (salário) × extra; "Salário" já marcada',
    run: (db) => {
      try { db.run('ALTER TABLE categories ADD COLUMN fixedIncome INTEGER NOT NULL DEFAULT 0;') } catch { /* exists */ }
      try { db.run("UPDATE categories SET fixedIncome = 1 WHERE id = 1 AND type = 'income';") } catch { /* tabela ausente */ }
    }
  },
  {
    version: 35,
    label: 'Transações: recorrente (detecção automática + exceções por estabelecimento)',
    run: (db) => {
      try { db.run('ALTER TABLE transactions ADD COLUMN recurring INTEGER NOT NULL DEFAULT 0;') } catch { /* exists */ }
    }
  },
  {
    version: 36,
    label: 'Transações: número da parcela (n de N) vindo do Open Finance',
    run: (db) => {
      try { db.run('ALTER TABLE transactions ADD COLUMN installmentNumber INTEGER;') } catch { /* exists */ }
      try { db.run('ALTER TABLE transactions ADD COLUMN installmentTotal INTEGER;') } catch { /* exists */ }
    }
  },
  {
    version: 37,
    label: 'Contas: vínculo com a conta do Open Finance (id externo e última sincronização)',
    run: (db) => {
      try { db.run('ALTER TABLE accounts ADD COLUMN externalId TEXT;') } catch { /* exists */ }
      try { db.run('ALTER TABLE accounts ADD COLUMN syncedAt TEXT;') } catch { /* exists */ }
    }
  },
  {
    version: 38,
    label: 'Transações: estorno pareado com a compra (refundOf; -1 = não parear)',
    run: (db) => {
      try { db.run('ALTER TABLE transactions ADD COLUMN refundOf INTEGER;') } catch { /* exists */ }
    }
  },
  {
    version: 39,
    label: 'Contas: saldo por mês (histórico) — registra o saldo atual das contas do Open Finance no mês da última sync',
    run: (db) => {
      try {
        db.run(`CREATE TABLE IF NOT EXISTS account_balance_history (
          accountId INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
          month TEXT NOT NULL,
          balance REAL NOT NULL,
          syncedAt TEXT NOT NULL,
          PRIMARY KEY (accountId, month)
        );`)
        db.run(`INSERT OR IGNORE INTO account_balance_history (accountId, month, balance, syncedAt)
                SELECT id, substr(syncedAt, 1, 7), balance, syncedAt FROM accounts WHERE externalId IS NOT NULL AND syncedAt IS NOT NULL;`)
      } catch { /* tabela ausente */ }
    }
  },
  {
    version: 40,
    label: 'Investimentos: movimentações do Open Finance (aportes, resgates, proventos, impostos)',
    run: (db) => {
      try {
        db.run(`CREATE TABLE IF NOT EXISTS investment_movements (
          externalId TEXT PRIMARY KEY,
          externalInvestmentId TEXT NOT NULL,
          investmentName TEXT,
          investmentKind TEXT,
          date TEXT NOT NULL,
          type TEXT NOT NULL,
          movementType TEXT,
          amount REAL NOT NULL,
          netAmount REAL,
          quantity REAL
        );`)
      } catch { /* exists */ }
    }
  },
  {
    version: 41,
    label: 'Investimentos: grupos dinâmicos (padrão + criados pelo usuário) e grupo escolhido por investimento',
    run: (db) => {
      try {
        db.run(`CREATE TABLE IF NOT EXISTS investment_groups (
          key TEXT PRIMARY KEY,
          label TEXT NOT NULL,
          icon TEXT NOT NULL DEFAULT '📦',
          sortOrder INTEGER NOT NULL DEFAULT 0,
          builtin INTEGER NOT NULL DEFAULT 0
        );`)
      } catch { /* exists */ }
      INVESTMENT_GROUPS.forEach((g, i) => {
        const stmt = db.prepare('INSERT OR IGNORE INTO investment_groups (key, label, icon, sortOrder, builtin) VALUES (?, ?, ?, ?, 1)')
        stmt.run([g.id, g.label, g.icon, g.id === 'outros' ? 1000 : (i + 1) * 10])
        stmt.free()
      })
      try {
        db.run('ALTER TABLE investments ADD COLUMN groupKey TEXT')
      } catch { /* exists */ }
    }
  },
  {
    version: 42,
    label: 'Contas: saldo separado (manual, por mês) — o Open Finance do Nubank não manda',
    run: (db) => {
      try {
        db.run(`CREATE TABLE IF NOT EXISTS account_reserved_history (
          accountId INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
          month TEXT NOT NULL,
          amount REAL NOT NULL,
          updatedAt TEXT NOT NULL,
          PRIMARY KEY (accountId, month)
        );`)
      } catch { /* exists */ }
    }
  }
]

function getUserVersion(database: Database): number {
  const res = database.exec('PRAGMA user_version')
  const v = res[0]?.values?.[0]?.[0]
  return typeof v === 'number' ? v : 0
}

function runMigrations(database: Database): void {
  const current = getUserVersion(database)
  const target = MIGRATIONS.reduce((max, m) => Math.max(max, m.version), 0)
  if (current >= target) return
  for (const m of MIGRATIONS) {
    if (m.version > current) m.run(database)
  }
  // target is derived from our own literal array → safe to inline (PRAGMA can't bind params)
  database.run(`PRAGMA user_version = ${target}`)
}

// Abertura em andamento: chamadas simultâneas na primeira vez esperam a MESMA abertura.
// (Sem isso, cada uma criava sua própria instância e as escritas de uma se perdiam.)
let opening: Promise<Database> | null = null

export async function getDb(): Promise<Database> {
  if (db) return db
  if (!opening) {
    opening = openDb().finally(() => {
      opening = null
    })
  }
  return opening
}

async function openDb(): Promise<Database> {

  dbPath = dbFilePath()

  // Locate wasm relative to sql.js module itself (works in dev + production)
  const sqlJsModulePath = require.resolve('sql.js')
  const wasmPath = path.join(path.dirname(sqlJsModulePath), 'sql-wasm.wasm')

  const SQL = await initSqlJs({
    locateFile: () => wasmPath
  })

  const fresh = fs.existsSync(dbPath) ? new SQL.Database(fs.readFileSync(dbPath)) : new SQL.Database()

  fresh.run('PRAGMA foreign_keys = ON;')
  registerFunctions(fresh)
  fresh.run(SCHEMA)
  runMigrations(fresh)
  seedAiLibrary(fresh)

  db = fresh
  saveDb()

  return fresh
}

/** Absolute path of the live database file. */
export function dbFilePath(): string {
  return path.join(dataDir(), 'timetracker.db')
}

/** Replace the live DB with the given bytes (import). The next getDb() reloads it. */
export function replaceDbFile(bytes: Buffer): void {
  closeDb()
  fs.writeFileSync(dbFilePath(), bytes)
}

/**
 * Funções SQL próprias. O db.export() do sql.js fecha e reabre a conexão e descarta as funções
 * registradas, então isto roda na abertura e depois de cada export.
 */
function registerFunctions(database: Database): void {
  // lower() do SQLite só trata ASCII: buscas com acento ("Ação") usam esta
  database.create_function('ulower', (s: unknown) => (s == null ? null : String(s).toLowerCase()))
}

export function saveDb(): void {
  if (!db || !dbPath) return
  const data = db.export()
  registerFunctions(db)
  fs.writeFileSync(dbPath, Buffer.from(data))
}

export function closeDb(): void {
  if (db) {
    saveDb()
    db.close()
    db = null
  }
}

/** Backup avulso do banco inteiro em `<dataDir>/<prefixo>-<data-hora>.db` (fora da rotação de snapshots). */
export function backupDbFile(prefix: string): string | null {
  if (!dbPath) return null
  saveDb()
  const now = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  const target = path.join(dataDir(), `${prefix}-${stamp}.db`)
  fs.copyFileSync(dbPath, target)
  return target
}

// ── Daily local snapshots (versioning) ────────────────────────────────────────
const SNAP_KEEP = 3

function snapshotsDir(): string {
  const dir = path.join(dataDir(), 'snapshots')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export interface SnapshotInfo {
  name: string
  path: string
  date: string // ISO (mtime)
  size: number
}

export function listSnapshots(): SnapshotInfo[] {
  const dir = snapshotsDir()
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sqlite'))
    .map((f) => {
      const p = path.join(dir, f)
      const s = fs.statSync(p)
      return { name: f, path: p, date: s.mtime.toISOString(), size: s.size }
    })
    .sort((a, b) => b.name.localeCompare(a.name))
}

/** Copy the current DB to snapshots/ once per day (YYYY-MM-DD), pruning to SNAP_KEEP. */
export function snapshotDailyIfNeeded(): void {
  if (!dbPath || !fs.existsSync(dbPath)) return
  const now = new Date()
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const dir = snapshotsDir()
  const target = path.join(dir, `timetracker_${day}.sqlite`)
  try {
    if (!fs.existsSync(target)) {
      saveDb()
      fs.copyFileSync(dbPath, target)
    }
    // prune oldest beyond SNAP_KEEP
    const all = listSnapshots()
    for (const old of all.slice(SNAP_KEEP)) {
      try {
        fs.unlinkSync(old.path)
      } catch {
        // ignore
      }
    }
  } catch {
    // best-effort; never block boot
  }
}

/** Restore a snapshot: overwrite the live DB file and reset the in-memory handle. */
export function restoreSnapshot(snapPath: string): boolean {
  // only files inside snapshots/ can be restored (the path comes from the client)
  const resolved = path.resolve(snapPath)
  if (path.dirname(resolved) !== path.resolve(snapshotsDir())) return false
  if (!dbPath || !fs.existsSync(resolved)) return false
  closeDb()
  fs.copyFileSync(resolved, dbPath)
  return true
}
