import type { DiscoverZoneWidening } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import {
  applyZoneCeiling,
  applyZoneStrict,
  candidateZoneDistanceText,
  candidateZoneLine,
  candidateZoneText,
  normalizeZoneWidening,
  splitByRadius,
  zoneWideningOfList,
  type DiscoverCandidateZoneWithPlace,
} from './discover-zone-widening'
import { normalizeDiscoverResponse } from './discover-normalize'
import type { DiscoverRequest } from '@/features/discover/hooks/useDiscoverSearch'

// #4429.4 — l'élargissement de zone s'ÉCRIT au-dessus de la liste, et un geste revient à la ville seule.
describe('#4429.4 — palier de zone dans Découvrir', () => {
  const toulouse = { mode: 'registry', query: { filters: { city: 'Toulouse' }, limit: 24 } } as DiscoverRequest

  it('lit le palier rendu par le moteur, et rien d’autre', () => {
    expect(normalizeZoneWidening({ place: 'Toulouse', tier: 'radius_50', exactCount: 3, widenedCount: 9 })).toEqual({
      place: 'Toulouse',
      tier: 'radius_50',
      exactCount: 3,
      widenedCount: 9,
    })
    // Un palier « ville » n'est pas un élargissement ; un objet illisible n'invente rien.
    expect(normalizeZoneWidening({ place: 'Toulouse', tier: 'city', exactCount: 3, widenedCount: 0 })).toBeUndefined()
    expect(normalizeZoneWidening({ tier: 'radius_50' })).toBeUndefined()
    expect(normalizeZoneWidening(undefined)).toBeUndefined()
  })

  it('la réponse normalisée porte le palier et l’étiquette de chaque compte élargi', () => {
    const response = normalizeDiscoverResponse({
      candidates: [
        { name: 'A SAS', siren: '111111111', city: 'TOULOUSE' },
        { name: 'B SAS', siren: '222222222', city: 'BLAGNAC', zone: { tier: 'radius_50', distanceKm: 6.2 } },
      ],
      query: {},
      degraded: [],
      zoneWidening: { place: 'Toulouse', tier: 'radius_50', exactCount: 1, widenedCount: 1 },
    })
    expect(response.zoneWidening?.tier).toBe('radius_50')
    const [exact, widened] = response.candidates
    expect(exact?.zone).toBeUndefined()
    expect(widened?.zone).toEqual({ tier: 'radius_50', distanceKm: 6.2, place: 'Toulouse' })
    expect(candidateZoneText(widened?.zone, 'fr')).toBe('Élargi à 50 km · à 6 km de Toulouse')
    expect(candidateZoneText(widened?.zone, 'en')).toBe('Widened to 50 km · 6 km from Toulouse')
    expect(candidateZoneText(exact?.zone, 'fr')).toBeNull()
  })

  // #4433.3 — l'étiquette dit le CONTRAIRE de la réalité : « à moins de 25 km d'Albi » sur un compte parisien.
  it('sans distance mesurée, jamais « à moins de N km » : le critère d’entrée, pas une proximité', () => {
    const unmeasured = { tier: 'radius_50' as const, place: 'Albi' }
    expect(candidateZoneText(unmeasured, 'fr')).toBe("Ajouté par l'élargissement de zone")
    expect(candidateZoneText(unmeasured, 'fr')).not.toMatch(/moins de/)
    expect(candidateZoneText({ ...unmeasured, distanceKm: 590 }, 'fr')).toBe("Ajouté par l'élargissement de zone")
    expect(candidateZoneText({ ...unmeasured, distanceKm: 12.4 }, 'fr')).toBe('Élargi à 50 km · à 12 km de Albi')
  })

  it('« Revenir à Toulouse seule » pose zoneStrict sur la recherche de CETTE ville seulement', () => {
    expect(applyZoneStrict(toulouse, 'Toulouse')).toEqual({
      mode: 'registry',
      query: { filters: { city: 'Toulouse', zoneStrict: true }, limit: 24 },
    })
    // Le geste ne survit pas à une autre ville : il dit NON.
    const lyon = { mode: 'registry', query: { filters: { city: 'Lyon' }, limit: 24 } } as DiscoverRequest
    expect(applyZoneStrict(lyon, 'Toulouse')).toBe(lyon)
    expect(applyZoneStrict(toulouse, null)).toBe(toulouse)
  })

  // #4429.4 (25/10) — un geste, UN barreau : « Revenir à 50 km » plafonne l'échelle, il ne retire pas la zone.
  it('« Revenir au barreau d’avant » pose zoneCeiling sur la recherche de CETTE ville seulement', () => {
    expect(applyZoneCeiling(toulouse, { city: 'Toulouse', ceiling: 'radius_50' })).toEqual({
      mode: 'registry',
      query: { filters: { city: 'Toulouse', zoneCeiling: 'radius_50' }, limit: 24 },
    })
    const lyon = { mode: 'registry', query: { filters: { city: 'Lyon' }, limit: 24 } } as DiscoverRequest
    expect(applyZoneCeiling(lyon, { city: 'Toulouse', ceiling: 'region' })).toBe(lyon)
    expect(applyZoneCeiling(toulouse, null)).toBe(toulouse)
  })

  // #4627.9 — le clic REPOSE le rayon nommé par le bouton (25 km), et ne pose rien quand aucun rayon n'est nommé.
  it('#4627.9 — « Revenir à 25 km » repose radiusKm 25 ; sans rayon nommé, la requête garde le sien', () => {
    const albi = { mode: 'registry', query: { filters: { city: 'Albi' }, limit: 24 } } as DiscoverRequest
    const placed = applyZoneCeiling(albi, { city: 'Albi', ceiling: 'radius_50', radiusKm: 25 })
    expect(placed).toEqual({
      mode: 'registry',
      query: { filters: { city: 'Albi', zoneCeiling: 'radius_50', radiusKm: 25 }, limit: 24 },
    })
    const unnamed = applyZoneCeiling(albi, { city: 'Albi', ceiling: 'radius_50' })
    expect(unnamed?.mode === 'registry' && 'radiusKm' in unnamed.query.filters).toBe(false)
  })

  it('normalise les barreaux franchis, dans l’ordre', () => {
    expect(
      normalizeZoneWidening({
        place: 'Lille',
        tier: 'region',
        steps: ['radius_50', 'region'],
        exactCount: 0,
        widenedCount: 12,
      })?.steps,
    ).toEqual(['radius_50', 'region'])
  })
})

