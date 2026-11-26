import { describe, expect, it } from 'vitest'
import {
  STOCK_METRIC_KEYS,
  STOCK_METRIC_PROVENANCE,
  STOCK_METRIC_SOURCE,
  monthOf,
  previousMonthLastDay,
  stockBaselineSchema,
} from './stock-snapshot.js'
import { HYGIENE_CHECKS } from './data-hygiene.js'

describe('les clés photographiées', () => {
  it('sont toutes rattachées à une source ET à une provenance', () => {
    // Une clé sans source ne se photographierait jamais ; une clé sans
    // provenance produirait une ligne dont personne ne peut dire d'où elle
    // vient. Les deux tables sont typées `Record<StockMetricKey, …>`, donc
    // TypeScript le tient déjà — ce test tient l'INVERSE : une entrée en trop,
    // qui désignerait une clé disparue.
    expect(Object.keys(STOCK_METRIC_SOURCE).sort()).toEqual([...STOCK_METRIC_KEYS].sort())
    expect(Object.keys(STOCK_METRIC_PROVENANCE).sort()).toEqual([...STOCK_METRIC_KEYS].sort())
  })

  it('les clés d’hygiène photographiées existent VRAIMENT dans la vue Qualité', () => {
    // Le piège du renommage : photographier `contact_without_email` (au
    // singulier) écrirait des lignes que personne ne relirait jamais, sans
    // qu'aucun test ne rougisse. On compare donc au littéral de la source.
    const hygiene = STOCK_METRIC_KEYS.filter(key => STOCK_METRIC_SOURCE[key] === 'hygiene')
    const unknown = hygiene.filter(key => !(HYGIENE_CHECKS as readonly string[]).includes(key))
    expect(unknown).toEqual([])
  })

  it('n’a PAS photographié les doublons non tranchés — ils se recalculent', () => {
    // `duplicate_pairs` porte `created_at`, `decision` et `decided_at` : l'état
    // « en attente au 1er mars » se reconstitue en SQL. Une photo de plus
    // serait une seconde vérité, pas une mesure de plus.
    expect([...STOCK_METRIC_KEYS]).not.toContain('unresolved_duplicates')
  })
})

describe('le jour que porte une photo', () => {
  it('est le DERNIER jour du mois précédent', () => {
    expect(previousMonthLastDay(new Date('2026-03-01T03:00:00Z'))).toBe('2026-02-28')
    expect(previousMonthLastDay(new Date('2026-03-17T09:12:00Z'))).toBe('2026-02-28')
    expect(previousMonthLastDay(new Date('2026-01-01T03:00:00Z'))).toBe('2025-12-31')
  })

  it('tient les années bissextiles', () => {
    expect(previousMonthLastDay(new Date('2028-03-01T03:00:00Z'))).toBe('2028-02-29')
  })

  it('ne recule pas d’un jour à cause du fuseau', () => {
    // Une date nue lue en heure locale à l'ouest de Greenwich rend la veille.
    // Le 1er mars à 00:30 UTC est le pire cas : à Paris on est déjà le 1er, à
    // New York on est encore le 28 février.
    expect(previousMonthLastDay(new Date('2026-03-01T00:30:00Z'))).toBe('2026-02-28')
  })

  it('donne le mois de la photo', () => {
    expect(monthOf('2026-02-28')).toBe('2026-02')
  })
})

describe('la base de comparaison servie à l’écran', () => {
  it('accepte une base VIDE — aucune photo n’est un état normal', () => {
    const parsed = stockBaselineSchema.parse({ month: null, takenOn: null, values: {} })
    expect(parsed.values).toEqual({})
  })

  it('refuse un mois mal formé — une comparaison mal datée est pire qu’aucune', () => {
    expect(() => stockBaselineSchema.parse({ month: 'février', takenOn: null, values: {} })).toThrow()
  })
})
