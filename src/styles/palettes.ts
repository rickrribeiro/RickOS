// One stylesheet per palette (Grafite, Vampiro, …) — see SKIN_OPTIONS in skin.ts.
// Lives in its own module because Vite hoists import.meta.glob to the top of the
// file: imported from main.tsx after palettes.css, the palettes load after it
// and can override its rules (e.g. the cartoon style of "Plataforma").
import.meta.glob('./palette-*.css', { eager: true })
