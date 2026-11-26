import { describe, expect, it } from 'vitest'
import { ACCOUNT_LIST_HEADLINE_FILTERS, accountListCountersSchema, accountListQuerySchema } from './account.js'

/**
 * #1580 — LE BANDEAU DE TÊTE DEVIENT UN FILTRE.
 *
 * `GET /accounts?headline=…` reprend un des trois axes DÉCISIONNELS du
 * bandeau. `followed` n'en fait PAS partie : cliquer ce chiffre-là ramène au
 * portefeuille complet (il n'a rien à filtrer), plutôt que de filtrer sur
 * « suivi » — un axe que ni le bandeau ni cette liste n'exposent comme tel.
 */
describe('accountListQuerySchema.headline (#1580)', () => {
  it('accepte les trois métriques décisionnelles du bandeau', () => {
    for (const value of ACCOUNT_LIST_HEADLINE_FILTERS) {
      expect(accountListQuerySchema.safeParse({ headline: value }).success).toBe(true)
    }
  })

  it('« suivis » (followed) n’est PAS un axe de restriction — il n’est pas accepté ici', () => {
    expect(accountListQuerySchema.safeParse({ headline: 'followed' }).success).toBe(false)
  })

  it('rejette une valeur inconnue plutôt que de filtrer sur un axe inventé', () => {
    expect(accountListQuerySchema.safeParse({ headline: 'dormant' }).success).toBe(false)
  })

  it('absent = pas de filtre — le comportement d’avant ce chantier', () => {
    expect(accountListQuerySchema.safeParse({}).success).toBe(true)
  })

  it('les clés SONT celles du contrat des compteurs — même vocabulaire, jamais une seconde traduction', () => {
    const counterKeys = Object.keys(accountListCountersSchema.shape)
    // Refonte Théo (23/10) — « À reprendre » n'a pas de compteur à lui : l'écran le DÉRIVE de deux compteurs
    // (`followed` − `withoutNextAction`, `AccountsKeyFigures`). Ses deux sources, elles, sont au contrat.
    const derived: Record<string, readonly string[]> = { toResume: ['followed', 'withoutNextAction'] }
    for (const value of ACCOUNT_LIST_HEADLINE_FILTERS) {
      for (const key of derived[value] ?? [value]) expect(counterKeys).toContain(key)
    }
  })
})
