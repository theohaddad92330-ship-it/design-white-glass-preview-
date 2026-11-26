import { describe, expect, it } from 'vitest'
import { NO_ACCOUNT_SCOPE, PORTFOLIO_SCOPE, type ChatScope } from './chat-scope'
import {
  SCOPE_TRAIL_MAX,
  originStep,
  previousStep,
  pushStep,
  returnToPrevious,
  scopeChangeOf,
  type ScopeStep,
} from './scope-trail'

/**
 * #1951.17 / #1951.18 / #1951.21 — CE QUE LA PILE DES PÉRIMÈTRES PROMET.
 *
 * Trois promesses du retour, et une seule structure les tient : on ne change
 * jamais de périmètre en silence, on ne perd jamais celui d'où l'on vient, et
 * on y revient d'un geste — avec le FIL qu'on y avait ouvert, pas seulement le
 * périmètre.
 */

const ACME: ChatScope = { kind: 'account', accountId: 'a-acme' }
const SNCF: ChatScope = { kind: 'account', accountId: 'a-sncf' }
const SOPHIE: ChatScope = { kind: 'contact', contactId: 'c-sophie', label: 'Sophie Martin' }

const step = (scope: ChatScope, conversationId: string): ScopeStep => ({ scope, conversationId })

describe('pushStep — la pile des périmètres visités', () => {
  it('garde le périmètre d’où l’on vient, avec SON fil', () => {
    const trail = pushStep(pushStep([], step(ACME, 'c1')), step(SOPHIE, 'c2'))
    expect(trail).toHaveLength(2)
    expect(previousStep(trail)).toEqual(step(ACME, 'c1'))
  })

  it('ne réempile pas le même périmètre — rouvrir la modale sans rien changer n’est pas un changement', () => {
    const trail = pushStep(pushStep([], step(ACME, 'c1')), step({ kind: 'account', accountId: 'a-acme' }, 'c2'))
    expect(trail).toHaveLength(1)
    // ⚠️ Le fil du pas courant est RAFRAÎCHI : on est revenu sur le même
    // périmètre, mais dans le fil qu'on vient d'ouvrir.
    expect(trail[0]).toEqual(step(ACME, 'c2'))
  })

  it('un libellé qui a changé ne fait pas un autre périmètre', () => {
    const renamed: ChatScope = { kind: 'contact', contactId: 'c-sophie', label: 'Sophie Martin-Durand' }
    expect(pushStep(pushStep([], step(SOPHIE, 'c1')), step(renamed, 'c2'))).toHaveLength(1)
  })

  it('le périmètre d’ORIGINE ne tombe jamais de la pile — c’est le milieu qui cède', () => {
    let trail = pushStep([], step(ACME, 'origine'))
    for (let i = 0; i < SCOPE_TRAIL_MAX + 5; i += 1) {
      trail = pushStep(trail, step({ kind: 'account', accountId: `a-${i}` }, `c-${i}`))
    }
    expect(trail).toHaveLength(SCOPE_TRAIL_MAX)
    expect(originStep(trail)).toEqual(step(ACME, 'origine'))
    // Le pas COURANT est le dernier visité, jamais rogné non plus.
    expect(trail.at(-1)?.conversationId).toBe(`c-${SCOPE_TRAIL_MAX + 4}`)
  })
})

describe('previousStep / returnToPrevious — revenir au périmètre précédent', () => {
  it('rien à proposer quand on n’a visité qu’un périmètre', () => {
    expect(previousStep([])).toBeNull()
    expect(previousStep(pushStep([], step(PORTFOLIO_SCOPE, 'c1')))).toBeNull()
    expect(returnToPrevious(pushStep([], step(PORTFOLIO_SCOPE, 'c1')))).toBeNull()
  })

  it('revient au pas précédent AVEC son fil, et le retire de la pile', () => {
    const trail = pushStep(pushStep([], step(ACME, 'c1')), step(SOPHIE, 'c2'))
    const back = returnToPrevious(trail)
    expect(back?.step).toEqual(step(ACME, 'c1'))
    expect(back?.trail).toEqual([step(ACME, 'c1')])
  })

  it('deux retours successifs remontent la pile jusqu’à l’origine, puis s’arrêtent', () => {
    let trail = pushStep(pushStep(pushStep([], step(ACME, 'c1')), step(SNCF, 'c2')), step(SOPHIE, 'c3'))
    const first = returnToPrevious(trail)
    expect(first?.step.conversationId).toBe('c2')
    trail = first?.trail ?? []
    const second = returnToPrevious(trail)
    expect(second?.step.conversationId).toBe('c1')
    expect(returnToPrevious(second?.trail ?? [])).toBeNull()
  })
})

describe('scopeChangeOf — jamais un changement de périmètre en silence (#1951.17)', () => {
  it('annonce le changement, et nomme les DEUX périmètres', () => {
    expect(scopeChangeOf(ACME, SNCF)).toEqual({ from: ACME, to: SNCF })
  })

  it('ne dit rien quand rien n’a changé — une annonce sans changement est du bruit', () => {
    expect(scopeChangeOf(ACME, { kind: 'account', accountId: 'a-acme' })).toBeNull()
    expect(scopeChangeOf(PORTFOLIO_SCOPE, PORTFOLIO_SCOPE)).toBeNull()
  })

  it('un passage du portefeuille à « sans dossier » est un changement — l’incident #1779 est là', () => {
    // Les deux rendent `accountId === null` côté API ; ce qu’ils PROMETTENT à la
    // personne diffère, et c’est cette promesse-là qu’on avait laissée muette.
    expect(scopeChangeOf(PORTFOLIO_SCOPE, NO_ACCOUNT_SCOPE)).toEqual({ from: PORTFOLIO_SCOPE, to: NO_ACCOUNT_SCOPE })
  })
})
