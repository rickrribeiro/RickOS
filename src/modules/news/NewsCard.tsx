import React, { useEffect, useState } from 'react'
import type { NewsDigest, NewsState } from '../../../shared/news'
import { useUIStore } from '../../store/uiStore'
import { localDateStr } from '../../utils/dates'
import { openExternal } from '../../api/createApi'
import './news.css'

const fmtWhen = (iso: string): string =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

const fmtDay = (ymd: string): string => {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })
}

function yesterdayStr(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return localDateStr(d)
}

const generatedToday = (digest: NewsDigest | null): boolean =>
  !!digest && localDateStr(new Date(digest.generatedAt)) === localDateStr(new Date())

/** Card "Resumo de Notícias" no fim do Dashboard (Home) + modal com o resumo salvo. */
export function NewsCard(): React.ReactElement {
  const [state, setState] = useState<NewsState | null>(null)
  const [open, setOpen] = useState(false)

  async function load(): Promise<void> {
    setState(await window.api.news.state().catch(() => null))
  }

  useEffect(() => {
    void load()
    return window.api.news.onUpdated(() => void load())
  }, [])

  const digest = state?.digest ?? null
  const done = generatedToday(digest)

  return (
    <>
      <div className="chart-section" style={{ marginTop: 16 }}>
        <div className="chart-title">📰 Resumo de Notícias</div>
        <div className="news-card-row">
          <span className={`news-card-status ${done ? '' : 'pending'}`}>
            {done
              ? `Atualizado em ${fmtWhen(digest!.generatedAt)}`
              : 'Resumo de hoje ainda não gerado'}
            {!done && digest && (
              <span style={{ display: 'block', fontWeight: 400, fontSize: 12, color: 'var(--text-muted)' }}>
                Último: {fmtWhen(digest.generatedAt)}
              </span>
            )}
          </span>
          <button className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>
            Abrir Resumo
          </button>
        </div>
      </div>
      {open && state && <NewsModal state={state} onChange={setState} onClose={() => setOpen(false)} />}
    </>
  )
}

