import { defaultParseSearch, defaultStringifySearch } from '@tanstack/react-router'
import { describe, expect, it } from 'vitest'
import { buildRegistryQuery, emptyRegistryFilters } from './discover-query'
import {
  countActiveFilters,
  emptyUnifiedFilters,
  registryPart,
  widenZoneOneStep,
  type UnifiedFilters,
} from './discover-filters'
import { filtersFromSearch, searchFromFilters } from './discover-prefill'
import { CITY_RADIUS_OPTIONS, DEFAULT_CITY_RADIUS_KM } from './discover-types'

/**
 * Louis 01/11/2026 (#4515, RÉVISE #4641 du 27/10 : 100 km) — une ville seule cherche à 25 km par défaut, affiché,
 * modifiable, RÉELLEMENT envoyé et ÉCRIT dans l'URL. L'élargissement automatique (#4429 / #4675 : 100 km, département,
 * région) est côté service IA et reste. Garde #3876 (le rayon est affiché, jamais un département silencieux).
 */
describe('#4515 — ville = 25 km par défaut', () => {
  it('le défaut du rail est 25 km, et 100 km reste un choix de la liste', () => {
    expect(DEFAULT_CITY_RADIUS_KM).toBe('25')
    expect(CITY_RADIUS_OPTIONS).toEqual(['any', '10', '25', '50', '100'])
    expect(emptyRegistryFilters().cityRadiusKm).toBe('25')
    expect(emptyUnifiedFilters().cityRadiusKm).toBe('25')
  })

  it('une ville seule envoie le rayon de 25 km', () => {
    const filters = { ...emptyUnifiedFilters(), city: 'Lille' }
    expect(buildRegistryQuery(registryPart(filters)).filters).toMatchObject({ city: 'Lille', radiusKm: 25 })
  })

  it('un rayon plus étroit reste choisissable et part tel quel', () => {
    const filters = { ...emptyUnifiedFilters(), city: 'Lille', cityRadiusKm: '100' as const }
    expect(buildRegistryQuery(registryPart(filters)).filters).toMatchObject({ city: 'Lille', radiusKm: 100 })
    expect(countActiveFilters(filters)).toBe(2)
  })

  it('sans ville, aucun rayon ne part (un cercle sans centre)', () => {
    expect(buildRegistryQuery(registryPart(emptyUnifiedFilters())).filters).not.toHaveProperty('radiusKm')
  })

  it('le rayon par défaut ne compte pas comme un filtre de plus', () => {
    expect(countActiveFilters({ ...emptyUnifiedFilters(), city: 'Lille' })).toBe(1)
  })

  it('aller-retour URL : le défaut s’écrit (25) dès qu’une ville est posée, sans ville rien ne s’écrit', () => {
    expect(searchFromFilters({ ...emptyUnifiedFilters(), city: 'Lille' }).cityRadiusKm).toBe(25)
    expect(searchFromFilters(emptyUnifiedFilters()).cityRadiusKm).toBeUndefined()
    expect(searchFromFilters({ ...emptyUnifiedFilters(), city: 'Lille', cityRadiusKm: '100' }).cityRadiusKm).toBe(100)
    expect(searchFromFilters({ ...emptyUnifiedFilters(), city: 'Lille', cityRadiusKm: '50' }).cityRadiusKm).toBe(50)
    expect(searchFromFilters({ ...emptyUnifiedFilters(), city: 'Lille', cityRadiusKm: 'any' }).cityRadiusKm).toBe('any')
    expect(searchFromFilters({ ...emptyUnifiedFilters(), city: 'Lille', cityRadiusKm: '25' }).cityRadiusKm).toBe(25)
  })

  it.each([
    ['"25"'],
    ['25'],
    [25],
    ['"100"', '100'],
    [100, '100'],
    ['"50"', '50'],
    [50, '50'],
    ['any', 'any'],
    ['"any"', 'any'],
  ])('relit cityRadiusKm=%s correctement', (raw, expected = '25') => {
    expect(filtersFromSearch({ city: 'Lille', cityRadiusKm: raw })?.cityRadiusKm).toBe(expected)
  })

  it('une ville sans rayon dans l’URL (liens d’avant) prend le défaut de 25 km', () => {
    expect(filtersFromSearch({ city: 'Lille' })?.cityRadiusKm).toBe('25')
  })

  it('aller-retour URL : cityRadiusKm=25 posé à la main se relit 25 et se réécrit 25, sans guillemets', () => {
    const back = filtersFromSearch({ city: 'Lille', cityRadiusKm: '"25"' })
    expect(back?.cityRadiusKm).toBe('25')
    expect(back && searchFromFilters(back).cityRadiusKm).toBe(25)
  })

  it('sait dire NON : un rayon inconnu ne devient pas un rayon deviné', () => {
    expect(filtersFromSearch({ city: 'Lille', cityRadiusKm: '"37"' })?.cityRadiusKm).toBe('25')
    expect(filtersFromSearch({ city: 'Lille', cityRadiusKm: '150' })?.cityRadiusKm).toBe('25')
  })

  // #4640 — l'élargissement AUTOMATIQUE s'arrête à la grande région ; la France reste un geste EXPLICITE : depuis une
  // ville seule au rayon par défaut, « Élargir la zone » retire la ville (plus aucune zone = toute la France).
  it('le geste manuel vers toute la France reste possible, et explicite', () => {
    const wider = widenZoneOneStep({ ...emptyUnifiedFilters(), city: 'Lille' })
    expect(wider.city).toBe('')
    expect(buildRegistryQuery(registryPart(wider)).filters).not.toHaveProperty('city')
    expect(buildRegistryQuery(registryPart(wider)).filters).not.toHaveProperty('radiusKm')
  })
})

/**
 * #4515.2 — la preuve est l'URL que le ROUTEUR écrit, pas la valeur de la fonction : un `'50'` (chaîne) y devient
 * `"50"` (JSON), et c'est ce que l'écran a montré le 24/10 alors que le test ci-dessus passait.
 */
describe('#4515.2 — l’URL réellement écrite par le routeur', () => {
  const urlFor = (cityRadiusKm: UnifiedFilters['cityRadiusKm']) =>
    defaultStringifySearch({ ...searchFromFilters({ ...emptyUnifiedFilters(), city: 'Lille', cityRadiusKm }) })

  it.each([
    ['50', '?city=Lille&cityRadiusKm=50'],
    ['100', '?city=Lille&cityRadiusKm=100'],
    ['10', '?city=Lille&cityRadiusKm=10'],
    ['any', '?city=Lille&cityRadiusKm=any'],
  ] as const)('rayon %s → %s, caractère pour caractère', (radius, expected) => {
    expect(urlFor(radius)).toBe(expected)
  })

  it('aucun guillemet (brut ni encodé) dans l’URL', () => {
    expect(urlFor('50')).not.toMatch(/"|%22/)
  })

  it('le rayon par défaut est écrit, 25', () => {
    expect(urlFor('25')).toBe('?city=Lille&cityRadiusKm=25')
  })

  it.each(['10', '25', '50', '100', 'any'] as const)('aller-retour URL complet : %s', radius => {
    const parsed = defaultParseSearch(urlFor(radius))
    expect(filtersFromSearch(parsed)?.cityRadiusKm).toBe(radius)
  })
})
