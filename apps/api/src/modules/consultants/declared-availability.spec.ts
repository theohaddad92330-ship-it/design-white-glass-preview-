import { effectiveDeclaredAvailability } from './declared-availability'

const NOW = new Date('2026-09-21T12:00:00.000Z')
const RECENT = new Date('2026-08-25T00:00:00.000Z') // 27 jours avant NOW
const OLD = new Date('2026-06-01T00:00:00.000Z') // > 60 jours avant NOW

/**
 * #2186.14 — après expiration, une disponibilité déclarée bascule SEULE en
 * « à confirmer », jamais en silence sur « disponible ».
 *
 * Réutilise le SEUIL déjà tranché pour le score poussable (60 jours,
 * `availabilityIsStale`, `matching/pushable.ts`) plutôt que d'en inventer un
 * second : « un réglage vit à un seul endroit » (GA-26). C'est aussi pour ça
 * que `a_confirmer` n'entre jamais en base — la bascule doit avoir lieu SEULE,
 * sans qu'un humain n'ait à la poser.
 */
describe('effectiveDeclaredAvailability', () => {
  it('reste `immediate` quand la vérification est récente', () => {
    expect(effectiveDeclaredAvailability('immediate', RECENT, NOW)).toBe('immediate')
  })

  it('bascule `immediate` en `a_confirmer` au-delà du seuil de revalidation', () => {
    expect(effectiveDeclaredAvailability('immediate', OLD, NOW)).toBe('a_confirmer')
  })

  it('bascule aussi `sous_1_mois` et `sous_3_mois` — les trois états qui PROMETTENT', () => {
    expect(effectiveDeclaredAvailability('sous_1_mois', OLD, NOW)).toBe('a_confirmer')
    expect(effectiveDeclaredAvailability('sous_3_mois', OLD, NOW)).toBe('a_confirmer')
  })

  it('ne bascule JAMAIS `indisponible`, `en_mission` ou `inconnu` — ils ne deviennent pas plus optimistes avec le temps', () => {
    expect(effectiveDeclaredAvailability('indisponible', OLD, NOW)).toBe('indisponible')
    expect(effectiveDeclaredAvailability('en_mission', OLD, NOW)).toBe('en_mission')
    expect(effectiveDeclaredAvailability('inconnu', OLD, NOW)).toBe('inconnu')
  })

  it('sans vérification connue (`null`), reste tel quel — jamais vérifié n’est pas périmé', () => {
    expect(effectiveDeclaredAvailability('immediate', null, NOW)).toBe('immediate')
  })

  it('accepte une chaîne ISO autant qu’un `Date`', () => {
    expect(effectiveDeclaredAvailability('immediate', OLD.toISOString(), NOW)).toBe('a_confirmer')
  })
})