// #4627 — le bandeau de zone sort de la MÊME liste que les lignes : « 25 ajoutés » au-dessus de 6 lignes est faux.
describe('#4627 — le bandeau de zone se recompte sur la liste rendue', () => {
  const widened: DiscoverCandidateZoneWithPlace = { tier: 'radius_50', distanceKm: 30, place: 'Albi' }
  const zone: DiscoverZoneWidening = {
    place: 'Albi',
    tier: 'radius_50',
    exactCount: 3,
    widenedCount: 25,
    steps: ['radius_50'],
  }

  it('annonce ce que la liste porte, pas ce que la collecte a ramené', () => {
    const listed = [{}, {}, {}, { zone: widened }, { zone: widened }, { zone: widened }]
    const out = zoneWideningOfList(zone, listed)
    expect(out?.widening.exactCount).toBe(3)
    expect(out?.widening.widenedCount).toBe(3)
  })

  it('aucune ligne élargie rendue : aucun bandeau', () => {
    expect(zoneWideningOfList(zone, [{}, {}, {}])).toBeUndefined()
    expect(zoneWideningOfList(undefined, [{ zone: widened }])).toBeUndefined()
  })

  // #4657 (recette prod 27/10) — « 3 ajoutés par l'élargissement » et AUCUNE ligne étiquetée : une aire inconnue
  // rendait une étiquette nulle. La ligne nomme désormais son palier, connue ou non son aire.
  it('une ligne élargie sans aire connue nomme quand même son palier : la promesse « étiquetés » tient', () => {
    const region: DiscoverCandidateZoneWithPlace = { tier: 'region', place: 'Lille' }
    const france: DiscoverCandidateZoneWithPlace = { tier: 'france', place: 'Lille' }
    expect(candidateZoneText(region, 'fr')).toBe('Élargi à la région')
    expect(candidateZoneText(france, 'fr')).toBe('Élargi à toute la France')
    const regionZone: DiscoverZoneWidening = { ...zone, tier: 'region', steps: ['department', 'region'] }
    expect(zoneWideningOfList(regionZone, [{}, { zone: region }])?.allLabelled).toBe(true)
    expect(zoneWideningOfList(zone, [{}, { zone: widened }], 'fr')?.allLabelled).toBe(true)
  })

  it('le barreau dit est le plus lointain qu’une ligne rendue porte', () => {
    const regionZone: DiscoverZoneWidening = {
      ...zone,
      tier: 'region',
      area: 'Occitanie',
      steps: ['radius_50', 'region'],
    }
    const out = zoneWideningOfList(regionZone, [{}, { zone: widened }])
    expect(out?.widening.tier).toBe('radius_50')
    expect(out?.widening.steps).toEqual(['radius_50'])
    expect(out?.widening.area).toBeUndefined()
  })

  // Lot DÉCOUVRIR-ZONE (Louis 27/10) — le département est un palier NOMMÉ : son aire reste sur le bandeau recompté.
  it('le palier département garde son aire (« au département (Nord) »)', () => {
    const dept: DiscoverZoneWidening = {
      ...zone,
      place: 'Lille',
      tier: 'department',
      area: 'Nord',
      steps: ['department'],
    }
    const row: DiscoverCandidateZoneWithPlace = { tier: 'department', area: 'Nord', place: 'Lille' }
    expect(zoneWideningOfList(dept, [{}, { zone: row }])?.widening.area).toBe('Nord')
  })

  // 2710N — l'arrêt au plafond se PRÉSERVE au recomptage, et seul il rend un bandeau sans ligne élargie.
  it('autoCapReached : le bandeau sans compte élargi n’existe que si le service dit l’arrêt', () => {
    const stopped: DiscoverZoneWidening = {
      place: 'Lille',
      tier: 'region',
      steps: ['department', 'region'],
      area: 'Hauts-de-France',
      exactCount: 3,
      widenedCount: 0,
      autoCapReached: true,
    }
    const out = zoneWideningOfList(stopped, [{}, {}, {}])
    expect(out?.widening).toMatchObject({ tier: 'region', exactCount: 3, widenedCount: 0, autoCapReached: true })
    expect(zoneWideningOfList({ ...stopped, autoCapReached: undefined }, [{}, {}, {}])).toBeUndefined()
    const row: DiscoverCandidateZoneWithPlace = { tier: 'department', area: 'Nord', place: 'Lille' }
    const won = zoneWideningOfList({ ...stopped, widenedCount: 1 }, [{}, {}, { zone: row }])
    expect(won?.widening).toMatchObject({ tier: 'department', widenedCount: 1, autoCapReached: true })
  })
})

