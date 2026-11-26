import { enrichmentCooldown, missingEnrichmentChannels } from '@bellum/contracts'
import { DEMO_DOSSIERS } from './demo-dataset'
import { DEMO_RECENTLY_ENRICHED_CONTACT_COVERAGE } from './demo-coverage'

/**
 * #2297.26 reste (30/09/2026) — « RÉCEMMENT ENRICHIS », JAMAIS OBSERVABLE EN
 * DÉMONSTRATION.
 *
 * `bulkEnrichmentExclusionReason` (`packages/contracts/…/contact-views.ts`)
 * et `EnrichConfirmDialog.tsx` savent déjà rendre `on_cooldown` — un contact
 * dont un enrichissement récent n'a rien trouvé de neuf. Aucun contact du jeu
 * de démonstration ne reproduisait cet état : la ligne « contacts déjà
 * enrichis récemment » n'apparaissait dans AUCUN aperçu de lot en salle.
 *
 * Cette garde SAIT DIRE NON : elle rejoue, sur le jeu réellement construit
 * (`DEMO_DOSSIERS`, post-densification), la MÊME transformation que
 * `DemoSeedService.demoContactRow` applique à
 * `recently_enriched_no_result_days_ago` avant d'écrire `last_enrichment_at` /
 * `last_enrichment_result` / `last_enrichment_missing` — puis fait tourner la
 * MÊME lecture que l'écran (`enrichmentCooldown`) dessus.
 */
type DemoSeedLike = {
  email?: string | null
  phone?: string | null
  linkedin_url?: string | null
  recently_enriched_no_result_days_ago?: number
}

/** La même écriture que `DemoSeedService.demoContactRow` (`demo-seed.service.ts`). */
function demoEnrichmentTrace(contact: DemoSeedLike, now: Date) {
  if (contact.recently_enriched_no_result_days_ago === undefined) return null
  return {
    email: contact.email ?? null,
    phone: contact.phone ?? null,
    linkedin_url: contact.linkedin_url ?? null,
    last_enrichment_at: new Date(now.getTime() - contact.recently_enriched_no_result_days_ago * 86_400_000),
    last_enrichment_result: 'no_new_data',
    last_enrichment_missing: missingEnrichmentChannels({
      email: contact.email ?? null,
      linkedin_url: contact.linkedin_url ?? null,
      phone: contact.phone ?? null,
    }),
  }
}

describe('couverture démo — « récemment enrichis » (#2297.26)', () => {
  it('lit un corpus NON VIDE — sans lui, la garde passerait au vert sur du vide', () => {
    expect(DEMO_DOSSIERS.length).toBeGreaterThan(0)
    expect(DEMO_DOSSIERS.some(dossier => dossier.contacts.length > 0)).toBe(true)
  })

  it('porte AU MOINS un contact sous délai de protection, sur un compte de démo réel', () => {
    const now = new Date()
    const matches = DEMO_DOSSIERS.flatMap(dossier =>
      dossier.contacts
        .map(contact => demoEnrichmentTrace(contact, now))
        .filter(
          (trace): trace is NonNullable<typeof trace> => trace !== null && enrichmentCooldown(trace, now) !== null,
        ),
    )
    expect(matches.length).toBeGreaterThan(0)
  })

  it('le contact sous délai de protection est visible chez SNCF, sans aucune coordonnée', () => {
    const sncf = DEMO_DOSSIERS.find(dossier => dossier.account.company_name === 'SNCF')
    expect(sncf).toBeDefined()
    const now = new Date()
    const matches = (sncf?.contacts ?? [])
      .map(contact => demoEnrichmentTrace(contact, now))
      .filter((trace): trace is NonNullable<typeof trace> => trace !== null && enrichmentCooldown(trace, now) !== null)
    expect(matches.length).toBeGreaterThan(0)
    // Sans coordonnée : sinon `already_has_contact_info` gagnerait avant `on_cooldown`.
    expect(matches[0]?.email).toBeFalsy()
    expect(matches[0]?.phone).toBeFalsy()
  })

  it('reste classée SEEDÉE, avec sa raison écrite', () => {
    expect(DEMO_RECENTLY_ENRICHED_CONTACT_COVERAGE.state).toBe('seede')
    expect(DEMO_RECENTLY_ENRICHED_CONTACT_COVERAGE.reason.length).toBeGreaterThan(200)
  })
})
