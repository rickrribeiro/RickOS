import React, { useState } from 'react'
import { useNavStyleStore } from '../../../store/navStyleStore'
import {
  DEFAULT_SKIN,
  SKIN_OPTIONS,
  Skin,
  Theme,
  getFavoriteSkins,
  getSkin,
  getTheme,
  setFavoriteSkins,
  setSkin,
  setTheme
} from '../../../styles/skin'

/** Visual (skin) and light/dark theme — saved per device (desktop and web independently). */
export function AppearanceSection(): React.ReactElement {
  const [skin, setSkinState] = useState<Skin>(getSkin())
  const [theme, setThemeState] = useState<Theme>(getTheme())
  const platform = window.desktop ? 'desktop' : 'web'
  const { navStyle, setNavStyle } = useNavStyleStore()
  const [favorites, setFavorites] = useState<Skin[]>(getFavoriteSkins())
  const [showAll, setShowAll] = useState(false)

  const toggleFavorite = (s: Skin): void => {
    const next = favorites.includes(s) ? favorites.filter((f) => f !== s) : [...favorites, s]
    setFavoriteSkins(next)
    setFavorites(next)
  }
  // the visual in use always stays visible, even when it isn't a favorite
  const visible = SKIN_OPTIONS.filter((o) => showAll || favorites.includes(o.id) || o.id === skin)
  const hiddenCount = SKIN_OPTIONS.length - SKIN_OPTIONS.filter((o) => favorites.includes(o.id) || o.id === skin).length

  const pickSkin = (s: Skin): void => {
    setSkin(s === DEFAULT_SKIN[platform] ? null : s)
    setSkinState(s)
  }
  const pickTheme = (t: Theme): void => {
    setTheme(t)
    setThemeState(t)
  }

  return (
    <div className="chart-section" style={{ maxWidth: 560 }}>
      <div className="chart-title">🎨 Aparência</div>
      <div className="editor-field">
        <label>Visual ({platform === 'desktop' ? 'este computador' : 'este navegador'})</label>
        <div className="skin-picker">
          {visible.map((o) => {
            const fav = favorites.includes(o.id)
            return (
              <div key={o.id} className={`skin-chip ${skin === o.id ? 'active' : ''}`}>
                <button className="skin-chip-name" onClick={() => pickSkin(o.id)} aria-pressed={skin === o.id}>
                  {o.label}
                </button>
                <button
                  className={`skin-chip-star ${fav ? 'on' : ''}`}
                  onClick={() => toggleFavorite(o.id)}
                  aria-pressed={fav}
                  aria-label={fav ? `Tirar ${o.label} dos favoritos` : `Favoritar ${o.label}`}
                  title={fav ? 'Tirar dos favoritos' : 'Favoritar'}
                >
                  {fav ? '★' : '☆'}
                </button>
              </div>
            )
          })}
          {(hiddenCount > 0 || showAll) && (
            <button className="skin-picker-more" onClick={() => setShowAll(!showAll)}>
              {showAll ? 'Ver menos' : `Ver mais (${hiddenCount})`}
            </button>
          )}
        </div>
      </div>
      {skin !== 'classic' && (
        <div className="editor-field">
          <label>Tema</label>
          <div className="seg-toggle">
            <button className={`seg-btn ${theme === 'dark' ? 'active' : ''}`} onClick={() => pickTheme('dark')}>
              Escuro
            </button>
            <button className={`seg-btn ${theme === 'light' ? 'active' : ''}`} onClick={() => pickTheme('light')}>
              Claro
            </button>
          </div>
        </div>
      )}
      <div className="editor-field">
        <label>Navegação dos módulos</label>
        <div className="seg-toggle">
          <button className={`seg-btn ${navStyle === 'tabs' ? 'active' : ''}`} onClick={() => setNavStyle('tabs')}>
            Abas no topo
          </button>
          <button className={`seg-btn ${navStyle === 'sidebar' ? 'active' : ''}`} onClick={() => setNavStyle('sidebar')}>
            Submenu lateral
          </button>
        </div>
      </div>
    </div>
  )
}
