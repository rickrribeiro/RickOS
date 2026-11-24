import React, { useEffect, useMemo, useState } from 'react'
import type { Project } from '../../../types'
import { unnumberedRoadmapItems } from '../../../../shared/roadmap'
import { MARK_ICON, MARK_LABEL, RoadmapMark, RoadmapNode, buildRoadmapDelegation, flattenRoadmap, isOpenItem, nextMark, openIds, parseRoadmap, roadmapStats } from '../lib/roadmap'

type Mode = 'arvore' | 'tabela'

/** Roadmap de funcionalidades lido do ROADMAP_RICKOS.md na raiz do projeto (árvore ou tabela). */
export function RoadmapView({
  project,
  onDelegate
}: {
  project: Project
  /** Delegar itens selecionados: abre o modal de delegação (prompt no Prompt Runner). */
  /** `onDone` deve ser chamado quando a delegação for feita: marca os itens como em andamento. */
  onDelegate?: (task: string, instructions: string, title: string, onDone: () => Promise<void>) => void
}): React.ReactElement {
  const [data, setData] = useState<{ path: string | null; exists: boolean; content: string } | null>(null)
  const [mode, setMode] = useState<Mode>('arvore')
  const [filter, setFilter] = useState<'todos' | 'abertos' | RoadmapMark>('todos')
  const [version, setVersion] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  async function load(): Promise<void> {
    setError('')
    try {
      setData(await window.api.projects.roadmap(project.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }
  useEffect(() => {
    void load()
  }, [project.id])

  const tree = useMemo(() => (data?.exists ? parseRoadmap(data.content) : []), [data])
  const stats = useMemo(() => roadmapStats(tree), [tree])
  const rows = useMemo(() => flattenRoadmap(tree), [tree])
  // seleção sobrevive a recargas só para itens que continuam abertos na mesma linha
  const openRows = useMemo(() => rows.filter((r) => isOpenItem(r.node)), [rows])
  const picked = useMemo(() => openRows.filter((r) => selected.has(r.node.id)), [openRows, selected])

  function toggleIds(ids: string[]): void {
    if (!ids.length) return
    const next = new Set(selected)
    const all = ids.every((id) => next.has(id))
    ids.forEach((id) => (all ? next.delete(id) : next.add(id)))
    setSelected(next)
  }

  function delegate(): void {
    if (!onDelegate || !picked.length) return
    const d = buildRoadmapDelegation(picked)
    const todo = picked.filter((r) => r.node.mark === ' ').map((r) => ({ line: r.node.line, expected: r.node.raw.trim() }))
    onDelegate(d.task, d.instructions, d.title, async () => {
      setSelected(new Set())
      setSelecting(false)
      if (!todo.length) return
      try {
        const r = await window.api.projects.roadmapSetMany(project.id, todo, '~')
        setData((cur) => (cur ? { ...cur, content: r.content } : cur))
      } catch (e) {
        setError(`Delegado, mas não consegui marcar em andamento: ${e instanceof Error ? e.message : String(e)}`)
        void load()
      }
    })
  }

  const pickBox = (ids: string[]): React.ReactElement | null =>
    selecting ? (
      <input
        type="checkbox"
        className="ph-rm-pick"
        disabled={!ids.length}
        checked={ids.length > 0 && ids.every((id) => selected.has(id))}
        onChange={() => toggleIds(ids)}
        onClick={(e) => e.stopPropagation()}
        title={ids.length ? `Selecionar ${ids.length} ${ids.length === 1 ? 'item aberto' : 'itens abertos'}` : 'Nada aberto aqui'}
      />
    ) : null

  const unnumbered = useMemo(() => (data?.exists ? unnumberedRoadmapItems(data.content) : 0), [data])
  const versions = useMemo(() => [...new Set(rows.map((r) => r.node.version).filter(Boolean))] as string[], [rows])

  async function cycle(n: RoadmapNode, to?: RoadmapMark): Promise<void> {
    if (!n.mark) return
    const mark = to ?? nextMark(n.mark)
    try {
      const r = await window.api.projects.roadmapSet(project.id, n.line, n.raw.trim(), mark)
      setData((d) => (d ? { ...d, content: r.content } : d))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      void load()
    }
  }

  async function numberItems(): Promise<void> {
    try {
      const r = await window.api.projects.roadmapNumber(project.id)
      setData((d) => (d ? { ...d, content: r.content } : d))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      void load()
    }
  }

  async function createTemplate(): Promise<void> {
    try {
      await window.api.projects.roadmapCreate(project.id)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const matches = (n: RoadmapNode): boolean =>
    (filter === 'todos' || (filter === 'abertos' ? n.mark === ' ' || n.mark === '~' : n.mark === filter)) && (!version || n.version === version)

  if (!project.localPath) {
    return <div className="empty-hint">Defina o caminho local do projeto (Editar) para ler o <code>ROADMAP_RICKOS.md</code>.</div>
  }
  if (!data) return <div className="empty-hint">Carregando roadmap…</div>
  if (!data.exists) {
    return (
      <div className="chart-section">
        <div className="chart-title">🗺 Sem roadmap ainda</div>
        <p className="ph-muted" style={{ margin: '8px 0' }}>
          Crie <code>ROADMAP_RICKOS.md</code> na raiz de <code>{project.localPath}</code> seguindo o padrão: <code>##</code> área, <code>###</code> funcionalidade, <code>- [ ]</code> tarefa, <code>@v1</code> versão, <code>!alta</code> prioridade.
        </p>
        <button className="btn btn-primary btn-sm" onClick={createTemplate}>Criar a partir do modelo</button>
        {error && <div className="ph-error">{error}</div>}
      </div>
    )
  }

  const pct = stats.total ? Math.round((stats.done / stats.total) * 100) : 0

  const renderNode = (n: RoadmapNode): React.ReactElement | null => {
    if (n.kind === 'heading') {
      const s = roadmapStats(n.children)
      const isCollapsed = collapsed.has(n.id)
      const kids = n.children.map(renderNode).filter(Boolean)
      if (!kids.length && filter !== 'todos') return null
      return (
        <div key={n.id} className={`ph-rm-group lvl-${n.level}`}>
          <div className="ph-rm-heading-row">
          {pickBox(openIds(n))}
          <button
            className="ph-rm-heading"
            onClick={() => {
              const next = new Set(collapsed)
              if (isCollapsed) next.delete(n.id)
              else next.add(n.id)
              setCollapsed(next)
            }}
          >
            <span>{isCollapsed ? '▸' : '▾'}</span>
            <span className="ph-rm-heading-text">{n.text}</span>
            {s.total > 0 && (
              <>
                <span className="ph-rm-mini"><span style={{ width: `${(s.done / s.total) * 100}%` }} /></span>
                <span className="ph-muted">{s.done}/{s.total}</span>
              </>
            )}
          </button>
          </div>
          {!isCollapsed && <div className="ph-rm-children">{kids}</div>}
        </div>
      )
    }
    const kids = n.children.map(renderNode).filter(Boolean)
    if (!matches(n) && !kids.length) return null
    return (
      <div key={n.id} className="ph-rm-item-wrap">
        <div className={`ph-rm-item ${selected.has(n.id) && selecting ? 'picked ' : ''}mark-${n.mark === ' ' ? 'todo' : n.mark === 'x' ? 'done' : n.mark === '~' ? 'doing' : n.mark === '-' ? 'drop' : 'none'}`}>
          {pickBox(openIds(n))}
          {n.mark ? (
            <button className="ph-rm-mark" onClick={() => cycle(n)} title={`${MARK_LABEL[n.mark]} — clique para avançar`}>
              {MARK_ICON[n.mark]}
            </button>
          ) : (
            <span className="ph-rm-mark">•</span>
          )}
          {n.num != null && <span className="ph-rm-num">#{n.num}</span>}
          <span className="ph-rm-text">{n.text}</span>
          {n.version && <span className="ph-tag">@{n.version}</span>}
          {n.priority && <span className={`ph-tag prio-${n.priority}`}>!{n.priority}</span>}
        </div>
        {kids.length > 0 && <div className="ph-rm-children">{kids}</div>}
      </div>
    )
  }

  return (
    <div className="ph-roadmap">
      <div className="ph-rm-toolbar">
        <div className="seg-toggle">
          <button className={`seg-btn ${mode === 'arvore' ? 'active' : ''}`} onClick={() => setMode('arvore')}>🌳 Árvore</button>
          <button className={`seg-btn ${mode === 'tabela' ? 'active' : ''}`} onClick={() => setMode('tabela')}>▦ Tabela</button>
        </div>
        <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
          <option value="todos">Todos</option>
          <option value="abertos">Abertos</option>
          <option value="~">Em andamento</option>
          <option value="x">Feitos</option>
          <option value="-">Descartados</option>
        </select>
        {versions.length > 0 && (
          <select value={version} onChange={(e) => setVersion(e.target.value)}>
            <option value="">Todas as versões</option>
            {versions.map((v) => <option key={v} value={v}>@{v}</option>)}
          </select>
        )}
        <span className="ph-muted">
          {stats.done}/{stats.total} feitos · {stats.doing} em andamento · {pct}%
        </span>
        {onDelegate && (
          <button
            className={`btn btn-sm ${selecting ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => {
              setSelecting(!selecting)
              if (selecting) setSelected(new Set())
            }}
            title="Selecionar itens ou blocos (área/funcionalidade) para delegar ao Claude de uma vez"
          >
            {selecting ? '✕ Sair da seleção' : '☑ Selecionar p/ delegar'}
          </button>
        )}
        {unnumbered > 0 && (
          <button className="btn btn-secondary btn-sm" onClick={numberItems} title="Grava #N (maior número + 1) nos itens sem número, sem mexer nos já numerados">
            # Numerar {unnumbered}
          </button>
        )}
        <button className="btn btn-secondary btn-sm" onClick={load} title={data.path ?? ''}>↻</button>
      </div>
      <div className="ph-progress big"><div style={{ width: `${pct}%` }} /></div>
      {error && <div className="ph-error">{error}</div>}
      {selecting && (
        <div className="ph-rm-selbar">
          <span>
            {picked.length ? <><strong>{picked.length}</strong> {picked.length === 1 ? 'item' : 'itens'}: {picked.map((r) => (r.node.num != null ? `#${r.node.num}` : '•')).join(' ')}</> : 'Marque itens ou blocos abertos (a fazer / em andamento).'}
          </span>
          <span style={{ flex: 1 }} />
          {picked.length > 0 && <button className="btn btn-secondary btn-sm" onClick={() => setSelected(new Set())}>Limpar</button>}
          <button
            className="btn btn-primary btn-sm"
            disabled={!picked.length}
            onClick={delegate}
            title="O Claude monta um prompt (em paralelo, um commit por item) que abre no Prompt Runner para você revisar e enviar"
          >
            🤖 Delegar {picked.length || ''}
          </button>
        </div>
      )}

      {mode === 'arvore' ? (
        <div className="ph-rm-tree">{tree.map(renderNode)}</div>
      ) : (
        <div className="ph-table-wrap">
          <table className="ph-table">
            <thead>
              <tr>
                {selecting && <th />}
                <th>Status</th>
                <th>#</th>
                <th>Item</th>
                <th>Área</th>
                <th>Funcionalidade</th>
                <th>Versão</th>
                <th>Prior.</th>
              </tr>
            </thead>
            <tbody>
              {rows.filter((r) => r.node.mark && matches(r.node)).map((r) => (
                <tr key={r.node.id}>
                  {selecting && <td>{pickBox(isOpenItem(r.node) ? [r.node.id] : [])}</td>}
                  <td>
                    <select value={r.node.mark ?? ' '} onChange={(e) => cycle(r.node, e.target.value as RoadmapMark)}>
                      {(Object.keys(MARK_LABEL) as RoadmapMark[]).map((m) => (
                        <option key={m} value={m}>{MARK_ICON[m]} {MARK_LABEL[m]}</option>
                      ))}
                    </select>
                  </td>
                  <td className="ph-rm-num">{r.node.num != null ? `#${r.node.num}` : ''}</td>
                  <td>{r.parent ? <span className="ph-muted">{r.parent} › </span> : null}{r.node.text}</td>
                  <td>{r.area}</td>
                  <td>{r.feature}</td>
                  <td>{r.node.version ? `@${r.node.version}` : ''}</td>
                  <td>{r.node.priority ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
