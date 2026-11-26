import { describe, expect, it } from 'vitest'
import {
  filterScopeOpportunities,
  isObjectScope,
  isSameScope,
  opportunityScope,
  scopeAccountId,
  scopeObjectOf,
  scopeOpportunitiesFrom,
} from './chat-scope'

/**
 * #1951.4 — LA PORTÉE « UNE OPPORTUNITÉ ».
 *
 * « Opportunité » désigne deux choses dans ce produit : un STATUT commercial de
 * compte, et une LIGNE du pipe. Seule la seconde fait une portée — la première
 * aurait donné un second nom au compte, donc une deuxième vérité.
 */

const DEAL = '9c2a4f16-5b33-4d77-9e0c-1a2b3c4d5e60'

const rows = [
  { id: DEAL, label: 'Refonte du SI paiement', company_name: ' Société Générale ', stage: 'qualification' },
  { id: 'o-2', label: 'TMA portail', company_name: null, stage: 'perdu' },
  { id: 'o-3', label: 'Socle data', company_name: 'LATÉCOÈRE', stage: null },
]

describe('scopeOpportunitiesFrom — les affaires proposables', () => {
  it('propose AUSSI une affaire perdue — « pourquoi l’a-t-on perdue ? » est une question légitime', () => {
    expect(scopeOpportunitiesFrom(rows).map(o => o.id)).toEqual([DEAL, 'o-2', 'o-3'])
  })

  it('n’invente ni compte ni étape : un champ absent reste `null`', () => {
    expect(scopeOpportunitiesFrom(rows)[1]).toEqual({
      id: 'o-2',
      label: 'TMA portail',
      accountName: null,
      stage: 'perdu',
    })
    expect(scopeOpportunitiesFrom(rows)[2]?.stage).toBeNull()
  })

  it('nettoie les espaces du compte plutôt que de les propager dans le libellé', () => {
    expect(scopeOpportunitiesFrom(rows)[0]?.accountName).toBe('Société Générale')
  })
})

describe('filterScopeOpportunities — la recherche sur le pipe', () => {
  const list = scopeOpportunitiesFrom(rows)

  it('cherche sur l’intitulé ET le compte, sans accents ni casse', () => {
    expect(filterScopeOpportunities(list, 'societe generale').map(o => o.id)).toEqual([DEAL])
    expect(filterScopeOpportunities(list, 'PORTAIL').map(o => o.id)).toEqual(['o-2'])
  })

  it('une recherche vide rend toute la liste', () => {
    expect(filterScopeOpportunities(list, '   ')).toHaveLength(3)
  })
})

describe('opportunityScope — ce que la portée porte, et ce qu’elle envoie', () => {
  const list = scopeOpportunitiesFrom(rows)

  it('le libellé nomme l’affaire ET son compte', () => {
    expect(opportunityScope(list[0]!)).toEqual({
      kind: 'opportunity',
      opportunityId: DEAL,
      label: 'Refonte du SI paiement · Société Générale',
    })
  })

  it('sans compte connu, l’intitulé reste seul', () => {
    expect(opportunityScope(list[1]!).label).toBe('TMA portail')
  })

  it('part au serveur en nature + identifiant, jamais le libellé', () => {
    expect(scopeObjectOf(opportunityScope(list[0]!))).toEqual({ kind: 'opportunity', id: DEAL })
  })

  it('est une portée OBJET et ne porte aucun identifiant de compte', () => {
    const scope = opportunityScope(list[0]!)
    expect(isObjectScope(scope)).toBe(true)
    // ⚠️ Le point qui compte : une affaire n'est PAS son compte. Renvoyer ici
    // l'`account_id` ferait lire le dossier entier là où l'on a demandé une
    // seule affaire — la méprise que la portée existe pour supprimer.
    expect(scopeAccountId(scope)).toBeNull()
  })

  it('deux affaires du même compte ne sont pas le même périmètre', () => {
    expect(isSameScope(opportunityScope(list[0]!), opportunityScope(list[2]!))).toBe(false)
    expect(
      isSameScope(opportunityScope(list[0]!), { kind: 'opportunity', opportunityId: DEAL, label: 'Renommée' }),
    ).toBe(true)
  })
})
