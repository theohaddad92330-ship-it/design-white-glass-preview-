import { describe, expect, it } from 'vitest'
import {
  TERRITORY_COLLECTION_LIMITS,
  TERRITORY_MEASURE_KEYS,
  TERRITORY_MEASURE_REGISTRIES,
  type TerritorySnapshot,
  readTerritoryCount,
  territoryChangeReading,
  territoryChanges,
  territoryStructuralTrend,
  territoryTrend,
} from './territory-watch.js'

const photo = (over: Partial<TerritorySnapshot> = {}): TerritorySnapshot => ({
  takenOn: '2026-08-24',
  offers: 42,
  esnPresent: 340,
  openTenders: 6,
  awardedContracts: 12,
  esnHiring: [],
  ...over,
})

describe('readTerritoryCount — un chiffre BORNÉ n’est pas un dénombrement', () => {
  it('lit « au moins 100 » quand la valeur a ATTEINT sa borne de collecte', () => {
    // Le défaut exact de l'écran Marché : « Offres IT : 100 » sur DEUX
    // départements. Cent tout rond deux fois n'est pas une mesure, c'est le
    // plafond de `list_hiring_companies(..., 100)`.
    const reading = readTerritoryCount(100, 100)
    expect(reading.state).toBe('at_least')
    expect(reading.state === 'at_least' && reading.value).toBe(100)
    expect(reading.state === 'at_least' && reading.ceiling).toBe(100)
  })

  it('lit un vrai dénombrement en dessous de la borne', () => {
    expect(readTerritoryCount(87, 100)).toEqual({ state: 'counted', value: 87 })
  })

  it('lit « non mesuré » sur une absence — jamais « 0 »', () => {
    expect(readTerritoryCount(null, 100)).toEqual({ state: 'unmeasured' })
  })

  it('lit un ZÉRO mesuré comme un zéro — il est VRAI', () => {
    // La règle n'est pas « jamais zéro » : zéro appel d'offres ouvert est une
    // information, et la refuser serait la faute symétrique.
    expect(readTerritoryCount(0, 50)).toEqual({ state: 'counted', value: 0 })
  })

  it('retombe sur la borne EN VIGUEUR quand la photo n’en porte pas', () => {
    // Les photos d'avant la migration n'ont pas enregistré leur borne. On ne
    // les lit pas comme « non bornées » — ce serait inventer.
    expect(readTerritoryCount(100, undefined, 'offers').state).toBe('at_least')
  })

  it('une borne dépassée reste « au moins » — jamais un compte exact', () => {
    // Le jour où la collecte change, une photo ancienne peut porter une valeur
    // au-dessus de la borne qu'on lui attribue. Elle reste bornée.
    expect(readTerritoryCount(140, 100).state).toBe('at_least')
  })

  it('chaque mesure a sa borne ET son registre nommé', () => {
    for (const key of TERRITORY_MEASURE_KEYS) {
      expect(TERRITORY_COLLECTION_LIMITS[key]).toBeGreaterThan(0)
      expect(TERRITORY_MEASURE_REGISTRIES[key]).toBeTruthy()
    }
  })
})

