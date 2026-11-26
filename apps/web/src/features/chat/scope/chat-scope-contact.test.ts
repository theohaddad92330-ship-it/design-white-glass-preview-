import { describe, expect, it } from 'vitest'
import {
  contactScope,
  filterScopeContacts,
  isObjectScope,
  isSameScope,
  scopeAccountId,
  scopeContactsFrom,
  scopeObjectOf,
  type ChatScope,
} from './chat-scope'

/**
 * #1951.1 — LA PORTÉE « UN CONTACT ».
 *
 * La demande la plus citée du retour : « prépare une relance pour Sophie » se
 * posait jusqu'ici sur le COMPTE entier. La portée voyage comme les quatre
 * autres — nature + identifiant, jamais le nom.
 */

const SOPHIE = '1d7f1a3c-6b21-4d55-9f0a-7c1e2b3d4f50'
const SOPHIE_BIS = '2e8a2b4d-7c32-4e66-8a1b-8d2f3c4e5061'

const rows = [
  { id: SOPHIE, full_name: ' Sophie Martin ', title: ' DSI ', company_name: ' LATÉCOÈRE ' },
  { id: SOPHIE_BIS, full_name: 'Sophie Martin', title: 'Directrice achats', company_name: 'SNCF Réseau' },
  { id: 'c-3', full_name: 'Karim Benali', title: null, company_name: null },
  { id: 'c-out', full_name: 'Écarté du jeu', title: null, company_name: 'ACME', excluded_at: '2026-09-01' },
]

describe('scopeContactsFrom — les contacts proposables', () => {
  it('écarte un contact ÉCARTÉ — on ne cadre pas un fil sur quelqu’un qu’on a retiré du jeu', () => {
    expect(scopeContactsFrom(rows).map(c => c.id)).toEqual([SOPHIE, SOPHIE_BIS, 'c-3'])
  })

  it('n’invente rien : un champ absent reste `null`, jamais une chaîne de remplissage', () => {
    const karim = scopeContactsFrom(rows).find(c => c.id === 'c-3')
    expect(karim).toEqual({ id: 'c-3', fullName: 'Karim Benali', title: null, companyName: null })
  })

  it('nettoie les espaces plutôt que de les propager dans un libellé', () => {
    expect(scopeContactsFrom(rows)[0]).toEqual({
      id: SOPHIE,
      fullName: 'Sophie Martin',
      title: 'DSI',
      companyName: 'LATÉCOÈRE',
    })
  })
})

describe('filterScopeContacts — la recherche qui sépare deux homonymes (#1951.23)', () => {
  const list = scopeContactsFrom(rows)

  it('cherche sur le nom, sans accents ni casse', () => {
    expect(filterScopeContacts(list, 'latecoere').map(c => c.id)).toEqual([SOPHIE])
  })

  it('la SOCIÉTÉ est ce qui tranche entre deux « Sophie Martin »', () => {
    expect(filterScopeContacts(list, 'sophie').map(c => c.id)).toEqual([SOPHIE, SOPHIE_BIS])
    expect(filterScopeContacts(list, 'sophie sncf')).toHaveLength(0)
    expect(filterScopeContacts(list, 'sncf').map(c => c.id)).toEqual([SOPHIE_BIS])
  })

  it('cherche aussi sur le poste', () => {
    expect(filterScopeContacts(list, 'achats').map(c => c.id)).toEqual([SOPHIE_BIS])
  })

  it('une recherche vide rend toute la liste', () => {
    expect(filterScopeContacts(list, '   ')).toHaveLength(3)
  })
})

describe('contactScope — ce que la portée porte, et ce qu’elle envoie', () => {
  const list = scopeContactsFrom(rows)

  it('le libellé nomme la personne ET sa société — « Sophie Martin » seul se lit partout', () => {
    expect(contactScope(list[0]!)).toEqual({ kind: 'contact', contactId: SOPHIE, label: 'Sophie Martin · LATÉCOÈRE' })
  })

  it('sans société connue, le nom reste seul — on n’invente pas un employeur', () => {
    expect(contactScope(list[2]!)).toEqual({ kind: 'contact', contactId: 'c-3', label: 'Karim Benali' })
  })

  it('part au serveur en nature + identifiant, jamais le nom', () => {
    expect(scopeObjectOf(contactScope(list[0]!))).toEqual({ kind: 'contact', id: SOPHIE })
  })

  it('est une portée OBJET, et ne porte aucun identifiant de compte', () => {
    const scope: ChatScope = contactScope(list[0]!)
    expect(isObjectScope(scope)).toBe(true)
    expect(scopeAccountId(scope)).toBeNull()
  })

  it('deux homonymes ne sont pas le même périmètre ; une fiche renommée, si', () => {
    expect(isSameScope(contactScope(list[0]!), contactScope(list[1]!))).toBe(false)
    expect(
      isSameScope(contactScope(list[0]!), { kind: 'contact', contactId: SOPHIE, label: 'Sophie Martin-Durand' }),
    ).toBe(true)
  })
})
