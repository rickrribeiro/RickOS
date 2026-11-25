/**
 * Visual skins. `classic` = the original look (src/index.css untouched);
 * `devlytics` = Geist + zinc + green glass (src/styles/skin-devlytics.css);
 * `grafite` / `vampiro` = same structure as devlytics with another palette
 * (src/styles/palettes.css + palette-<name>.css), applied as
 * data-skin='devlytics' + data-palette='<name>'.
 *
 * ↓ To bring the desktop back to the old look, set `desktop: 'classic'` here
 *   (or pick "Clássico" in Configurações → Aparência, which overrides per device).
 */
export const DEFAULT_SKIN: Record<'desktop' | 'web', Skin> = {
  desktop: 'devlytics',
  web: 'devlytics'
}

export type Skin = 'classic' | 'devlytics' | 'grafite' | 'vampiro'
export type Theme = 'dark' | 'light'

const SKINS: Skin[] = ['classic', 'devlytics', 'grafite', 'vampiro']
/** Skins that are just a palette over devlytics. */
const PALETTE_SKINS: Skin[] = ['grafite', 'vampiro']
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

export function setTheme(theme: Theme): void {
  write(THEME_KEY, theme)
  applySkin()
}

/** Browser chrome color (PWA status bar / theme-color) per skin × theme. */
const CHROME_COLOR: Record<Skin, Record<Theme, string>> = {
  classic: { dark: '#0f172a', light: '#0f172a' },
  devlytics: { dark: '#18181b', light: '#f4f4f5' },
  grafite: { dark: '#18191b', light: '#faf9f7' },
  vampiro: { dark: '#170f12', light: '#faf6f6' }
}

export function applySkin(): void {
  const d = document.documentElement
  const skin = getSkin()
  const theme = skin === 'classic' ? 'dark' : getTheme() // classic only has a dark palette
  // palette skins reuse the devlytics structure; only the colors change
  const isPalette = PALETTE_SKINS.includes(skin)
  d.dataset.skin = isPalette ? 'devlytics' : skin
  if (isPalette) d.dataset.palette = skin
  else delete d.dataset.palette
  d.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', CHROME_COLOR[skin][theme])
}
