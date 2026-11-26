/**
 * Rubricas pequenas e automáticas para os prompts pedagógicos (A, D, E). São heurísticas
 * deliberadamente simples: servem para pegar regressão óbvia quando alguém (você ou o Codex)
 * reescrever os textos em shared/prompts/estudos/pedagogia/textos.ts. Leitura humana continua
 * sendo o juiz final — o relatório traz a saída inteira.
 */
export interface Checagem {
  criterio: string
  ok: boolean
  detalhe: string
}

const norm = (s: string): string =>
  (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

interface Modulo {
  titulo: string
  perguntaCentral: string
  exemplo: string
  atividade: string
  perguntaDiagnostica: string
  criterioAvanco: string
  prerequisitos: string[]
}
export interface Masterclass {
  perguntas: string[]
  partes: { titulo: string; modulos: Modulo[] }[]
  workshops: { titulo: string; entrega: string }[]
  demonstracaoFinal: string
  aberturaPrimeiraAula: { primeiroPasso: string; pergunta: string }
}

/**
 * Masterclass aprovada: dependências coerentes, conteúdo específico (não genérico), primeiro passo
 * executável, perguntas respondíveis e entrega final contextual. `termos` = palavras do objetivo.
 */
export function rubricaMasterclass(m: Masterclass, termos: string[], escala: { min: number; max: number }): Checagem[] {
  const mods = m.partes.flatMap((p) => p.modulos)
  const titulos = mods.map((x) => norm(x.titulo))
  const out: Checagem[] = []
  // 1. dependências: todo pré-requisito citado é um módulo que vem ANTES
  const ruins: string[] = []
  mods.forEach((x, i) => {
    for (const pr of x.prerequisitos ?? []) {
      const j = titulos.findIndex((tt) => tt === norm(pr) || tt.includes(norm(pr)) || norm(pr).includes(tt))
      if (j < 0 || j >= i) ruins.push(`${x.titulo} ← ${pr}`)
    }
  })
  out.push({ criterio: 'dependências coerentes (pré-requisito vem antes)', ok: ruins.length === 0, detalhe: ruins.join('; ') || 'ok' })
  // 2. especificidade: maioria dos módulos cita algo do objetivo (teste "trocar o assunto no título")
  const especificos = mods.filter((x) => termos.some((tt) => norm(`${x.perguntaCentral} ${x.exemplo} ${x.atividade}`).includes(norm(tt)))).length
  out.push({ criterio: 'conteúdo específico do objetivo (≥ 60% dos módulos)', ok: mods.length > 0 && especificos / mods.length >= 0.6, detalhe: `${especificos}/${mods.length}` })
  // 3. primeiro passo executável hoje
  const pp = m.aberturaPrimeiraAula?.primeiroPasso ?? ''
  out.push({ criterio: 'primeiro passo executável (curto e concreto)', ok: pp.trim().length >= 10 && pp.length <= 400, detalhe: pp.slice(0, 120) })
  // 4. perguntas respondíveis: todo módulo tem pergunta diagnóstica e critério observável
  const semPergunta = mods.filter((x) => !x.perguntaDiagnostica?.trim() || !x.criterioAvanco?.trim()).map((x) => x.titulo)
  out.push({ criterio: 'perguntas diagnósticas e critérios observáveis', ok: semPergunta.length === 0, detalhe: semPergunta.join('; ') || 'ok' })
  // 5. entrega final contextual
  out.push({ criterio: 'entrega final ligada ao objetivo', ok: termos.some((tt) => norm(m.demonstracaoFinal).includes(norm(tt))), detalhe: m.demonstracaoFinal.slice(0, 160) })
  // 6. escala adequada à dificuldade
  out.push({ criterio: `escala ${escala.min}–${escala.max} módulos`, ok: mods.length >= escala.min && mods.length <= escala.max, detalhe: String(mods.length) })
  return out
}

export interface PropostaEditorial {
  trecho: string
  sugestao: string
  substituicao: string | null
  tipo: string
}

/** Revisão editorial aprovada: preserva o texto (trechos exatos), mudança mínima ou nenhuma. */
export function rubricaEditorial(itens: PropostaEditorial[], nota: string, maxItens: number): Checagem[] {
  const fora = itens.filter((x) => !nota.includes(x.trecho)).map((x) => x.trecho)
  const grandes = itens.filter((x) => (x.substituicao ?? x.sugestao).length > Math.max(160, x.trecho.length * 3)).map((x) => x.trecho)
  const reescritaTotal = itens.some((x) => x.trecho.length > nota.length * 0.6)
  return [
    { criterio: 'trechos citados existem exatamente na nota', ok: fora.length === 0, detalhe: fora.join(' | ') || 'ok' },
    { criterio: 'mudanças mínimas (sem reescrever)', ok: grandes.length === 0 && !reescritaTotal, detalhe: grandes.join(' | ') || 'ok' },
    { criterio: `no máximo ${maxItens} propostas`, ok: itens.length <= maxItens, detalhe: String(itens.length) }
  ]
}

export interface Subtopico {
  parentId: number | null
  titulo: string
}

/**
 * Subtópico aprovado: identifica o pai certo e não repete o que já existe. O título "esperado" é só
 * informativo — a regra E permite outra lacuna real (ou preferir uma linha na nota).
 */
export function rubricaSubtopicos(itens: Subtopico[], esperado: { parentId: number | null; termo: string } | null, existentes: string[] = []): Checagem[] {
  if (!esperado) return [{ criterio: 'zero itens quando a cobertura é suficiente', ok: itens.length === 0, detalhe: String(itens.length) }]
  const paisErrados = itens.filter((x) => x.parentId !== esperado.parentId).map((x) => `${x.titulo} → ${x.parentId}`)
  const repetidos = itens.filter((x) => existentes.some((e) => norm(e) === norm(x.titulo))).map((x) => x.titulo)
  const alvo = itens.find((x) => norm(x.titulo).includes(norm(esperado.termo)))
  return [
    { criterio: 'pai certo em todos os itens', ok: paisErrados.length === 0, detalhe: paisErrados.join('; ') || `ok (${itens.length} item/itens)` },
    { criterio: 'não repete item existente', ok: repetidos.length === 0, detalhe: repetidos.join('; ') || 'ok' },
    { criterio: `(informativo) citou "${esperado.termo}"`, ok: true, detalhe: alvo ? 'sim' : `não — sugeriu: ${itens.map((x) => x.titulo).join('; ') || 'nada'}` }
  ]
}

export interface Abertura {
  titulo?: string
  situacao?: string
  aula?: string
  primeiroPasso?: string
  pergunta?: string
}

const CJK = /[㐀-鿿]/

/**
 * Abertura que ensina: explicação antes da pergunta. Engenharia: mecanismo + exemplo com começo,
 * meio e fim + pergunta no fim. Idioma: diálogo no idioma-alvo e a minha vez no fim.
 */
export function rubricaAbertura(ab: Abertura | undefined, tipo: 'engenharia' | 'idioma'): Checagem[] {
  const aula = ab?.aula ?? ''
  const fim = aula.slice(-500)
  if (tipo === 'engenharia') {
    const passos = (aula.match(/^\s*(\d+[.)]|[-*] |\|)/gm) ?? []).length + (norm(aula).match(/\b(primeiro|depois|em seguida|entao|por fim|no fim|t ?= ?\d)/g) ?? []).length
    return [
      { criterio: 'abertura ensina antes de perguntar (≥ 900 caracteres)', ok: aula.length >= 900, detalhe: `${aula.length} caracteres` },
      { criterio: 'exemplo com começo, meio e fim (≥ 3 passos)', ok: passos >= 3, detalhe: `${passos} marcadores de sequência` },
      { criterio: 'termina numa pergunta', ok: fim.includes('?') || !!ab?.pergunta, detalhe: (ab?.pergunta ?? '').slice(0, 140) }
    ]
  }
  const falas = aula.split('\n').filter((l) => CJK.test(l)).length
  return [
    { criterio: 'abertura com diálogo no idioma-alvo (≥ 2 falas)', ok: falas >= 2, detalhe: `${falas} linhas no idioma-alvo` },
    { criterio: 'explica o suficiente sem virar aula longa (250–3500 caracteres)', ok: aula.length >= 250 && aula.length <= 3500, detalhe: `${aula.length} caracteres` },
    { criterio: 'me dá a vez no fim', ok: fim.includes('?') || fim.includes('？') || /sua vez|responda|agora voce|agora você/i.test(fim), detalhe: fim.slice(-140).replace(/\n/g, ' ') }
  ]
}

/** Turno da aula: toca cada grupo de termos e retoma a pergunta (termina perguntando). */
export function rubricaTurno(resposta: string, deve: Record<string, string[]>, extra: { citado?: string } = {}): Checagem[] {
  const r = ` ${norm(resposta)} `
  const out: Checagem[] = Object.entries(deve).map(([criterio, termos]) => {
    const achou = termos.filter((x) => r.includes(norm(x)))
    return { criterio, ok: achou.length > 0, detalhe: achou.join(', ') || 'nenhum termo' }
  })
  const fim = resposta.slice(-600)
  out.push({ criterio: 'retoma a aula com uma pergunta no fim', ok: fim.includes('?') || fim.includes('？'), detalhe: fim.slice(-160).replace(/\n/g, ' ') })
  if (extra.citado) {
    const palavras = norm(extra.citado).split(/[^a-z0-9㐀-鿿]+/).filter((w) => w.length >= 6)
    const usadas = palavras.filter((w) => r.includes(w))
    out.push({ criterio: 'responde ao detalhe citado do fim da resposta anterior', ok: usadas.length >= Math.min(2, palavras.length), detalhe: usadas.join(', ') || `nenhuma de: ${palavras.join(', ')}` })
  }
  return out
}
