import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'

/**
 * Leitura local de fotos do Beeper Desktop quando a API recusa servi-las (Instagram/LinkedIn
 * respondem 403 "fora dos diretórios permitidos"). Só é usada no modo direto com o Beeper no
 * mesmo computador, e só aceita IMAGENS dentro da pasta de dados do Beeper (caminho real,
 * sem symlink escapando), até 5 MB.
 */
const MAX_BYTES = 5 * 1024 * 1024

function beeperRoots(): string[] {
  const home = os.homedir()
  const list = [
    path.join(home, 'Library', 'Application Support', 'BeeperTexts'),
    path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), 'BeeperTexts'),
    process.env.APPDATA ? path.join(process.env.APPDATA, 'BeeperTexts') : ''
  ]
  const out: string[] = []
  for (const r of list) {
    if (!r) continue
    try {
      out.push(fs.realpathSync(r))
    } catch {
      // não existe nesta máquina
    }
  }
  return out
}

export function sniffImage(b: Buffer): string | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  if (b.length >= 6 && /^GIF8[79]a$/.test(b.subarray(0, 6).toString('latin1'))) return 'image/gif'
  if (b.length >= 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp'
  return null
}

/** Caminho real do arquivo se estiver dentro da pasta do Beeper; senão null. */
export function resolveBeeperFile(ref: string, roots = beeperRoots()): string | null {
  if (!ref.startsWith('file://')) return null
  let p: string
  try {
    p = fs.realpathSync(fileURLToPath(new URL(ref)))
  } catch {
    return null
  }
  return roots.some((r) => p.startsWith(r + path.sep)) ? p : null
}

export function readBeeperImage(ref: string, roots?: string[]): { contentType: string; body: Buffer } | null {
  const p = resolveBeeperFile(ref, roots)
  if (!p) return null
  try {
    const st = fs.statSync(p)
    if (!st.isFile() || st.size > MAX_BYTES) return null
    const body = fs.readFileSync(p)
    const contentType = sniffImage(body)
    return contentType ? { contentType, body } : null
  } catch {
    return null
  }
}