describe('territoryTrend — deux photos suffisent, une seule ne suffit pas', () => {
  it('rend « pas de photo de référence » sur une seule photo', () => {
    const trend = territoryTrend({ key: 'openTenders', previous: null, latest: photo() })
    expect(trend).toEqual({ measured: false, gap: 'no_previous_snapshot' })
  })

  it('rend la variation entre deux photos de la MÊME semaine calendaire', () => {
    // `metricDelta` indexe par MOIS : deux photos hebdomadaires du même mois lui
    // apparaîtraient « pas dans l'ordre ». C'est le piège que l'adaptateur évite.
    const trend = territoryTrend({
      key: 'openTenders',
      previous: photo({ takenOn: '2026-08-17', openTenders: 10 }),
      latest: photo({ takenOn: '2026-08-24', openTenders: 15 }),
    })
    expect(trend.measured).toBe(true)
    expect(trend.measured && trend.change).toBe(5)
    expect(trend.measured && trend.percent).toBe(50)
    expect(trend.measured && trend.fromDate).toBe('2026-08-17')
    expect(trend.measured && trend.toDate).toBe('2026-08-24')
  })

  it('REFUSE de comparer deux mesures BORNÉES — « 100 → 100 » n’est pas « stable »', () => {
    // Le cœur du lot : deux plafonds ne font pas une stabilité. Écrire « +0 »
    // ici serait exactement le zéro qui ment.
    const trend = territoryTrend({
      key: 'offers',
      previous: photo({ takenOn: '2026-08-17', offers: 100, collectionLimits: { offers: 100 } }),
      latest: photo({ takenOn: '2026-08-24', offers: 100, collectionLimits: { offers: 100 } }),
    })
    expect(trend).toEqual({ measured: false, gap: 'bounded_reading' })
  })

  it('REFUSE aussi quand UNE SEULE des deux photos est bornée', () => {
    const trend = territoryTrend({
      key: 'offers',
      previous: photo({ takenOn: '2026-08-17', offers: 60, collectionLimits: { offers: 100 } }),
      latest: photo({ takenOn: '2026-08-24', offers: 100, collectionLimits: { offers: 100 } }),
    })
    expect(trend).toEqual({ measured: false, gap: 'bounded_reading' })
  })

  it('ne compare pas deux photos non ordonnées', () => {
    const trend = territoryTrend({
      key: 'openTenders',
      previous: photo({ takenOn: '2026-08-24' }),
      latest: photo({ takenOn: '2026-08-17' }),
    })
    expect(trend).toEqual({ measured: false, gap: 'periods_not_ordered' })
  })

  it('rend « pas de photo courante » quand la mesure du jour manque', () => {
    const trend = territoryTrend({
      key: 'offers',
      previous: photo({ takenOn: '2026-08-17', offers: 42 }),
      latest: photo({ takenOn: '2026-08-24', offers: null }),
    })
    expect(trend).toEqual({ measured: false, gap: 'no_current_snapshot' })
  })

  it('ne rend AUCUN pourcentage sur une base à zéro', () => {
    const trend = territoryTrend({
      key: 'openTenders',
      previous: photo({ takenOn: '2026-08-17', openTenders: 0 }),
      latest: photo({ takenOn: '2026-08-24', openTenders: 4 }),
    })
    expect(trend.measured).toBe(true)
    expect(trend.measured && trend.change).toBe(4)
    expect(trend.measured && trend.percent).toBeNull()
  })
})

describe('territoryChangeReading — « — → 1 » n’est pas une variation', () => {
  it('lit une ENTRÉE, jamais « — → 1 »', () => {
    const reading = territoryChangeReading({
      kind: 'new_esn',
      label: 'nouvelle ESN',
      from: null,
      to: 1,
      subject: 'SCC France',
    })
    expect(reading).toEqual({ shape: 'entered', to: 1 })
  })

  it('lit une SORTIE', () => {
    const reading = territoryChangeReading({ kind: 'esn_left', label: 'sortie', from: 4, to: null, subject: 'SII' })
    expect(reading).toEqual({ shape: 'left', from: 4 })
  })

  it('lit un DÉPLACEMENT avec sa variation', () => {
    const reading = territoryChangeReading({ kind: 'offers', label: 'offres', from: 100, to: 145 })
    expect(reading).toEqual({ shape: 'moved', from: 100, to: 145, change: 45, percent: 45 })
  })

  it('ne lit rien du tout quand les deux bornes manquent', () => {
    expect(territoryChangeReading({ kind: 'offers', label: 'offres', from: null, to: null })).toEqual({
      shape: 'unreadable',
    })
  })
})

