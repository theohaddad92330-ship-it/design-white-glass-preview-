import { describe, expect, it } from 'vitest'
import { preparationTiles } from './preparation-tiles'

const row = (state: string, preparedAmountCents: number | null) => ({ state, preparedAmountCents })

describe('preparationTiles — les quatre tuiles de Théo, mesurées sur les lignes du mois', () => {
  const summary = { ready: 2, blocked: 1, invoiced: 1, invoicedDeclared: 1, preparedInvoicesCount: 3 }

  it('somme le HT des seuls dossiers prêts, et compte chaque famille', () => {
    const tiles = preparationTiles(
      [row('ready', 1_000_000), row('ready', 500_000), row('blocked', 300_000), row('invoiced', 900_000)],
      summary,
      true,
    )
    expect(tiles.ready).toEqual({ count: 2, amountCents: 1_500_000 })
    expect(tiles.blocked).toBe(1)
    expect(tiles.prepared).toBe(3)
    expect(tiles.issued).toEqual({ count: 2, declared: 1 })
  })

  it('un dossier prêt sans montant rend le total absent, jamais un total partiel', () => {
    const tiles = preparationTiles([row('ready', 1_000_000), row('ready', null)], summary, true)
    expect(tiles.ready.amountCents).toBeNull()
    expect(tiles.ready.count).toBe(2)
  })

  it('sans droit financier le montant est absent, le compte reste', () => {
    const tiles = preparationTiles([row('ready', 1_000_000)], summary, false)
    expect(tiles.ready.amountCents).toBeNull()
  })

  it('aucun dossier prêt : pas de montant à inventer', () => {
    expect(preparationTiles([row('blocked', 1)], summary, true).ready.amountCents).toBeNull()
  })

  it('sans résumé, rien n’est mesuré', () => {
    const tiles = preparationTiles([], undefined, true)
    expect(tiles).toEqual({ ready: { count: null, amountCents: null }, blocked: null, prepared: null, issued: null })
  })
})
