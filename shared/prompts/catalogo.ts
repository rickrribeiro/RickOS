/**
 * Registro de TODAS as chamadas de IA do rickOS (definições criadas com `definirChamada`).
 * Alimenta o gateway (server/ia/gateway.ts) e Configurações → IA → "Onde a IA é usada".
 *
 * 🚨 Chamada nova = definição em shared/prompts/<módulo>/ + entrada aqui + nome em
 * `settings.iaChamada.<id>` (3 idiomas) + MANIFESTO do guardrail (server/ia/__tests__).
 */
import type { Chamada, DefinicaoChamada } from './definicao'
import { assistenteChecklistViagem, assistentePlanejarSemana, assistentePriorizar, assistenteResumoSemanal, assistenteRevisarInbox, assistenteRoteiroViagem } from './assistente/acoesRapidas'
import { assistenteLivre } from './assistente/livre'
import { automacoesAgendado } from './automacoes/agendado'
import { braindumpOrganizar } from './braindump/organizar'
import { crmRetomarContato } from './crm/retomarContato'
import { estudosFlashcards } from './estudos/flashcards'
import { estudosQuiz } from './estudos/quiz'
import { estudosMasterclass } from './estudos/masterclass'
import { estudosAula } from './estudos/aula'
import { estudosPacoteNo } from './estudos/pacoteNo'
import { estudosSecaoNo } from './estudos/secaoNo'
import { estudosRevisaoEditorial } from './estudos/revisaoEditorial'
import { estudosSubtopicos } from './estudos/subtopicos'
import { githubCriarIssue } from './github/criarIssue'
import { homeBriefing } from './home/briefingMatinal'
import { homeRevisaoSemanal } from './home/revisaoSemanal'
import { inboxClassificar } from './inbox/classificarProjetos'
import { inboxOcr } from './inbox/ocrImagem'
import { memoriaAnalise } from './memoria/analise'
import { memoriaEntrevista } from './memoria/entrevista'
import { memoriaExtracaoAgente, memoriaExtracaoTexto } from './memoria/extracao'
import { memoriaLacunas } from './memoria/lacunas'
import { mensagensResumo } from './mensagens/resumo'
import { mensagensSugerir } from './mensagens/sugerirRespostas'
import { noticiasResumo } from './noticias/resumoCategoria'
import { passagensAnaliseOfertas } from './passagens/analiseOfertas'
import { passagensSkyscanner } from './passagens/consultaSkyscanner'
import { passagensCriarMonitor } from './passagens/criarMonitor'
import { passagensImportarAlerta } from './passagens/importarAlerta'
import { projetosChangelog } from './projetos/changelog'
import { projetosContinuarBranch } from './projetos/continuarBranch'
import { projetosDelegacao } from './projetos/delegacao'
import { projetosDelegarRoadmap } from './projetos/delegarRoadmap'
import { projetosMontarDelegacao } from './projetos/montarPromptDelegacao'
import { projetosOndePareiProjeto } from './projetos/ondePareiProjeto'
import { projetosOndePareiSessao } from './projetos/ondePareiSessao'
import { projetosOndePareiTimer } from './projetos/ondePareiTimer'
import { projetosPlano } from './projetos/plano'
import { projetosProgresso } from './projetos/resumoProgresso'
import { projetosProximaAcao } from './projetos/proximaAcao'
import { projetosRetrospectiva } from './projetos/retrospectiva'
import { promptRunnerMensagemCommit } from './promptRunner/mensagemCommit'
import { promptRunnerConversa } from './promptRunner/sistemaConversa'
import { viagensHospedagem } from './viagens/analiseHospedagem'

export type { ConfigIa, MotorIa, ModuloIa, PromptMontado, PromptSobrescrito } from './definicao'

