import { describe, expect, it } from 'vitest'
import { applyOutOfTarget, nextSectorsCleared, sectorsExplicitlyCleared } from './discover-out-of-target'

/**
 * #3551 (recette prod 02/10) — « Chercher hors de ma cible » ne marchait qu'en mode
 * Registre : en mode Signaux (« Comptes qui recrutent »), le bouton était affiché
 * mais le réglage ne partait jamais, donc Verdal Distribution restait introuvable.
 */
describe('applyOutOfTarget (#3551)', () => {
  const registry = { mode: 'registry' as const, query: { filters: {}, limit: 20 } }
  const signals = { mode: 'signals' as const, query: { sinceDays: 90, limit: 20 } }

  it('aucune recherche lancée : rien ne part', () => {
    expect(applyOutOfTarget(null, true)).toBeNull()
  })

  it('bouton non actionné : la requête est rendue TELLE QUELLE', () => {
    expect(applyOutOfTarget(registry, false)).toBe(registry)
    expect(applyOutOfTarget(signals, false)).toBe(signals)
  })

  it('bouton actionné : le réglage part en mode Registre', () => {
    expect(applyOutOfTarget(registry, true)).toEqual({
      mode: 'registry',
      query: { filters: {}, limit: 20, includeOutOfTarget: true },
    })
  })

  it('bouton actionné : le réglage part AUSSI en mode Signaux', () => {
    expect(applyOutOfTarget(signals, true)).toEqual({
      mode: 'signals',
      query: { sinceDays: 90, limit: 20, includeOutOfTarget: true },
    })
  })
})

/**
 * #3873.6 revient sur #2489.3/D1, délibérément (Louis 10/10) : VIDER toutes les
 * cases secteurs du rail lève la cible pour cette recherche. Un rail jamais touché
 * garde le comportement D1 (la cible filtre).
 */
describe('sectorsExplicitlyCleared (#3873.6)', () => {
  it('cases cochées puis toutes vidées : vidage explicite', () => {
    expect(sectorsExplicitlyCleared(['62'], [])).toBe(true)
  })
  it('rail jamais touché (vide avant, vide après) : PAS un vidage', () => {
    expect(sectorsExplicitlyCleared([], [])).toBe(false)
  })
  it('il reste des cases cochées : pas un vidage', () => {
    expect(sectorsExplicitlyCleared(['62', '63'], ['63'])).toBe(false)
  })
  it('on recoche après avoir vidé : le vidage est annulé', () => {
    expect(nextSectorsCleared(true, [], ['62'])).toBe(false)
    expect(nextSectorsCleared(true, [], [])).toBe(true)
    expect(nextSectorsCleared(false, ['62'], [])).toBe(true)
  })
})
