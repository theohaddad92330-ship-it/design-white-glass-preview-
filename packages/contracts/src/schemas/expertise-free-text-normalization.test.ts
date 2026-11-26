import { describe, expect, it } from 'vitest'

import { ESN_ANSWER_OPTIONS } from './onboarding.js'
import { normalizeExpertiseFreeText } from './expertise-free-text-normalization.js'

/**
 * #2549.3 — retour client du 17/09 : la saisie libre de `expertise_areas`
 * (`allowOther: true`) laisse passer des variantes qu'un utilisateur tape
 * naturellement (« automatisme » / « automatismes »). Sans normalisation,
 * deux commerciaux de la même ESN qui tapent chacun une variante créent deux
 * entrées visuellement proches mais jamais recoupées par un lecteur qui fait
 * une égalité stricte (contrairement à `matchingExpertises`, tolérant aux
 * jetons, mais qui ne s'applique qu'à un rapprochement stack ↔ expertise,
 * pas à la saisie).
 *
 * Portée volontairement ÉTROITE : une liste NOMMÉE d'alias connus vers la
 * valeur DU CATALOGUE (`ESN_ANSWER_OPTIONS.expertise_areas`), jamais une
 * heuristique de dérivation de pluriel générique — la leçon déjà payée par
 * `market-expertise-match.ts` (« seule une liste le sait, et une liste se
 * relit »). Une entrée non listée traverse INCHANGÉE (trim seul) : jamais de
 * donnée inventée.
 */
describe('normalizeExpertiseFreeText (#2549.3)', () => {
  it('replie un alias connu (pluriel) vers la valeur du catalogue', () => {
    expect(normalizeExpertiseFreeText('automatismes')).toBe('Automatisme, Robotique & Contrôle-commande')
    expect(normalizeExpertiseFreeText('Automatisme')).toBe('Automatisme, Robotique & Contrôle-commande')
  })

  it('est insensible à la casse, aux accents et aux espaces superflus', () => {
    expect(normalizeExpertiseFreeText('  MÉCANIQUE  ')).toBe('Mécanique & Conception (CAO, DAO)')
    expect(normalizeExpertiseFreeText('mecanique')).toBe('Mécanique & Conception (CAO, DAO)')
  })

  it('chaque alias cible une valeur réellement présente au catalogue', () => {
    // Preuve que la liste d'alias n'invente pas sa propre cible.
    const catalog = new Set(ESN_ANSWER_OPTIONS.expertise_areas)
    for (const label of ['automatismes', 'mecanique', 'genie civil']) {
      expect(catalog.has(normalizeExpertiseFreeText(label))).toBe(true)
    }
  })

  it('#2549.2 — "génie civil" et "BTP" restent DEUX entrées distinctes (retenu)', () => {
    // Arbitrage produit posé ici, pas implémenté comme un alias : "génie
    // civil" est un MÉTIER/EXPERTISE (expertise_areas), "BTP" est le SECTEUR
    // client déjà porté par `target_sectors` ("BTP & Construction"). Les
    // fusionner ferait disparaître un axe. Ce test verrouille le NON.
    expect(normalizeExpertiseFreeText('génie civil')).not.toBe('BTP & Construction')
    expect(normalizeExpertiseFreeText('BTP')).toBe('BTP')
  })

  it('une saisie libre INCONNUE traverse inchangée, hormis le trim (jamais de donnée inventée)', () => {
    expect(normalizeExpertiseFreeText('  Domotique résidentielle  ')).toBe('Domotique résidentielle')
  })

  it('sait dire NON : un alias retiré de la liste ne replie plus (preuve GA)', () => {
    expect(normalizeExpertiseFreeText('automatismes')).not.toBe('automatismes')
  })
})
