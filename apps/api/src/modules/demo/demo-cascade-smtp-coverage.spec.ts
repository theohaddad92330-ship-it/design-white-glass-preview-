import { demoEnrichmentCoordinates } from './demo-enrichment-trace'
import { densifiedContactsFor } from './demo-contact-density'

/**
 * #4106.4 / #4107.4 — la démo MONTRE la cascade d'enrichissement et l'e-mail deviné puis vérifié.
 * Jamais le NOM d'un fournisseur : un nombre de sources (`sources_queried`) et le drapeau `email_verified`.
 */
const NOW = new Date('2026-10-31T10:00:00Z')

describe('démo — cascade d’enrichissement (#4106.4)', () => {
  it('un contact dont la 1re source est restée vide et la 2e a répondu : coordonnée trouvée, 2 sources interrogées', () => {
    const cascade = densifiedContactsFor('Société Générale').filter(c => c.enrichment_cascade_sources === 2)
    expect(cascade).toHaveLength(1)
    const states = demoEnrichmentCoordinates(cascade[0]!, NOW)
    expect(states?.email).toMatchObject({ state: 'found', sources_queried: 2 })
    expect(states?.phone).toMatchObject({ state: 'found', sources_queried: 2 })
  })

  it('sans la marque, une coordonnée trouvée reste « 1 source » (comportement inchangé)', () => {
    const states = demoEnrichmentCoordinates({ full_name: 'X', email: 'x@y.example', phone: null }, NOW)
    expect(states?.email).toMatchObject({ state: 'found', sources_queried: 1 })
  })

  it('ne nomme aucun fournisseur', () => {
    const [c] = densifiedContactsFor('Société Générale').filter(x => x.enrichment_cascade_sources === 2)
    expect(JSON.stringify(demoEnrichmentCoordinates(c!, NOW))).not.toMatch(
      /apollo|dropcontact|hunter|lusha|kaspr|fullenrich/i,
    )
  })
})

describe('démo — e-mail deviné puis vérifié SMTP (#4107.4)', () => {
  it('UN contact porte l’e-mail vérifié, les autres non', () => {
    // #4107.4 (recette D3 01/11) — sur SNCF, le compte que la recette ouvre ; aucun vérifié chez Société Générale.
    expect(densifiedContactsFor('Société Générale').filter(c => c.email_verified === true)).toHaveLength(0)
    const all = densifiedContactsFor('SNCF')
    const verified = all.filter(c => c.email_verified === true)
    expect(verified).toHaveLength(1)
    expect(verified[0]!.email).toBeTruthy()
  })
})
