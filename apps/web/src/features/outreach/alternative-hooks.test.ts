import { describe, expect, it } from 'vitest'
import { alternativeHooksFor } from './alternative-hooks'

// #3419.3 — « Autres accroches » : la proposition du moteur (consigne « accroche alternative »).
describe('alternativeHooksFor (#3419.3)', () => {
  const current = 'Bonjour Marie,\n\nVotre levée récente.\n\nUn mot sur l’audit SRE.'
  const revised = 'Bonjour Marie,\n\nVotre nouvelle direction data.\n\nUn mot sur l’audit SRE.'

  it('une proposition : le message révisé, la raison du moteur, et la seule ouverture nouvelle', () => {
    expect(alternativeHooksFor({ body: revised, rationale: 'nouvelle direction data' }, current)).toEqual([
      { text: revised, anchor: 'nouvelle direction data', opening: 'Votre nouvelle direction data.' },
    ])
  })

  it('sans raison donnée : pas d’ancrage inventé', () => {
    expect(alternativeHooksFor({ body: revised }, current)[0]?.anchor).toBeNull()
  })

  it('texte vide ou identique au message courant : aucune proposition (le moteur n’a pas d’autre élément sourcé)', () => {
    expect(alternativeHooksFor({ body: '   ' }, current)).toEqual([])
    expect(alternativeHooksFor({ body: current }, current)).toEqual([])
    expect(alternativeHooksFor(null, current)).toEqual([])
  })
})
