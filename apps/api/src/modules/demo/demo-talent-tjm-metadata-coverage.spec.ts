import { DEMO_TALENT_TJM_METADATA_COVERAGE } from './demo-coverage'
import { DEMO_CONSULTANTS } from './demo-dataset'

/**
 * #2948 (#2329.12/.13/.14/.16, TALENT READINESS) — `consultants.tjm_metadata`
 * (devise, source, contexte, date d'observation, confidentialité), livré
 * lot g12 (26/09) mais jamais semé : la vérification du 26/09 (issue #2948,
 * commentaire de bilan) l'a nommé comme le seul manque restant pour une fiche
 * consultant sous `finance:read`.
 *
 * Même patron que `demo-talent-filters-coverage.spec.ts` : un corpus non vide,
 * des valeurs VARIÉES (pas toutes identiques), et un vivier qui garde aussi des
 * fiches SANS métadonnée — « non renseigné » reste l'état ordinaire de la
 * majorité, comme pour `consent_given_days_ago`/`travel_acceptance` juste
 * au-dessus dans le même jeu de données.
 *
 * `observed_at_days_ago` est un décalage en jours (comme `last_contact_days_ago`),
 * pas encore la date ISO du contrat — `DemoSeedService` fait la conversion, une
 * fixture figée aurait vieilli la date à chaque relecture de ce fichier.
 */
describe('couverture du TJM du vivier — tjm_metadata (#2329.12-.16)', () => {
  it('lit un corpus NON VIDE', () => {
    expect(DEMO_CONSULTANTS.length).toBeGreaterThanOrEqual(5)
  })

  it('au moins un profil porte une métadonnée, au moins un profil n’en porte aucune', () => {
    const withMetadata = DEMO_CONSULTANTS.filter(consultant => consultant.tjm_metadata != null)
    const withoutMetadata = DEMO_CONSULTANTS.filter(consultant => consultant.tjm_metadata == null)
    expect(withMetadata.length).toBeGreaterThan(0)
    expect(withoutMetadata.length).toBeGreaterThan(0)
  })

  it('les métadonnées portent une devise ISO 4217 et une source ou un contexte non vides', () => {
    const withMetadata = DEMO_CONSULTANTS.map(consultant => consultant.tjm_metadata).filter(
      (metadata): metadata is NonNullable<(typeof DEMO_CONSULTANTS)[number]['tjm_metadata']> => metadata != null,
    )
    expect(withMetadata.length).toBeGreaterThan(0)
    for (const metadata of withMetadata) {
      expect(metadata.currency).toMatch(/^[A-Z]{3}$/)
      expect(Boolean(metadata.source) || Boolean(metadata.context)).toBe(true)
    }
  })

  it('au moins un profil porte une métadonnée CONFIDENTIELLE — l’axe #2329.16 doit avoir une fiche à montrer', () => {
    expect(DEMO_CONSULTANTS.some(consultant => consultant.tjm_metadata?.confidential === true)).toBe(true)
  })

  it('au moins un profil date son TJM — l’axe #2329.13/.44 (contexte historique) a une fiche à montrer', () => {
    expect(DEMO_CONSULTANTS.some(consultant => typeof consultant.tjm_metadata?.observed_at_days_ago === 'number')).toBe(
      true,
    )
  })

  it('la capacité est classée dans le registre de couverture, avec une raison qui tient', () => {
    expect(DEMO_TALENT_TJM_METADATA_COVERAGE.state).toBe('seede')
    expect(DEMO_TALENT_TJM_METADATA_COVERAGE.reason.length).toBeGreaterThan(60)
  })
})