// #5069 — « Lille à 25 km » : un compte élargi hors du rayon choisi, ou sans distance connue, passe sous un séparateur.
describe('#5069 — le rayon choisi est tenu, l’élargissement se voit', () => {
  const row = (siren: string, zone?: DiscoverCandidateZoneWithPlace) => ({ siren, ...(zone ? { zone } : {}) })

  it('range sous le séparateur un compte élargi hors rayon ou sans distance, sans toucher à l’ordre du reste', () => {
    const list = [
      row('a'),
      row('b', { tier: 'department', area: 'Nord', distanceKm: 40, place: 'Lille' }),
      row('c', { tier: 'radius_50', distanceKm: 12, place: 'Lille' }),
      row('d', { tier: 'region', area: 'Hauts-de-France', place: 'Lille' }),
      row('e'),
    ]
    const { ordered, beyondAt } = splitByRadius(list, 25)
    expect(ordered.map(r => r.siren)).toEqual(['a', 'c', 'e', 'b', 'd'])
    expect(beyondAt).toBe(3)
  })

  it('sans rayon, ou sans rien au-delà : la liste reste intacte et aucun séparateur', () => {
    const list = [row('a'), row('b', { tier: 'department', area: 'Nord', distanceKm: 40 })]
    expect(splitByRadius(list, undefined)).toEqual({ ordered: list, beyondAt: -1 })
    const near = [row('a'), row('b', { tier: 'radius_50', distanceKm: 10 })]
    expect(splitByRadius(near, 25)).toEqual({ ordered: near, beyondAt: -1 })
  })

  it('dit la distance mesurée d’une ligne d’aire, jamais une distance absente', () => {
    expect(
      candidateZoneDistanceText({ tier: 'department', area: 'Nord', distanceKm: 39.6, place: 'Lille' }, 'fr'),
    ).toBe('à 40 km de Lille')
    expect(candidateZoneDistanceText({ tier: 'region', distanceKm: 71, place: 'Lille' }, 'en')).toBe('71 km from Lille')
    expect(candidateZoneDistanceText({ tier: 'department', area: 'Nord', place: 'Lille' }, 'fr')).toBeNull()
    // Un cercle porte déjà sa distance dans son étiquette.
    expect(candidateZoneDistanceText({ tier: 'radius_50', distanceKm: 12, place: 'Lille' }, 'fr')).toBeNull()
    expect(candidateZoneDistanceText(undefined, 'fr')).toBeNull()
  })
})

