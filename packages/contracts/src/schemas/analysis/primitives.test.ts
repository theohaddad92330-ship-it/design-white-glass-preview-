import { describe, expect, it } from 'vitest'
import { signalKindSchema, territoryLevelSchema } from './primitives.js'

// #2302 (LAU-FINAL-043) — arbitrage Louis 18/09/2026 : « territoire » (niveau
// de compte) et « nœud de graphe d'organisation » (`orgEntityTypeSchema`,
// org-graph.ts) sont DEUX AXES SÉPARÉS. Ce test verrouille l'axe territoire —
// le miroir Python vit dans
// `apps/ia/tests/test_territory_resolver.py::TestTerritoryLevels`.
describe('territoryLevelSchema — niveau de territoire commercial (#2302)', () => {
  it('accepte les onze niveaux de compte', () => {
    for (const level of [
      'groupe',
      'maison_mere',
      'filiale',
      'sous_filiale',
      'bu',
      'direction',
      'entite_juridique',
      'marque',
      'etablissement',
      'region',
      'pays',
    ]) {
      expect(() => territoryLevelSchema.parse(level)).not.toThrow()
    }
  })

  it("ne porte JAMAIS 'programme' ni 'projet' — l'AUTRE axe (org-graph.ts)", () => {
    expect(territoryLevelSchema.options).not.toContain('programme')
    expect(territoryLevelSchema.options).not.toContain('projet')
    expect(() => territoryLevelSchema.parse('programme')).toThrow()
  })

  it('refuse une valeur inventée', () => {
    expect(() => territoryLevelSchema.parse('siege-social')).toThrow()
  })
})

// #2952 (#2305.6/.7/.11/.12) — LAU-FINAL-046 nomme onze natures de signal ;
// transformation/déménagement/investissement/organisation n'avaient aucun
// libellé exact dans l'énumération (les plus proches — restructuration,
// budget, projet — sont des genres DISTINCTS).
describe('signalKindSchema — les quatre natures manquantes de LAU-FINAL-046 (#2952)', () => {
  it('accepte les quatre nouvelles natures', () => {
    for (const kind of ['transformation', 'demenagement', 'investissement', 'organisation']) {
      expect(() => signalKindSchema.parse(kind)).not.toThrow()
    }
  })

  it('garde les onze natures précédentes', () => {
    for (const kind of [
      'nomination',
      'budget',
      'projet',
      'incident',
      'regulation',
      'acquisition',
      'partenariat',
      'restructuration',
      'recrutement',
      'appel_offres',
      'marche_public',
    ]) {
      expect(() => signalKindSchema.parse(kind)).not.toThrow()
    }
  })

  it('refuse une valeur inventée', () => {
    expect(() => signalKindSchema.parse('promotion-interne')).toThrow()
  })
})

// #3206.6 (partiel, épopée #3240) — `bellum_signals.py` produit maintenant
// aussi levee_fonds/technologie/contact/recours_externe (appel_offres
// existait déjà dans cette énumération, sans que ce prompt-ci l'émette).
describe('signalKindSchema — les quatre natures ajoutées par #3206.6', () => {
  it('accepte les quatre nouvelles natures', () => {
    for (const kind of ['levee_fonds', 'technologie', 'contact', 'recours_externe']) {
      expect(() => signalKindSchema.parse(kind)).not.toThrow()
    }
  })

  it('garde toutes les natures précédentes, y compris appel_offres/marche_public', () => {
    for (const kind of [
      'nomination',
      'budget',
      'projet',
      'incident',
      'regulation',
      'acquisition',
      'partenariat',
      'restructuration',
      'recrutement',
      'appel_offres',
      'marche_public',
      'transformation',
      'demenagement',
      'investissement',
      'organisation',
    ]) {
      expect(() => signalKindSchema.parse(kind)).not.toThrow()
    }
  })
})
