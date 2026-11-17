import React, { useEffect, useState } from 'react'
import type { Project, ProjectArea, ProjectRepoInput } from '../../../types'
import { reposOf, useProjectStore, workTagsFor } from '../store/projectStore'
import { useTagStore } from '../../timetracker/store/tagStore'
import { AREAS, PRESET_COLORS, STAGES } from '../lib/constants'

interface FormState {
  name: string
  description: string
  area: ProjectArea
  stage: string
  githubRepoUrl: string
  localPath: string
  claudeCommand: string
  color: string
  businessModel: string
  pricing: string
  audience: string
  workTagId: number | null
  workTagId2: number | null
}

const fromProject = (p: Project | null): FormState => ({
  name: p?.name ?? '',
  description: p?.description ?? '',
  area: p?.area ?? 'pessoal',
  stage: p?.stage ?? 'ideia',
  githubRepoUrl: p?.githubRepoUrl ?? '',
  localPath: p?.localPath ?? '',
  claudeCommand: p?.claudeCommand ?? '',
  color: p?.color ?? '#6366f1',
  businessModel: p?.businessModel ?? '',
  pricing: p?.pricing ?? '',
  audience: p?.audience ?? '',
  workTagId: p?.workTagId ?? null,
  workTagId2: p?.workTagId2 ?? null
})

