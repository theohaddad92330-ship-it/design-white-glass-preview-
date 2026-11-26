import { bulkEnrichmentExclusionReason, missingEnrichmentChannels } from '@bellum/contracts'
import { DEMO_DOSSIERS } from './demo-dataset'

/**
 * #2297 (lot X68, recette prod 02/10 Y18) — « Reste : cas mixte (Hugo + contact
 * sans coordonnée) et dialogue » : la recette ne pouvait pas JOUER la sélection
 * mixte. Elle est jouable quand, chez SNCF, trois contacts réels du jeu se
 * répartissent entre les trois issues de l'aperçu de lot :
 *  - facturable (aucune coordonnée, identité résolue) — « Enrichir maintenant » actif ;
 *  - déjà enrichi récemment sans résultat (`on_cooldown`) — Hugo Delannoy ;
 *  - coordonnées PARTIELLES (un LinkedIn, ni e-mail ni téléphone) — « coordonnée déjà là ».
 * Même transformation que `DemoSeedService.demoContactRow` (voir la garde voisine
 * `demo-recently-enriched-contact-coverage.spec.ts`). Sait dire NON : retirer l'un
 * des trois profils la fait rougir.
 */
/** Champ posé par la densification des contacts (voir la garde voisine) — absent du type `DemoContact`. */
const daysAgo = (contact: object): number | undefined =>
  (contact as { recently_enriched_no_result_days_ago?: number }).recently_enriched_no_result_days_ago

describe('couverture démo — sélection mixte d’enrichissement (#2297)', () => {
  const now = new Date()
  const sncf = DEMO_DOSSIERS.find(dossier => dossier.account.company_name === 'SNCF')
  const reasons = (sncf?.contacts ?? []).map(contact => ({
    name: contact.full_name,
    partial: !!contact.linkedin_url && !contact.email && !contact.phone,
    reason: bulkEnrichmentExclusionReason(
      {
        full_name: contact.full_name,
        email: contact.email ?? null,
        phone: contact.phone ?? null,
        linkedin_url: contact.linkedin_url ?? null,
        last_enrichment_at:
          daysAgo(contact) === undefined
            ? null
            : new Date(now.getTime() - (daysAgo(contact) ?? 0) * 86_400_000).toISOString(),
        last_enrichment_result: daysAgo(contact) === undefined ? null : 'no_new_data',
        last_enrichment_missing:
          daysAgo(contact) === undefined
            ? null
            : missingEnrichmentChannels({
                email: contact.email ?? null,
                linkedin_url: contact.linkedin_url ?? null,
                phone: contact.phone ?? null,
              }),
      },
      now,
    ),
  }))

  it('lit un corpus NON VIDE', () => {
    expect(reasons.length).toBeGreaterThan(3)
  })

  it('un contact facturable (aucune coordonnée) — « Enrichir maintenant » est actif', () => {
    expect(reasons.some(entry => entry.reason === null)).toBe(true)
  })

  it('Hugo Delannoy est sous délai de protection', () => {
    expect(reasons.find(entry => entry.name === 'Hugo Delannoy')?.reason).toBe('on_cooldown')
  })

  it('un contact aux coordonnées PARTIELLES (un LinkedIn, ni e-mail ni téléphone) reste facturable', () => {
    const partial = reasons.filter(entry => entry.partial)
    expect(partial.length).toBeGreaterThan(0)
    for (const entry of partial) expect(entry.reason).toBeNull()
  })

  it('la sélection Hugo + contact partiel donne un lot MIXTE : 1 facturable, 1 exclu « récemment enrichi »', () => {
    const hugo = reasons.find(entry => entry.name === 'Hugo Delannoy')
    const partial = reasons.find(entry => entry.partial)
    const picked = [hugo, partial].filter(entry => entry !== undefined)
    expect(picked).toHaveLength(2)
    expect(picked.filter(entry => entry.reason === null)).toHaveLength(1)
    expect(picked.filter(entry => entry.reason === 'on_cooldown')).toHaveLength(1)
  })
})