describe('territoryChanges — les SORTIES aussi', () => {
  it('signale une ESN qui a cessé de recruter sur le territoire', () => {
    // Les entrées étaient vues, les sorties non : un territoire qui se vide se
    // lisait « rien de notable ».
    const changes = territoryChanges(photo({ esnHiring: [{ name: 'SII', offers: 6 }] }), photo({ esnHiring: [] }))
    expect(changes).toContainEqual(expect.objectContaining({ kind: 'esn_left', from: 6, to: null, subject: 'SII' }))
  })

  it('ne signale pas une sortie quand la photo précédente est vide', () => {
    const changes = territoryChanges(photo({ esnHiring: [] }), photo({ esnHiring: [] }))
    expect(changes).toEqual([])
  })
})

// #2206.42 — l'horizon STRUCTUREL : même mesure entre la plus ANCIENNE photo
// disponible et la plus récente, jamais entre les deux dernières (ça, c'est
// l'horizon ACTUEL que `territoryTrend` calcule déjà).
describe('territoryStructuralTrend — le fond, jamais l’actuel déguisé', () => {
  it('rend « pas assez de recul » avec deux photos ou moins', () => {
    const trend = territoryStructuralTrend({
      key: 'offers',
      history: [photo({ takenOn: '2026-07-01', offers: 50 }), photo({ takenOn: '2026-08-24', offers: 90 })],
    })
    expect(trend).toEqual({ measured: false, gap: 'not_enough_history' })
  })

  it('rend « pas assez de recul » avec une seule photo', () => {
    const trend = territoryStructuralTrend({ key: 'offers', history: [photo({ takenOn: '2026-08-24' })] })
    expect(trend).toEqual({ measured: false, gap: 'not_enough_history' })
  })

  it('rend « pas assez de recul » quand la plus ancienne a MOINS de 30 jours', () => {
    // Trois photos, mais serrées sur deux semaines : ce n'est pas du fond.
    const trend = territoryStructuralTrend({
      key: 'offers',
      history: [
        photo({ takenOn: '2026-08-10', offers: 70 }),
        photo({ takenOn: '2026-08-17', offers: 80 }),
        photo({ takenOn: '2026-08-24', offers: 90 }),
      ],
    })
    expect(trend).toEqual({ measured: false, gap: 'not_enough_history' })
  })

  it('mesure entre la PLUS ANCIENNE et la PLUS RÉCENTE — jamais l’avant-dernière', () => {
    const trend = territoryStructuralTrend({
      key: 'offers',
      history: [
        photo({ takenOn: '2026-06-01', offers: 40 }),
        photo({ takenOn: '2026-08-10', offers: 999 }), // un point du milieu, ignoré
        photo({ takenOn: '2026-08-24', offers: 90 }),
      ],
    })
    expect(trend.measured).toBe(true)
    expect(trend.measured && trend.from).toBe(40)
    expect(trend.measured && trend.to).toBe(90)
    expect(trend.measured && trend.fromDate).toBe('2026-06-01')
    expect(trend.measured && trend.toDate).toBe('2026-08-24')
    expect(trend.measured && trend.change).toBe(50)
  })

  it('REFUSE aussi entre deux plafonds — deux plafonds ne font pas une stabilité, même sur un trimestre', () => {
    const trend = territoryStructuralTrend({
      key: 'offers',
      history: [
        photo({ takenOn: '2026-05-01', offers: 100, collectionLimits: { offers: 100 } }),
        photo({ takenOn: '2026-08-24', offers: 100, collectionLimits: { offers: 100 } }),
      ],
    })
    // Deux photos seulement : le gap attendu est « pas assez de recul », qui
    // prime — la borne ne se lit même pas s'il n'y a pas de fond à mesurer.
    expect(trend).toEqual({ measured: false, gap: 'not_enough_history' })
  })

  it('REFUSE entre deux plafonds sur un VRAI historique', () => {
    const trend = territoryStructuralTrend({
      key: 'offers',
      history: [
        photo({ takenOn: '2026-05-01', offers: 100, collectionLimits: { offers: 100 } }),
        photo({ takenOn: '2026-06-01', offers: 60, collectionLimits: { offers: 100 } }),
        photo({ takenOn: '2026-08-24', offers: 100, collectionLimits: { offers: 100 } }),
      ],
    })
    expect(trend).toEqual({ measured: false, gap: 'bounded_reading' })
  })
})