/** Criar (vai para a incubadora) ou editar os dados cadastrais de um projeto. */
export function ProjectForm({ project, onClose, onCreated }: { project: Project | null; onClose: () => void; onCreated?: (p: Project) => void }): React.ReactElement {
  const { create, patch, setRepos } = useProjectStore()
  const storeRepos = useProjectStore((s) => s.repos)
  const [form, setForm] = useState<FormState>(fromProject(project))
  const initialRepos = (): ProjectRepoInput[] =>
    project ? reposOf(project.id, storeRepos).map((r) => ({ name: r.name, path: r.path, githubRepoUrl: r.githubRepoUrl })) : []
  const [repos, setReposState] = useState<ProjectRepoInput[]>(initialRepos)
  // sugestões da detecção (nada entra na lista sem você confirmar)
  const [detected, setDetected] = useState<ProjectRepoInput[] | null>(null)
  const [detectMsg, setDetectMsg] = useState('')
  const [advanced, setAdvanced] = useState(!!project)
  const set = <K extends keyof FormState>(k: K, v: FormState[K]): void => setForm({ ...form, [k]: v })
  const { tags, refreshTags } = useTagStore()
  useEffect(() => {
    if (!tags.length) refreshTags()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // o que o "Trabalhar nisso" usaria sem configuração (tag vinculada ou de mesmo nome)
  const autoTag = workTagsFor({ ...(project ?? ({} as Project)), id: project?.id ?? -1, name: form.name, workTagId: null, workTagId2: null }, tags).primary

  const cleanRepos = (): ProjectRepoInput[] =>
    repos
      .map((r) => ({ name: r.name.trim(), path: r.path.trim(), githubRepoUrl: r.githubRepoUrl?.trim() || null }))
      .filter((r) => r.path)
  const reposChanged = (): boolean => JSON.stringify(cleanRepos()) !== JSON.stringify(initialRepos())

  async function detect(): Promise<void> {
    setDetectMsg('')
    setDetected(null)
    if (!form.localPath.trim()) {
      setDetectMsg('Preencha o caminho local (a pasta raiz) primeiro.')
      return
    }
    try {
      const r = await window.api.projects.detectRepos(form.localPath.trim())
      const fresh = r.repos.filter((d) => !repos.some((x) => x.path.trim() === d.path))
      if (!r.repos.length) setDetectMsg(r.rootIsRepo ? 'Esta pasta já é um repositório: o projeto é de 1 repo, não precisa listar.' : 'Nenhum repositório encontrado nesta pasta.')
      else if (!fresh.length) setDetectMsg('Todos os repositórios desta pasta já estão na lista.')
      else setDetected(fresh)
    } catch (e) {
      setDetectMsg(e instanceof Error ? e.message : String(e))
    }
  }

  const setRepo = (i: number, k: keyof ProjectRepoInput, v: string): void => setReposState(repos.map((r, j) => (j === i ? { ...r, [k]: v } : r)))

  async function submit(): Promise<void> {
    if (!form.name.trim()) return
    if (project) {
      await patch(project.id, { ...form, name: form.name.trim() })
      if (reposChanged()) await setRepos(project.id, cleanRepos())
    } else {
      const p = await create(
        form.name.trim(),
        form.description.trim() || null,
        form.githubRepoUrl.trim() || null,
        form.color,
        form.claudeCommand.trim() || null,
        form.localPath.trim() || null,
        form.stage,
        form.businessModel.trim() || null,
        form.pricing.trim() || null,
        form.audience.trim() || null
      )
      const extra = {
        ...(form.area !== 'pessoal' ? { area: form.area } : {}),
        ...(form.workTagId != null ? { workTagId: form.workTagId, workTagId2: form.workTagId2 } : {})
      }
      if (Object.keys(extra).length) await patch(p.id, extra)
      if (cleanRepos().length) await setRepos(p.id, cleanRepos())
      onCreated?.(p)
    }
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal ph-modal ph-modal-wide" onClick={(e) => e.stopPropagation()}>
        <h2>{project ? `Editar ${project.name}` : '🥚 Novo projeto (entra na incubadora)'}</h2>
        <div className="ph-form">
          <input placeholder="Nome" value={form.name} onChange={(e) => set('name', e.target.value)} autoFocus onKeyDown={(e) => e.key === 'Enter' && !advanced && submit()} />
          <input placeholder="Descrição curta (opcional)" value={form.description} onChange={(e) => set('description', e.target.value)} />
          <div className="ph-row">
            <div className="ph-seg">
              {AREAS.map((a) => (
                <button key={a.key} className={form.area === a.key ? 'active' : ''} onClick={() => set('area', a.key)}>
                  {a.label}
                </button>
              ))}
            </div>
            <select value={form.stage} onChange={(e) => set('stage', e.target.value)} title="Estágio (maturidade)">
              {STAGES.map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
          </div>
          <div className="ph-worktags">
            <span className="ph-worktags-label" title="Tags que o timer recebe quando você clica em ▶ Trabalhar nisso">⏱ Tags ao trabalhar</span>
            <select value={form.workTagId ?? ''} onChange={(e) => set('workTagId', e.target.value ? Number(e.target.value) : null)}>
              <option value="">Automático{autoTag ? ` (${autoTag.name})` : ' (sem tag)'}</option>
              {tags.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <select
              value={form.workTagId2 ?? ''}
              onChange={(e) => set('workTagId2', e.target.value ? Number(e.target.value) : null)}
              title="Tag secundária (opcional)"
            >
              <option value="">Sem tag secundária</option>
              {tags
                .filter((t) => t.id !== (form.workTagId ?? autoTag?.id))
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </select>
          </div>
          <button className="ph-linkbtn" onClick={() => setAdvanced((v) => !v)}>
            {advanced ? '▾' : '▸'} Repositório, pasta local, negócio, cor
          </button>
          {advanced && (
            <>
              {repos.length === 0 && (
                <input placeholder="GitHub repo URL" value={form.githubRepoUrl} onChange={(e) => set('githubRepoUrl', e.target.value)} />
              )}
              <input
                placeholder={
                  repos.length
                    ? 'Pasta raiz do workspace (ex: ~/work) — CLAUDE.md, skills e ROADMAP_RICKOS.md'
                    : 'Caminho local (ex: ~/Projects/app) — commits, branches e ROADMAP_RICKOS.md'
                }
                value={form.localPath}
                onChange={(e) => set('localPath', e.target.value)}
              />
              <div className="ph-repos">
                <div className="ph-repos-head">
                  <span className="ph-worktags-label" title="Pasta raiz com vários repositórios (front, back, infra…): o Claude roda na raiz e commits, branches, issues e mudanças juntam todos">
                    📦 Repositórios {repos.length ? `(${repos.length})` : '— só se a pasta for um workspace com vários repos'}
                  </span>
                  <button className="ph-linkbtn" onClick={detect}>🔎 Detectar na pasta</button>
                  <button className="ph-linkbtn" onClick={() => setReposState([...repos, { name: '', path: '', githubRepoUrl: '' }])}>＋ Adicionar</button>
                </div>
                {detectMsg && <div className="ph-repos-hint">{detectMsg}</div>}
                {detected && (
                  <div className="ph-repos-suggest">
                    <span>Encontrei {detected.length} repositório(s):</span>
                    {detected.map((d) => (
                      <button
                        key={d.path}
                        className="ph-chip-btn"
                        title={d.githubRepoUrl ?? 'sem remote do GitHub'}
                        onClick={() => {
                          setReposState([...repos, d])
                          setDetected(detected.filter((x) => x.path !== d.path).length ? detected.filter((x) => x.path !== d.path) : null)
                        }}
                      >
                        ＋ {d.path}
                      </button>
                    ))}
                    <button
                      className="ph-linkbtn"
                      onClick={() => {
                        setReposState([...repos, ...detected])
                        setDetected(null)
                      }}
                    >
                      Adicionar todos
                    </button>
                  </div>
                )}
                {repos.map((r, i) => (
                  <div key={i} className="ph-repo-row">
                    <input placeholder="Nome (front)" value={r.name} onChange={(e) => setRepo(i, 'name', e.target.value)} />
                    <input placeholder="Subpasta (front)" value={r.path} onChange={(e) => setRepo(i, 'path', e.target.value)} />
                    <input placeholder="GitHub repo URL" value={r.githubRepoUrl ?? ''} onChange={(e) => setRepo(i, 'githubRepoUrl', e.target.value)} />
                    <button className="ph-linkbtn" aria-label={`Remover ${r.name || r.path}`} title="Remover da lista" onClick={() => setReposState(repos.filter((_, j) => j !== i))}>
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              <input placeholder="Comando do Claude (opcional — padrão global)" value={form.claudeCommand} onChange={(e) => set('claudeCommand', e.target.value)} />
              <div className="ph-row">
                <input placeholder="Modelo de receita" value={form.businessModel} onChange={(e) => set('businessModel', e.target.value)} />
                <input placeholder="Preço" value={form.pricing} onChange={(e) => set('pricing', e.target.value)} />
                <input placeholder="Público-alvo" value={form.audience} onChange={(e) => set('audience', e.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    aria-label={`Cor ${c}`}
                    onClick={() => set('color', c)}
                    className="ph-swatch"
                    style={{ background: c, outline: form.color === c ? '2px solid var(--text-primary)' : 'none' }}
                  />
                ))}
              </div>
            </>
          )}
        </div>
        <div className="modal-actions">
          <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary btn-sm" onClick={submit}>{project ? 'Salvar' : 'Criar'}</button>
        </div>
      </div>
    </div>
  )
}