// #5069 (lot 777) — « Lille à 25 km » : chaque carte dit sa distance, « Élargi » seulement hors rayon.
describe('#5069 (lot 777) — le rayon en km tient carte par carte', () => {
  const row = (siren: string, zone?: DiscoverCandidateZoneWithPlace, belowTarget = false) => ({
    siren,
    belowTarget,
    ...(zone ? { zone } : {}),
  })
  const lowFit = (r: { belowTarget: boolean }) => (r.belowTarget ? 1 : 0)

  it('(a) une carte à ≤ rayon reste AVANT le séparateur et dit « N km », sans « Élargi au département »', () => {
    const lesquin = { tier: 'department', area: 'Nord', distanceKm: 6.4, place: 'Lille' } as const
    const list = [
      row('lesquin', lesquin),
      row('aubigny', { tier: 'department', area: 'Nord', distanceKm: 41, place: 'Lille' }),
    ]
    const { ordered, beyondAt } = splitByRadius(list, 25)
    expect(ordered.map(r => r.siren)).toEqual(['lesquin', 'aubigny'])
    expect(beyondAt).toBe(1)
    expect(candidateZoneLine(lesquin, 'fr', 25)).toBe('à 6 km de Lille')
    expect(candidateZoneLine(lesquin, 'en', 25)).toBe('6 km from Lille')
  })

  it('(b)(c) au-delà : l’élargissement se nomme avec la distance ; distance inconnue = « distance inconnue »', () => {
    const far = { tier: 'department', area: 'Nord', distanceKm: 41, place: 'Lille' } as const
    expect(candidateZoneLine(far, 'fr', 25)).toBe('Élargi au département · Nord · à 41 km de Lille')
    const unknown = { tier: 'department', area: 'Nord', place: 'Lille' } as const
    expect(candidateZoneLine(unknown, 'fr', 25)).toBe('Élargi au département · Nord · distance inconnue')
    expect(candidateZoneLine(unknown, 'en', 25)).toMatch(/distance unknown$/)
    expect(splitByRadius([row('a'), row('u', unknown)], 25)).toMatchObject({ beyondAt: 1 })
  })

  it('sans rayon cherché : l’étiquette d’avant, aucune « distance inconnue » ajoutée', () => {
    const unknown = { tier: 'department', area: 'Nord', place: 'Lille' } as const
    expect(candidateZoneLine(unknown, 'fr', undefined)).toBe('Élargi au département · Nord')
    expect(candidateZoneLine(undefined, 'fr', 25)).toBeNull()
  })

  it('(d) dans chaque partie, les cartes hors cible passent après les autres (ordre stable)', () => {
    const near = (s: string, below = false) =>
      row(s, { tier: 'department', area: 'Nord', distanceKm: 5, place: 'Lille' }, below)
    const far = (s: string, below = false) =>
      row(s, { tier: 'department', area: 'Nord', distanceKm: 60, place: 'Lille' }, below)
    const list = [near('n1', true), near('n2'), far('f1', true), far('f2')]
    const { ordered, beyondAt } = splitByRadius(list, 25, lowFit)
    expect(ordered.map(r => r.siren)).toEqual(['n2', 'n1', 'f2', 'f1'])
    expect(beyondAt).toBe(2)
  })
})
