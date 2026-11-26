import { DEMO_DELIVERY_CLIENT, DEMO_MESSAGE_DRAFT_VERSION_SEED_SPECS } from './demo-dataset'

/**
 * #3696 (parité démo, lot K12 07/10) — un brouillon + une variante précédente
 * déjà là à l'ouverture du panneau Contacter, sans geste du commercial.
 */
describe('lot K12 — le fil persisté de Nadia Perrin prouve la parité démo (#3696)', () => {
  const contacts = DEMO_DELIVERY_CLIENT.contacts

  it('lit un corpus NON VIDE — au moins un brouillon ET une variante précédente, même contact/canal', () => {
    expect(DEMO_MESSAGE_DRAFT_VERSION_SEED_SPECS.length).toBeGreaterThanOrEqual(2)
    const [first, second] = DEMO_MESSAGE_DRAFT_VERSION_SEED_SPECS
    expect(first?.contact).toBe(second?.contact)
    expect(first?.channel).toBe(second?.channel)
  })

  it('le contact visé existe réellement dans le jeu de démonstration (aucun contact fictif créé pour l’occasion)', () => {
    const names = new Set(contacts.map(contact => contact.full_name))
    for (const seed of DEMO_MESSAGE_DRAFT_VERSION_SEED_SPECS) expect(names.has(seed.contact)).toBe(true)
  })

  it('les lignes sont dans l’ordre d’apparition : la plus ANCIENNE (jours écoulés le plus grand) est la variante précédente', () => {
    const [previous, current] = DEMO_MESSAGE_DRAFT_VERSION_SEED_SPECS
    expect(previous!.createdDaysAgo).toBeGreaterThan(current!.createdDaysAgo)
  })

  it('chaque ligne porte un objet et un corps non vides', () => {
    for (const seed of DEMO_MESSAGE_DRAFT_VERSION_SEED_SPECS) {
      expect(seed.subject.trim().length).toBeGreaterThan(0)
      expect(seed.body.trim().length).toBeGreaterThan(0)
    }
  })

  it('sait dire NON — un contact non visé par ce semis ne porte aucune ligne', () => {
    const other = contacts.find(contact => contact.full_name !== 'Nadia Perrin')
    expect(other).toBeDefined()
    expect(DEMO_MESSAGE_DRAFT_VERSION_SEED_SPECS.some(seed => seed.contact === other?.full_name)).toBe(false)
  })
})