/** id → definição (a ordem é a da tela). */
export const DEFINICOES = {
  'assistente.livre': assistenteLivre,
  'assistente.priorizar': assistentePriorizar,
  'assistente.revisarInbox': assistenteRevisarInbox,
  'assistente.planejarSemana': assistentePlanejarSemana,
  'assistente.roteiroViagem': assistenteRoteiroViagem,
  'assistente.resumoSemanal': assistenteResumoSemanal,
  'assistente.checklistViagem': assistenteChecklistViagem,
  'promptRunner.conversa': promptRunnerConversa,
  'promptRunner.mensagemCommit': promptRunnerMensagemCommit,
  'automacoes.agendado': automacoesAgendado,
  'home.briefing': homeBriefing,
  'home.revisaoSemanal': homeRevisaoSemanal,
  'inbox.ocr': inboxOcr,
  'inbox.classificar': inboxClassificar,
  'braindump.organizar': braindumpOrganizar,
  'estudos.flashcards': estudosFlashcards,
  'estudos.quiz': estudosQuiz,
  'estudos.masterclass': estudosMasterclass,
  'estudos.aula': estudosAula,
  'estudos.pacoteNo': estudosPacoteNo,
  'estudos.secaoNo': estudosSecaoNo,
  'estudos.revisaoEditorial': estudosRevisaoEditorial,
  'estudos.subtopicos': estudosSubtopicos,
  'projetos.plano': projetosPlano,
  'projetos.proximaAcao': projetosProximaAcao,
  'projetos.ondePareiProjeto': projetosOndePareiProjeto,
  'projetos.ondePareiTimer': projetosOndePareiTimer,
  'projetos.ondePareiSessao': projetosOndePareiSessao,
  'projetos.retrospectiva': projetosRetrospectiva,
  'projetos.progresso': projetosProgresso,
  'projetos.changelog': projetosChangelog,
  'projetos.delegacao': projetosDelegacao,
  'projetos.montarDelegacao': projetosMontarDelegacao,
  'projetos.delegarRoadmap': projetosDelegarRoadmap,
  'projetos.continuarBranch': projetosContinuarBranch,
  'github.criarIssue': githubCriarIssue,
  'mensagens.sugerir': mensagensSugerir,
  'mensagens.resumo': mensagensResumo,
  'memoria.extracaoTexto': memoriaExtracaoTexto,
  'memoria.extracaoAgente': memoriaExtracaoAgente,
  'memoria.analise': memoriaAnalise,
  'memoria.lacunas': memoriaLacunas,
  'memoria.entrevista': memoriaEntrevista,
  'passagens.criarMonitor': passagensCriarMonitor,
  'passagens.importarAlerta': passagensImportarAlerta,
  'passagens.analiseOfertas': passagensAnaliseOfertas,
  'passagens.skyscanner': passagensSkyscanner,
  'viagens.hospedagem': viagensHospedagem,
  'crm.retomarContato': crmRetomarContato,
  'noticias.resumo': noticiasResumo
} as const

export type IdChamadaIa = keyof typeof DEFINICOES

/** Parâmetros (dados do chamador) de uma chamada. */
export type ParamsDe<K extends IdChamadaIa> = K extends IdChamadaIa ? ((typeof DEFINICOES)[K] extends DefinicaoChamada<infer P> ? P : never) : never

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ChamadaIa = Chamada<any> & { id: IdChamadaIa }

export const CATALOGO_IA: ChamadaIa[] = Object.values(DEFINICOES) as ChamadaIa[]

export function definicao<K extends IdChamadaIa>(id: K): Chamada<ParamsDe<K>> {
  const d = DEFINICOES[id] as unknown as Chamada<ParamsDe<K>> | undefined
  if (!d) throw new Error(`Chamada de IA desconhecida: ${id}`)
  return d
}

export function ehIdChamada(id: string): id is IdChamadaIa {
  return Object.prototype.hasOwnProperty.call(DEFINICOES, id)
}

/** Prompt de exemplo (system prompt primeiro, quando existe). */
export function exemploMontado(c: ChamadaIa, sobrescrito?: { template: string | null; sistema: string | null } | null): string {
  const m = c.montar(c.exemplo, sobrescrito)
  return m.sistema ? `━━ SYSTEM PROMPT ━━\n${m.sistema}\n\n━━ PROMPT ━━\n${m.prompt}` : m.prompt
}
