import { describe, expect, it } from 'vitest'
import { accountListItemSchema, accountListQuerySchema } from './account.js'

/**
 * #4498.a (PR 12C) — les filtres du portefeuille se COCHENT à plusieurs : chaque axe serveur accepte une valeur
 * seule (les appelants d'avant : API publique, MCP, liens) OU une liste. Une valeur inconnue dans la liste
 * refuse toute la requête plutôt que de filtrer sur un axe qu'on ne sait pas calculer.
 */
describe('accountListQuerySchema — filtres multi-valeurs (#4498.a)', () => {
  it.each([
    ['sector', ['Banque', 'Assurance']],
    ['tag', ['sap', 'cloud']],
    ['lifecycle', ['customer', 'opening']],
    ['gate', ['pending', 'parked']],
    ['score', ['high', 'low']],
    ['status', ['completed', 'error']],
    ['entityKind', ['subsidiary', 'bu']],
  ])('%s accepte une liste', (key, values) => {
    const parsed = accountListQuerySchema.safeParse({ [key]: values })
    expect(parsed.success).toBe(true)
    expect(parsed.data?.[key as 'sector']).toEqual(values)
  })

  it('une valeur seule reste admise (appelants existants)', () => {
    expect(accountListQuerySchema.safeParse({ sector: 'Banque', score: 'high' }).success).toBe(true)
  })

  it('une valeur inconnue dans la liste refuse la requête', () => {
    expect(accountListQuerySchema.safeParse({ score: ['high', 'nope'] }).success).toBe(false)
    expect(accountListQuerySchema.safeParse({ lifecycle: ['customer', 'nope'] }).success).toBe(false)
  })

  it('une liste vide ou démesurée est refusée', () => {
    expect(accountListQuerySchema.safeParse({ sector: [] }).success).toBe(false)
    expect(accountListQuerySchema.safeParse({ sector: Array.from({ length: 41 }, (_, i) => `s${i}`) }).success).toBe(
      false,
    )
  })
})

describe('accountListItemSchema — le siège sur la ligne (#4497.a)', () => {
  it('porte `headquarters` (nullable, optionnel) pour que la ligne en tire la ville', () => {
    expect(accountListItemSchema.shape).toHaveProperty('headquarters')
  })
})

describe('accountListQuerySchema — preuves du compte (#4498.c)', () => {
  it('accepte documentedHistory et authorizedReferences, refuse l’inconnu', () => {
    expect(accountListQuerySchema.safeParse({ documentedHistory: 'with', authorizedReferences: 'only' }).success).toBe(
      true,
    )
    expect(accountListQuerySchema.safeParse({ documentedHistory: 'maybe' }).success).toBe(false)
    expect(accountListQuerySchema.safeParse({ authorizedReferences: 'some' }).success).toBe(false)
  })
})

describe('#4526.2 — le filtre « Mon CRM »', () => {
  it('accepte crm=only|all, refuse l’inconnu', () => {
    expect(accountListQuerySchema.safeParse({ crm: 'only' }).success).toBe(true)
    expect(accountListQuerySchema.safeParse({ crm: 'all' }).success).toBe(true)
    expect(accountListQuerySchema.safeParse({ crm: 'some' }).success).toBe(false)
  })
})