function NewsModal({
  state,
  onChange,
  onClose
}: {
  state: NewsState
  onChange: (s: NewsState) => void
  onClose: () => void
}): React.ReactElement {
  const { config, digest } = state
  const [selected, setSelected] = useState<string>('__all')
  const [newCat, setNewCat] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [noKeyWarn, setNoKeyWarn] = useState(false)
  /** Categorias sendo refeitas (busca parcial); null = busca completa ou parado. */
  const [retrying, setRetrying] = useState<string[] | null>(null)
  const [memMsg, setMemMsg] = useState<{ ok: boolean; text: string } | null>(null)

  function readMore(url: string): void {
    openExternal(url)
    // registra a leitura (evidência para "Sugerir memórias"); falha aqui não atrapalha a leitura
    window.api.news
      .markRead(url)
      .then((readsCount) => onChange({ ...state, readsCount }))
      .catch(() => undefined)
  }

  async function suggestMemories(): Promise<void> {
    setMemMsg(null)
    try {
      await window.api.memory.produceNews()
      setMemMsg({ ok: true, text: '🧬 Enviado — sugestões no Inbox da Memória Pessoal' })
    } catch (e) {
      setMemMsg({ ok: false, text: e instanceof Error ? e.message : String(e) })
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  async function saveCategories(list: string[]): Promise<void> {
    const categories = await window.api.news.setCategories(list)
    onChange({ ...state, config: { ...config, categories } })
  }

  async function addCategory(): Promise<void> {
    const name = newCat.trim()
    if (!name) return
    if (config.categories.some((c) => c.toLowerCase() === name.toLowerCase())) {
      setNewCat('')
      return
    }
    await saveCategories([...config.categories, name])
    setNewCat('')
  }

  async function removeCategory(name: string): Promise<void> {
    if (selected === name) setSelected('__all')
    await saveCategories(config.categories.filter((c) => c !== name))
  }

  /** Sem `only`: busca completa do dia anterior. Com `only`: refaz só essas categorias do resumo salvo. */
  async function generate(only?: string[]): Promise<void> {
    setError(null)
    if (!config.hasGeminiKey) {
      setNoKeyWarn(true)
      return
    }
    setBusy(true)
    setRetrying(only ?? null)
    try {
      const day = only && digest ? digest.targetDate : yesterdayStr()
      const d = await window.api.news.generate(day, new Date().getTimezoneOffset(), only)
      onChange({ ...state, digest: d })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
      setRetrying(null)
    }
  }

  function goToSettings(): void {
    onClose()
    useUIStore.getState().setPage('settings')
  }

  const groups = digest
    ? digest.categories.filter((g) => selected === '__all' || g.categoria === selected)
    : []
  // Categorias a refazer: as que falharam + as cadastradas depois da última busca.
  const pending = digest
    ? config.categories.filter((c) => {
        const g = digest.categories.find((x) => x.categoria === c)
        return !g || !!g.error
      })
    : []
  const fullBusy = busy && !retrying
  const countOf = (cat: string): number | null => {
    const g = digest?.categories.find((x) => x.categoria === cat)
    return g ? g.topics.length : null
  }

  return (
    <div className="modal-overlay" onClick={() => !busy && onClose()}>
      <div className="modal news-modal" onClick={(e) => e.stopPropagation()}>
        <h2>📰 Resumo de Notícias</h2>
        <div className="news-meta">
          {digest
            ? `Notícias de ${fmtDay(digest.targetDate)} · gerado em ${fmtWhen(digest.generatedAt)} · ${digest.model}`
            : 'Nenhum resumo gerado ainda.'}
        </div>

        <div className="news-pills">
          <button className={`news-pill ${selected === '__all' ? 'active' : ''}`} onClick={() => setSelected('__all')}>
            Todas
          </button>
          {config.categories.map((c) => {
            const n = countOf(c)
            return (
              <span
                key={c}
                className={`news-pill ${selected === c ? 'active' : ''}`}
                onClick={() => setSelected(c)}
                role="button"
              >
                {c}
                {n != null && <span className="news-pill-count">{n}</span>}
                <button
                  className="news-pill-x"
                  title={`Remover categoria ${c}`}
                  disabled={busy}
                  onClick={(e) => {
                    e.stopPropagation()
                    void removeCategory(c)
                  }}
                >
                  ✕
                </button>
              </span>
            )
          })}
        </div>
        <form
          className="news-add"
          onSubmit={(e) => {
            e.preventDefault()
            void addCategory()
          }}
        >
          <input
            type="text"
            placeholder="Nova categoria (ex.: Games, IA, Esportes)"
            value={newCat}
            maxLength={40}
            onChange={(e) => setNewCat(e.target.value)}
          />
          <button type="submit" className="btn btn-secondary btn-sm" disabled={!newCat.trim()}>
            + Adicionar
          </button>
        </form>

        {(noKeyWarn || !config.hasGeminiKey) && (
          <div className="news-warning">
            <span style={{ flex: 1 }}>
              ⚠️ Chave de API do Google Gemini não configurada. Cadastre-a em Configurações para buscar notícias.
            </span>
            <button className="btn btn-secondary btn-sm" onClick={goToSettings}>
              Ir para Configurações
            </button>
          </div>
        )}

        <div className="news-toolbar">
          <button className="btn btn-primary btn-sm" onClick={() => void generate()} disabled={busy || !config.categories.length}>
            {fullBusy ? '⏳ Buscando e resumindo…' : '🔄 Buscar Notícias (Dia Anterior)'}
          </button>
          {pending.length > 0 && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => void generate(pending)}
              disabled={busy}
              title={`Refaz só: ${pending.join(', ')}. O resto do resumo salvo fica como está.`}
            >
              {retrying ? '⏳ Refazendo…' : `🔁 Refazer só as que falharam (${pending.length})`}
            </button>
          )}
          {digest && !busy && pending.length === 0 && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Buscar de novo substitui o resumo salvo.</span>
          )}
          <button
            className="btn btn-secondary btn-sm"
            style={{ marginLeft: 'auto' }}
            onClick={() => void suggestMemories()}
            disabled={busy}
            title="Produtor aprovado da Memória Pessoal: a IA (Claude local) sugere interesses a partir das notícias que você abriu e das suas categorias; nada é salvo sem sua aprovação no Inbox"
          >
            🧬 Sugerir memórias{state.readsCount ? ` (${state.readsCount})` : ''}
          </button>
        </div>
        {error && <div style={{ fontSize: 13, color: 'var(--danger)', marginBottom: 8 }}>{error}</div>}
        {memMsg && (
          <div style={{ fontSize: 12, color: memMsg.ok ? 'var(--success)' : 'var(--danger)', marginBottom: 8 }}>{memMsg.text}</div>
        )}

        <div className="news-body">
          {fullBusy && (
            <div className="empty-hint" style={{ padding: 24 }}>
              Coletando o Google Notícias e resumindo com o Gemini… isso leva alguns segundos.
            </div>
          )}
          {!fullBusy && !digest && (
            <div className="empty-hint" style={{ padding: 24 }}>
              Clique em <strong>Buscar Notícias (Dia Anterior)</strong> para gerar o primeiro resumo.
            </div>
          )}
          {!fullBusy &&
            groups.map((g) => (
              <div key={g.categoria} className="news-group">
                <div className="news-group-title">
                  {g.categoria}
                  {g.memoryItems ? (
                    <span
                      className="news-group-mem"
                      title="Memórias pessoais usadas para priorizar esta categoria (enviadas ao Gemini)"
                    >
                      🧬 {g.memoryItems} {g.memoryItems === 1 ? 'memória' : 'memórias'}
                    </span>
                  ) : null}
                </div>
                {g.error &&
                  (retrying?.includes(g.categoria) ? (
                    <div className="empty-hint">⏳ Tentando de novo…</div>
                  ) : (
                    <div className="news-group-error">
                      Falhou: {g.error}{' '}
                      <button className="news-readmore" onClick={() => void generate([g.categoria])} disabled={busy}>
                        Tentar de novo
                      </button>
                    </div>
                  ))}
                {!g.error && g.topics.length === 0 && (
                  <div className="empty-hint">Nenhuma notícia encontrada para o dia.</div>
                )}
                {g.topics.map((t, i) => (
                  <div key={i} className="news-topic">
                    <div className="news-topic-title">{t.titulo_resumido}</div>
                    <div className="news-topic-summary">{t.resumo_curto}</div>
                    <div className="news-topic-foot">
                      <button className="news-readmore" onClick={() => readMore(t.url_fonte)}>
                        Ler mais ↗
                      </button>
                      {t.fonte && <span>{t.fonte}</span>}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          {!fullBusy && digest && selected !== '__all' && groups.length === 0 && (
            <div className="empty-hint" style={{ padding: 24 }}>
              {retrying?.includes(selected) ? (
                '⏳ Buscando esta categoria…'
              ) : (
                <>
                  Categoria nova, ainda fora do resumo.{' '}
                  <button className="news-readmore" onClick={() => void generate([selected])} disabled={busy}>
                    Buscar só esta
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        <div className="modal-actions">
          <button className="btn btn-secondary btn-sm" onClick={onClose} disabled={busy}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}
