import { DEMO_CONSULTANTS } from './demo-dataset'

/**
 * Théo C talents-vivier (craft rule n°9) — la colonne « Disponibilité & planning », le score et « Mes favoris »
 * se VOIENT en démonstration : un écran livré mais vide se découvre en réunion, pas en CI.
 *
 * Chaque état que la colonne distingue doit avoir au moins UN profil de la salle (nos vrais comptes, pas le monde
 * fictif de Théo) — et sait dire NON : un jeu où tout le monde est « à reconfirmer » ne démontre rien.
 */
describe('vivier de démonstration — les états de disponibilité, le score et les favoris', () => {
  const POSITIVE = new Set(['immediate', 'sous_1_mois', 'sous_3_mois'])
  const positive = DEMO_CONSULTANTS.filter(item => POSITIVE.has(item.availability))

  it('une confirmation RÉCENTE (disponibilité confirmée)', () => {
    expect(positive.some(item => (item.availability_checked_days_ago ?? Infinity) <= 60)).toBe(true)
  })

  it('une confirmation PÉRIMÉE (« À reconfirmer · confirmation il y a N jours »)', () => {
    expect(positive.some(item => (item.availability_checked_days_ago ?? 0) > 60)).toBe(true)
  })

  it('une déclaration JAMAIS confirmée (« À reconfirmer · sans confirmation »)', () => {
    expect(positive.some(item => item.availability_checked_days_ago === undefined)).toBe(true)
  })

  it('une disponibilité inconnue : « Non renseignée », rien de supposé', () => {
    expect(DEMO_CONSULTANTS.some(item => item.availability === 'inconnu')).toBe(true)
  })

  it('des dates annoncées À VENIR (déclaration datée) à côté de dates déjà échues', () => {
    expect(positive.some(item => (item.available_in_days ?? 0) > 0)).toBe(true)
    expect(positive.some(item => item.available_in_days === 0)).toBe(true)
  })

  it('des compétences PROUVÉES sur plusieurs profils, jamais sur tous', () => {
    const proven = DEMO_CONSULTANTS.filter(item => (item.proven_skill_count ?? 0) > 0)
    expect(proven.length).toBeGreaterThanOrEqual(3)
    expect(proven.length).toBeLessThan(DEMO_CONSULTANTS.length)
    for (const item of proven) expect(item.proven_skill_count).toBeLessThanOrEqual(item.stack.length)
  })

  it('« Mes favoris » : au moins deux profils, jamais tout le vivier', () => {
    const favorites = DEMO_CONSULTANTS.filter(item => item.favorite)
    expect(favorites.length).toBeGreaterThanOrEqual(2)
    expect(favorites.length).toBeLessThan(DEMO_CONSULTANTS.length)
  })

  it('un référent NOMMÉ sur certains profils (colonne « Suivi »), « non attribué » sur les autres', () => {
    const owned = DEMO_CONSULTANTS.filter(item => item.owned_by_visitor)
    expect(owned.length).toBeGreaterThanOrEqual(1)
    expect(owned.length).toBeLessThan(DEMO_CONSULTANTS.length)
  })
})
