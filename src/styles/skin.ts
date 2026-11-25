/**
 * Visual skins. `classic` = the original look (src/index.css untouched);
 * `devlytics` = Geist + zinc + green glass (src/styles/skin-devlytics.css);
 * the others = same structure as devlytics with another palette
 * (src/styles/palettes.css + palette-<id>.css, loaded automatically), applied as
 * data-skin='devlytics' + data-palette='<id>'.
 *
 * New palette: create src/styles/palette-<id>.css and add one entry to SKIN_OPTIONS.
 *
 * ↓ To bring the desktop back to the old look, set `desktop: 'classic'` here
 *   (or pick "Clássico" in Configurações → Aparência, which overrides per device).
 */
export const DEFAULT_SKIN: Record<'desktop' | 'web', Skin> = {
  desktop: 'devlytics',
  web: 'devlytics'
}

export type Theme = 'dark' | 'light'

/** Every visual, in the order shown in Configurações → Aparência. `chrome` = theme-color meta (PWA status bar). */
export const SKIN_OPTIONS = [
  { id: 'devlytics', label: 'Devlytics', chrome: { dark: '#18181b', light: '#f4f4f5' } },
  { id: 'grafite', label: 'Grafite & Coral', chrome: { dark: '#18191b', light: '#faf9f7' } },
  { id: 'vampiro', label: 'Vampiro', chrome: { dark: '#170f12', light: '#faf6f6' } },
  { id: 'floresta', label: 'Floresta', chrome: { dark: '#121a16', light: '#f6f7f2' } },
  { id: 'abissal', label: 'Abissal', chrome: { dark: '#0d1619', light: '#f4f8f9' } },
  { id: 'sepia', label: 'Sépia', chrome: { dark: '#1e1812', light: '#f4ecdd' } },
  { id: 'artico', label: 'Ártico', chrome: { dark: '#1f242d', light: '#f3f5f8' } },
  { id: 'synthwave', label: 'Sintetizador', chrome: { dark: '#140f1f', light: '#faf7fd' } },
  { id: 'alto-contraste', label: 'Alto contraste', chrome: { dark: '#000000', light: '#ffffff' } },
  { id: 'matcha', label: 'Matcha', chrome: { dark: '#171c15', light: '#f5f7f1' } },
  { id: 'meia-noite', label: 'Meia-noite dourada', chrome: { dark: '#0e1322', light: '#f7f6f1' } },
  { id: 'hacker', label: 'Hacker', chrome: { dark: '#050a06', light: '#f2f7f1' } },
  { id: 'vscode', label: 'VS Code', chrome: { dark: '#121314', light: '#ffffff' } },
  { id: 'dracula', label: 'Dracula', chrome: { dark: '#282a36', light: '#fffbeb' } },
  { id: 'plataforma', label: 'Plataforma', chrome: { dark: '#16204a', light: '#8fd3ff' } },
  { id: 'classic', label: 'Clássico', chrome: { dark: '#0f172a', light: '#0f172a' } }
] as const satisfies readonly { id: string; label: string; chrome: Record<Theme, string> }[]

export type Skin = (typeof SKIN_OPTIONS)[number]['id']

const SKINS: Skin[] = SKIN_OPTIONS.map((o) => o.id)
/** Skins that have their own stylesheet; every other one is a palette over devlytics. */
const isPaletteSkin = (s: Skin): boolean => s !== 'classic' && s !== 'devlytics'
const THEMES: Theme[] = ['dark', 'light']

function platform(): 'desktop' | 'web' {
  return window.desktop ? 'desktop' : 'web'
}
const skinKey = (): string => `rickos-skin-${platform()}`
const THEME_KEY = 'rickos-theme'

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function write(key: string, value: string | null): void {
  try {
    if (value == null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // storage unavailable — choice lasts for this session only
  }
}
function fromQuery(name: string): string | null {
  try {
    return new URLSearchParams(window.location.search).get(name)
  } catch {
    return null
  }
}

export function getSkin(): Skin {
  const v = fromQuery('skin') || read(skinKey())
  return SKINS.includes(v as Skin) ? (v as Skin) : DEFAULT_SKIN[platform()]
}

export function getTheme(): Theme {
  const v = fromQuery('theme') || read(THEME_KEY)
  return THEMES.includes(v as Theme) ? (v as Theme) : 'dark'
}

/** Persist a per-device choice; `null` goes back to DEFAULT_SKIN. */
export function setSkin(skin: Skin | null): void {
  write(skinKey(), skin)
  applySkin()
}

const FAVORITES_KEY = 'rickos-skin-favorites'
/** Shown in Aparência before "ver mais" until the user stars their own. */
const DEFAULT_FAVORITES: Skin[] = ['devlytics', 'grafite', 'vampiro', 'classic']

/** Visuals starred in Configurações → Aparência (per device, like the skin itself). */
export function getFavoriteSkins(): Skin[] {
  const raw = read(FAVORITES_KEY)
  if (raw == null) return DEFAULT_FAVORITES
  try {
    const list = JSON.parse(raw)
    return Array.isArray(list) ? SKINS.filter((s) => list.includes(s)) : DEFAULT_FAVORITES
  } catch {
    return DEFAULT_FAVORITES
  }
}

export function setFavoriteSkins(list: Skin[]): void {
  write(FAVORITES_KEY, JSON.stringify(list))
}

export function setTheme(theme: Theme): void {
  write(THEME_KEY, theme)
  applySkin()
}

export function applySkin(): void {
  const d = document.documentElement
  const skin = getSkin()
  const theme = skin === 'classic' ? 'dark' : getTheme() // classic only has a dark palette
  // palette skins reuse the devlytics structure; only the colors change
  const isPalette = isPaletteSkin(skin)
  d.dataset.skin = isPalette ? 'devlytics' : skin
  if (isPalette) d.dataset.palette = skin
  else delete d.dataset.palette
  d.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', SKIN_OPTIONS.find((o) => o.id === skin)!.chrome[theme])
}
