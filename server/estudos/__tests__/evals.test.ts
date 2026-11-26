import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { MASTERCLASS_BACKEND, MASTERCLASS_MANDARIM, pacoteMandarim } from './fixtures'
import { rubricaEditorial, rubricaMasterclass, rubricaSubtopicos, type Masterclass } from '../evals/rubricas'
import { CASO_EDITORIAL } from '../evals/casos'

/** As rubricas dos evals funcionam (sem tokens): aprovam o bom e reprovam o ruim. */
describe('rubricas dos evals', () => {
  it('masterclass específica passa; a mesma com assunto trocado (genérica) reprova especificidade', () => {
    const ok = rubricaMasterclass(MASTERCLASS_BACKEND as unknown as Masterclass, ['unity', 'jogo', 'jogador', 'partida', 'arquitetura'], { min: 2, max: 20 })
    assert.ok(ok.every((c) => c.ok), JSON.stringify(ok.filter((c) => !c.ok)))
    const generica = JSON.parse(JSON.stringify(MASTERCLASS_BACKEND).replace(/Unity|jogo|jogador(es)?|partida|tiro|host/gi, 'sistema'))
    const r = rubricaMasterclass(generica, ['unity', 'jogo', 'jogador', 'partida', 'arquitetura'], { min: 2, max: 20 })
    assert.equal(r.find((c) => c.criterio.startsWith('conteúdo específico'))!.ok, false)
  })

  it('dependência fora de ordem reprova; escala distingue trilha curta de formação longa', () => {
    const ruim = JSON.parse(JSON.stringify(MASTERCLASS_BACKEND))
    ruim.partes[0].modulos[0].prerequisitos = ['Predição do cliente e reconciliação']
    assert.equal(rubricaMasterclass(ruim, ['unity'], { min: 1, max: 20 })[0].ok, false)
    const curto = rubricaMasterclass(MASTERCLASS_MANDARIM as unknown as Masterclass, ['remarcar', '星期'], { min: 2, max: 8 })
    assert.ok(curto.find((c) => c.criterio.startsWith('escala'))!.ok)
  })

  it('editorial: trecho inexistente ou reescrita grande reprovam; mínima passa', () => {
    const boa = rubricaEditorial([{ trecho: 'mais lento q udp sempre', sugestao: 'mais lento q udp quando há perda', substituicao: 'mais lento q udp quando há perda', tipo: 'ressalva' }], CASO_EDITORIAL.nota, 3)
    assert.ok(boa.every((c) => c.ok))
    const ruim = rubricaEditorial([{ trecho: 'texto que não existe', sugestao: 'x', substituicao: null, tipo: 'acrescimo' }], CASO_EDITORIAL.nota, 3)
    assert.equal(ruim[0].ok, false)
    const reescrita = rubricaEditorial([{ trecho: CASO_EDITORIAL.nota, sugestao: 'tudo novo', substituicao: 'tudo novo', tipo: 'ajuste' }], CASO_EDITORIAL.nota, 3)
    assert.equal(reescrita[1].ok, false)
  })

  it('subtópico: pai certo passa; pai errado reprova; zero itens quando esperado', () => {
    const itens = (pacoteMandarim(2).subtopicos as { itens: { parentId: number; titulo: string }[] }).itens
    assert.ok(rubricaSubtopicos(itens, { parentId: 2, termo: 'semana' }).every((c) => c.ok))
    assert.equal(rubricaSubtopicos(itens, { parentId: 3, termo: 'semana' })[0].ok, false)
    assert.equal(rubricaSubtopicos(itens, { parentId: 2, termo: 'semana' }, ['Dias da semana (星期)'])[1].ok, false)
    assert.ok(rubricaSubtopicos([], null)[0].ok)
  })
})
