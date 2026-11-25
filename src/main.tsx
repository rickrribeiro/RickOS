import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { createApi } from './api/createApi'
import { subscribe } from './api/transport'
import { applySkin } from './styles/skin'
import { playNotificationSound, wireNotificationSoundUnlock } from './utils/notificationSound'
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import './index.css'
import './styles/responsive.css'
import './styles/skin-devlytics.css'
import './styles/palettes.css'
// one file per palette (Grafite, Vampiro, …) — see SKIN_OPTIONS in src/styles/skin.ts
import.meta.glob('./styles/palette-*.css', { eager: true })

// Same API on desktop and web: everything goes to the rickOS server over HTTP.
window.api = createApi() as unknown as Window['api']

applySkin()
wireNotificationSoundUnlock()

// Server push: notifications (rules engine, agents) and DB swaps (import/restore).
subscribe('notify', (p) => {
  const { title, body, source } = p as { title: string; body: string; source?: string }
  // O som é nosso (popups vão silenciosos): Claude esperando ação toca um som diferente.
  playNotificationSound(source === 'claude' && title.startsWith('🤚') ? 'attention' : 'default')
  if (window.desktop) {
    window.desktop.notify(title, body)
    return
  }
  if (!('Notification' in window)) return
  if (Notification.permission === 'granted') new Notification(title, { body, silent: true })
  else if (Notification.permission === 'default') {
    void Notification.requestPermission().then((perm) => {
      if (perm === 'granted') new Notification(title, { body, silent: true })
    })
  }
})
subscribe('db:replaced', () => window.location.reload())

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
