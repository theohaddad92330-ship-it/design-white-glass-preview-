import { describe, expect, it } from 'vitest'
import {
  chatScopeFromObject,
  filterScopeJobOffers,
  isObjectScope,
  isSameScope,
  jobOfferScope,
  scopeAccountId,
  scopeJobOffersFrom,
  scopeObjectOf,
} from './chat-scope'

/**
 * Théo L1 — sélecteur avancé — LA PORTÉE « UNE OFFRE D'EMPLOI ».
 *
 * Une offre d'emploi est un signal de RECRUTEMENT repéré chez un compte. Elle se
 * désigne par l'identifiant de sa ligne d'historique (`history_id`) — la seule
 * identité stable d'un signal. Une offre de STAGE n'est jamais proposée
 * (décision Louis 12/10).
 */

const OFFER = '6f1c1b1e-8a51-4c2f-9d1e-2b9d0c7a4e11'

const signals = [
  {
    history_id: OFFER,
    label: 'Data engineer — plateforme data voyageurs (H/F)',
    company_name: 'SNCF Voyageurs',
    type: 'recrutement',
    date: '2026-10-06',
  },
  // Pas une offre : un autre type de signal.
  { history_id: 'h-2', label: 'Levée de fonds', company_name: 'ACME', type: 'funding', date: '2026-09-01' },
  // Une offre pas encore historisée : rien pour la désigner, elle n'est pas proposée.
  { label: 'Architecte cloud', company_name: 'SNCF Voyageurs', type: 'recrutement', date: '2026-10-02' },
  // Une offre de STAGE : jamais proposée.
  { history_id: 'h-4', label: 'CS27 - Bac 5 - Stage Supply Chain H/F', company_name: 'SNCF', type: 'recrutement' },
  { history_id: 'h-5', label: 'Chef de projet SI', company_name: ' LATÉCOÈRE ', type: 'hiring', date: null },
]

describe('scopeJobOffersFrom — les offres d’emploi proposables', () => {
  it('ne propose que les signaux de RECRUTEMENT historisés, jamais un stage', () => {
    expect(scopeJobOffersFrom(signals).map(offer => offer.id)).toEqual([OFFER, 'h-5'])
  })

  it('n’invente ni compte ni date : un champ absent reste `null`', () => {
    expect(scopeJobOffersFrom(signals)[1]).toEqual({
      id: 'h-5',
      title: 'Chef de projet SI',
      accountName: 'LATÉCOÈRE',
      date: null,
    })
  })
})

describe('filterScopeJobOffers — la recherche par nom', () => {
  const offers = scopeJobOffersFrom(signals)

  it('cherche dans l’intitulé ET le compte, sans accents ni casse', () => {
    expect(filterScopeJobOffers(offers, 'latecoere').map(offer => offer.id)).toEqual(['h-5'])
    expect(filterScopeJobOffers(offers, 'DATA engineer').map(offer => offer.id)).toEqual([OFFER])
  })

  it('une recherche vide rend tout', () => {
    expect(filterScopeJobOffers(offers, '  ')).toHaveLength(2)
  })
})

describe('jobOfferScope — la portée et ce qui part au serveur', () => {
  const [offer] = scopeJobOffersFrom(signals)
  const scope = jobOfferScope(offer!)

  it('nomme l’offre ET son compte — « Data engineer » seul se lit chez n’importe quel client', () => {
    expect(scope).toEqual({
      kind: 'job_offer',
      jobOfferId: OFFER,
      label: 'Data engineer — plateforme data voyageurs (H/F) · SNCF Voyageurs',
    })
  })

  it('est une portée objet ; seuls la nature et l’identifiant partent au serveur, jamais le libellé', () => {
    expect(isObjectScope(scope)).toBe(true)
    expect(scopeObjectOf(scope)).toEqual({ kind: 'job_offer', id: OFFER })
    expect(scopeAccountId(scope)).toBeNull()
  })

  it('se compare par IDENTIFIANT — un libellé changé ne fait pas une autre portée', () => {
    expect(isSameScope(scope, { kind: 'job_offer', jobOfferId: OFFER, label: null })).toBe(true)
    expect(isSameScope(scope, { kind: 'job_offer', jobOfferId: 'h-5', label: scope.label })).toBe(false)
  })
})

describe('chatScopeFromObject — le lien partageable relu', () => {
  it('rend la portée objet, libellé inconnu tant que la liste n’est pas chargée', () => {
    expect(chatScopeFromObject({ kind: 'job_offer', id: OFFER })).toEqual({
      kind: 'job_offer',
      jobOfferId: OFFER,
      label: null,
    })
    expect(chatScopeFromObject({ kind: 'contact', id: OFFER })).toEqual({
      kind: 'contact',
      contactId: OFFER,
      label: null,
    })
  })

  it('aller-retour : la portée relue repart au serveur à l’identique, pour chaque nature', () => {
    for (const kind of ['consultant', 'need', 'mission', 'contact', 'opportunity', 'job_offer'] as const) {
      expect(scopeObjectOf(chatScopeFromObject({ kind, id: OFFER }))).toEqual({ kind, id: OFFER })
    }
  })
})
