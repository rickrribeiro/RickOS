import { create } from 'zustand'
import { NextActionSize, Project, ProjectCycle, ProjectDelegation, ProjectMilestone, ProjectOverview, ProjectPatch, ProjectRepo, ProjectRepoInput, ProjectStatus, ProjectStatusPayload, Tag } from '../../../types'
import { useTaskStore } from '../../timetracker/store/taskStore'
import { useTagStore } from '../../timetracker/store/tagStore'

interface ProjectState {
  projects: Project[]
  /** Repositórios dos projetos workspace (pasta raiz com vários repos). */
  repos: ProjectRepo[]
  /** Substitui a lista de repositórios do projeto (vazia = projeto de 1 repo). */
  setRepos: (projectId: number, repos: ProjectRepoInput[]) => Promise<void>
  overview: Record<number, ProjectOverview>
  milestones: ProjectMilestone[]
  cycles: ProjectCycle[]
  delegations: ProjectDelegation[]
  loadingOverview: boolean
  refreshDelegations: () => Promise<void>
  refresh: () => Promise<void>
  refreshAll: () => Promise<void>
  refreshOverview: () => Promise<void>
  refreshMilestones: () => Promise<void>
  refreshCycles: () => Promise<void>
  create: (
    name: string,
    description: string | null,
    githubRepoUrl: string | null,
    color: string,
    claudeCommand: string | null,
    localPath: string | null,
    stage: string,
    businessModel: string | null,
    pricing: string | null,
    audience: string | null
  ) => Promise<Project>
  update: (project: Project) => Promise<void>
  patch: (id: number, fields: ProjectPatch) => Promise<Project>
  setStatus: (id: number, status: ProjectStatus, payload?: ProjectStatusPayload) => Promise<void>
  completeNextAction: (id: number, next: string | null, size?: NextActionSize | null, todoId?: number | null) => Promise<void>
  setStage: (id: number, stage: string) => Promise<void>
  remove: (id: number) => Promise<void>
  /** "Trabalhar nisso": inicia o timer vinculado ao projeto. */
  startWorking: (project: Project, title?: string) => Promise<void>
}

const norm = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

/**
 * Tags do timer ao "Trabalhar nisso": as configuradas no projeto → a tag vinculada ao
 * projeto → a tag com o mesmo nome do projeto → nenhuma. ("Work" não é mais o padrão:
 * só entra nos projetos em que você a configurar.)
 */
export function workTagsFor(project: Project, tags: Tag[]): { primary: Tag | null; secondary: Tag | null; auto: boolean } {
  const byId = (id: number | null | undefined): Tag | null => (id != null ? tags.find((t) => t.id === id) ?? null : null)
  const configured = byId(project.workTagId)
  if (configured) {
    const second = byId(project.workTagId2)
    return { primary: configured, secondary: second && second.id !== configured.id ? second : null, auto: false }
  }
  const linked = tags.find((t) => t.projectId === project.id) ?? null
  const named = linked ?? tags.find((t) => norm(t.name) === norm(project.name)) ?? null
  return { primary: named, secondary: byId(project.workTagId2), auto: true }
}

/** Repositórios cadastrados de um projeto (vazio = projeto simples, de 1 repo). */
export function reposOf(projectId: number, repos: ProjectRepo[]): ProjectRepo[] {
  return repos.filter((r) => r.projectId === projectId)
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  repos: [],
  overview: {},
  milestones: [],
  cycles: [],
  delegations: [],
  loadingOverview: false,
  refreshDelegations: async () => set({ delegations: await window.api.delegations.getAll() }),

  refresh: async () => {
    const [projects, repos] = await Promise.all([window.api.projects.getAll(), window.api.projects.repos()])
    set({ projects, repos })
  },

  setRepos: async (projectId, list) => {
    const saved = await window.api.projects.setRepos(projectId, list)
    set({ repos: [...get().repos.filter((r) => r.projectId !== projectId), ...saved] })
    void get().refreshOverview()
  },

  refreshAll: async () => {
    await Promise.all([get().refresh(), get().refreshMilestones(), get().refreshCycles(), get().refreshOverview(), get().refreshDelegations()])
  },

  refreshOverview: async () => {
    set({ loadingOverview: true })
    try {
      const list = await window.api.projects.overview()
      const overview: Record<number, ProjectOverview> = {}
      for (const o of list) overview[o.projectId] = o
      set({ overview })
    } finally {
      set({ loadingOverview: false })
    }
  },

  refreshMilestones: async () => set({ milestones: await window.api.milestones.getAll() }),
  refreshCycles: async () => set({ cycles: await window.api.cycles.getAll() }),

  create: async (name, description, githubRepoUrl, color, claudeCommand, localPath, stage, businessModel, pricing, audience) => {
    const p = await window.api.projects.create(name, description, githubRepoUrl, color, claudeCommand, localPath, stage, businessModel, pricing, audience)
    await get().refresh()
    void get().refreshOverview()
    return p
  },

  update: async (project) => {
    await window.api.projects.update(
      project.id,
      project.name,
      project.description,
      project.githubRepoUrl,
      project.color,
      project.archived,
      project.claudeCommand,
      project.localPath,
      project.stage,
      project.businessModel,
      project.pricing,
      project.audience
    )
    await get().refresh()
  },

  patch: async (id, fields) => {
    // otimista: a UI reflete na hora
    set({ projects: get().projects.map((p) => (p.id === id ? ({ ...p, ...fields } as Project) : p)) })
    const p = await window.api.projects.patch(id, fields)
    set({ projects: get().projects.map((x) => (x.id === id ? p : x)) })
    void get().refreshOverview()
    return p
  },

  setStatus: async (id, status, payload) => {
    const p = await window.api.projects.setStatus(id, status, payload)
    set({ projects: get().projects.map((x) => (x.id === id ? p : x)) })
    void get().refreshOverview()
  },

  completeNextAction: async (id, next, size, todoId) => {
    const p = await window.api.projects.completeNextAction(id, next, size ?? null, todoId ?? null)
    set({ projects: get().projects.map((x) => (x.id === id ? p : x)) })
    void get().refreshOverview()
  },

  setStage: async (id, stage) => {
    set({ projects: get().projects.map((p) => (p.id === id ? { ...p, stage } : p)) })
    await window.api.projects.setStage(id, stage)
    await get().refresh()
  },

  remove: async (id) => {
    await window.api.projects.delete(id)
    await get().refresh()
  },

  startWorking: async (project, title) => {
    // sempre relê: a tag pode ter sido criada/vinculada em outro aparelho
    await useTagStore
      .getState()
      .refreshTags()
      .catch(() => {
        // sem rede: usa o que já está carregado
      })
    const tags = useTagStore.getState().tags
    const { primary, secondary } = workTagsFor(project, tags)
    await useTaskStore.getState().startTask(title?.trim() || project.nextAction || project.name, primary?.id ?? null, secondary?.id ?? null, null, project.id)
    void get().refreshOverview()
  }
}))
