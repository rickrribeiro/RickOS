/**
 * Tradução dos textos de `shared/` (rótulos usados pelo front e pelo servidor).
 *
 * O pt-BR mora aqui mesmo, ao lado de cada mapa. Só o front registra um tradutor
 * (`setSharedTranslator`, ver `src/i18n`); o servidor nunca registra, então nele os
 * rótulos continuam em pt — prompts e contexto de IA não mudam de idioma.
 */

type Translator = (key: string, pt: string) => string | undefined

let translator: Translator | null = null
let locale = 'pt-BR'

export function setSharedTranslator(l: string, fn: Translator | null): void {
  locale = l
  translator = fn
}

/** Locale para `Intl`/`toLocale*` em código compartilhado (no servidor, sempre pt-BR). */
export function sharedLocale(): string {
  return locale
}

/** Texto avulso: `st('shared.chats.otherNetwork', 'Outra')`. */
export function st(key: string, pt: string): string {
  return translator?.(key, pt) ?? pt
}

/** Mapa de rótulos traduzível (chave `${prefix}.${k}`); lido a cada acesso. */
export function labels<K extends string>(prefix: string, pt: Record<K, string>): Record<K, string> {
  const out = {} as Record<K, string>
  for (const k of Object.keys(pt) as K[]) {
    Object.defineProperty(out, k, { get: () => st(`${prefix}.${k}`, pt[k]), enumerable: true })
  }
  return out
}

/** Lista de itens com `label` traduzível, identificados por `idKey` (ex.: `id`, `v`). */
export function labeled<T extends { label: string }>(prefix: string, idKey: keyof T, items: T[]): T[] {
  return items.map((item) => {
    const copy = { ...item }
    const pt = item.label
    Object.defineProperty(copy, 'label', { get: () => st(`${prefix}.${String(item[idKey])}`, pt), enumerable: true })
    return copy
  })
}
