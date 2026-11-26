import React, { useEffect, useState } from 'react'
import type { NewsDigest, NewsState } from '../../../shared/news'
import { localDateStr } from '../../utils/dates'
import { openExternal } from '../../api/createApi'
import './news.css'
import { openSettings } from '../settings/tabs'
import { t as tr, getLocale } from '../../i18n'

const fmtWhen = (iso: string): string =>
  new Date(iso).toLocaleString(getLocale(), { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

const fmtDay = (ymd: string): string => {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(getLocale(), { weekday: 'long', day: '2-digit', month: '2-digit' })
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
        <div className="chart-title">{tr('misc.resumoDeNoticias')}</div>
        <div className="news-card-row">
          <span className={`news-card-status ${done ? '' : 'pending'}`}>
            {done
              ? tr('misc.atualizadoEm', { p0: fmtWhen(digest!.generatedAt) })
              : tr('misc.resumoDeHojeAindaNao')}
            {!done && digest && (
              <span style={{ display: 'block', fontWeight: 400, fontSize: 12, color: 'var(--text-muted)' }}>
                {tr('misc.ultimo', { p0: fmtWhen(digest.generatedAt) })}
              </span>
            )}
          </span>
          <button className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>
            {tr('misc.abrirResumo')}
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
      setMemMsg({ ok: true, text: tr('misc.enviadoSugestoesNoInboxDa') })
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
    openSettings('integracoes', 'noticias')
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
        <h2>{tr('misc.resumoDeNoticias')}</h2>
        <div className="news-meta">
          {digest
            ? tr('misc.noticiasDeGeradoEm', { p0: fmtDay(digest.targetDate), p1: fmtWhen(digest.generatedAt), model: digest.model })
            : tr('misc.nenhumResumoGeradoAinda')}
        </div>

        <div className="news-pills">
          <button className={`news-pill ${selected === '__all' ? 'active' : ''}`} onClick={() => setSelected('__all')}>
            {tr('misc.todas')}
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
                  title={tr('misc.removerCategoria', { c })}
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
            placeholder={tr('misc.novaCategoriaExGamesIa')}
            value={newCat}
            maxLength={40}
            onChange={(e) => setNewCat(e.target.value)}
          />
          <button type="submit" className="btn btn-secondary btn-sm" disabled={!newCat.trim()}>
            {tr('misc.adicionar')}
          </button>
        </form>

        {(noKeyWarn || !config.hasGeminiKey) && (
          <div className="news-warning">
            <span style={{ flex: 1 }}>
              {tr('misc.chaveDeApiDoGoogle')}
            </span>
            <button className="btn btn-secondary btn-sm" onClick={goToSettings}>
              {tr('misc.irParaConfiguracoes')}
            </button>
          </div>
        )}

        <div className="news-toolbar">
          <button className="btn btn-primary btn-sm" onClick={() => void generate()} disabled={busy || !config.categories.length}>
            {fullBusy ? tr('misc.buscandoEResumindo') : tr('misc.buscarNoticiasDiaAnterior')}
          </button>
          {pending.length > 0 && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => void generate(pending)}
              disabled={busy}
              title={tr('misc.refazSoORestoDo', { p0: pending.join(', ') })}
            >
              {retrying ? tr('misc.refazendo') : tr('misc.refazerSoAsQueFalharam', { count: pending.length })}
            </button>
          )}
          {digest && !busy && pending.length === 0 && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{tr('misc.buscarDeNovoSubstituiO')}</span>
          )}
          <button
            className="btn btn-secondary btn-sm"
            style={{ marginLeft: 'auto' }}
            onClick={() => void suggestMemories()}
            disabled={busy}
            title={tr('misc.produtorAprovadoDaMemoriaPessoal')}
          >
            {tr('misc.sugerirMemorias')}{state.readsCount ? ` (${state.readsCount})` : ''}
          </button>
        </div>
        {error && <div style={{ fontSize: 13, color: 'var(--danger)', marginBottom: 8 }}>{error}</div>}
        {memMsg && (
          <div style={{ fontSize: 12, color: memMsg.ok ? 'var(--success)' : 'var(--danger)', marginBottom: 8 }}>{memMsg.text}</div>
        )}

        <div className="news-body">
          {fullBusy && (
            <div className="empty-hint" style={{ padding: 24 }}>
              {tr('misc.coletandoOGoogleNoticiasE')}
            </div>
          )}
          {!fullBusy && !digest && (
            <div className="empty-hint" style={{ padding: 24 }}>
              {tr('misc.cliqueEm')} <strong>{tr('misc.buscarNoticiasDiaAnterior2')}</strong> {tr('misc.paraGerarOPrimeiroResumo')}
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
                      title={tr('misc.memoriasPessoaisUsadasParaPriorizar')}
                    >
                      🧬 {g.memoryItems} {g.memoryItems === 1 ? tr('misc.memoria') : tr('misc.memorias')}
                    </span>
                  ) : null}
                </div>
                {g.error &&
                  (retrying?.includes(g.categoria) ? (
                    <div className="empty-hint">{tr('misc.tentandoDeNovo')}</div>
                  ) : (
                    <div className="news-group-error">
                      {tr('misc.falhou')} {g.error}{' '}
                      <button className="news-readmore" onClick={() => void generate([g.categoria])} disabled={busy}>
                        {tr('misc.tentarDeNovo')}
                      </button>
                    </div>
                  ))}
                {!g.error && g.topics.length === 0 && (
                  <div className="empty-hint">{tr('misc.nenhumaNoticiaEncontradaParaO')}</div>
                )}
                {g.topics.map((t, i) => (
                  <div key={i} className="news-topic">
                    <div className="news-topic-title">{t.titulo_resumido}</div>
                    <div className="news-topic-summary">{t.resumo_curto}</div>
                    <div className="news-topic-foot">
                      <button className="news-readmore" onClick={() => readMore(t.url_fonte)}>
                        {tr('misc.lerMais')}
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
                tr('misc.buscandoEstaCategoria')
              ) : (
                <>
                  {tr('misc.categoriaNovaAindaForaDo')}{' '}
                  <button className="news-readmore" onClick={() => void generate([selected])} disabled={busy}>
                    {tr('misc.buscarSoEsta')}
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        <div className="modal-actions">
          <button className="btn btn-secondary btn-sm" onClick={onClose} disabled={busy}>
            {tr('misc.fechar')}
          </button>
        </div>
      </div>
    </div>
  )
}
