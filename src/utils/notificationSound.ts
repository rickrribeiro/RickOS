/**
 * Som das notificações, sintetizado com Web Audio (sem arquivo de áudio).
 * A preferência é por aparelho (localStorage): dá para silenciar o celular e manter o desktop.
 */

const KEY = 'rickos.notifSound'

export function isNotificationSoundOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off'
  } catch {
    return true
  }
}

export function setNotificationSoundOn(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off')
  } catch {
    // sem storage: fica ligado
  }
}

let ctx: AudioContext | null = null

function audio(): AudioContext | null {
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

// Navegadores só liberam áudio depois de uma interação: destrava no primeiro clique/tecla.
let unlockWired = false
export function wireNotificationSoundUnlock(): void {
  if (unlockWired) return
  unlockWired = true
  const unlock = (): void => {
    audio()
    window.removeEventListener('pointerdown', unlock)
    window.removeEventListener('keydown', unlock)
  }
  window.addEventListener('pointerdown', unlock)
  window.addEventListener('keydown', unlock)
}

/** `attention` (Claude esperando você) toca três notas subindo; o resto, duas notas suaves. */
export function playNotificationSound(kind: 'default' | 'attention' = 'default', force = false): void {
  if (!force && !isNotificationSoundOn()) return
  const ac = audio()
  if (!ac) return
  const notes = kind === 'attention' ? [660, 880, 1175] : [880, 1320]
  const step = kind === 'attention' ? 0.11 : 0.13
  const t0 = ac.currentTime + 0.02
  notes.forEach((freq, i) => {
    const start = t0 + i * step
    const osc = ac.createOscillator()
    const gain = ac.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0, start)
    gain.gain.linearRampToValueAtTime(0.18, start + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35)
    osc.connect(gain).connect(ac.destination)
    osc.start(start)
    osc.stop(start + 0.4)
  })
}
