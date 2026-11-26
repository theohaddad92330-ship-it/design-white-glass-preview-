import type { Account } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { buildOverviewProvenance } from './TabOverview'
import type { useAccountOverviewData } from './useAccountOverviewData'

/**
 * recette 10/09 — « Sources et confiance » annonçait « Dossier pas encore
 * analysé » sur un compte marqué Terminé, analysé le 13 juillet 2026 à 15:49,
 * fiabilité 72/100. `buildOverviewProvenance` (extrait de `TabOverview` pour
 * ce test) lisait `account.last_analyzed_at` BRUT — `null` sur tout dossier
 * analysé avant le suivi des runs (legacy) — alors que l'entête du dossier
 * (`AccountDetailHero`) et l'onglet Accès (`TabAccess`) lisent déjà
 * `lastAnalyzedDate(account)`, qui retombe honnêtement sur `created_at` pour
 * un compte `completed`. Deux lectures du même fait, sur la MÊME page :
 * l'une le disait, l'autre le niait.
 */
const CREATED = '2026-07-13T15:49:00.000Z'

function account(overrides: Partial<Account> = {}): Account {
  return {
    id: 'a-1',
    status: 'completed',
    created_at: CREATED,
    last_analyzed_at: null,
    apollo_enrichment: null,
    raw_analysis: {},
    ...overrides,
  } as Account
}

const overview = { dossierReliability: 72, confidenceTier: 'high' } as ReturnType<typeof useAccountOverviewData>

describe('buildOverviewProvenance — recette 10/09, un compte Terminé n’est jamais « pas encore analysé »', () => {
  it('un compte legacy (Terminé, sans last_analyzed_at) porte sa date réelle, pas null', () => {
    const provenance = buildOverviewProvenance(account({ status: 'completed', last_analyzed_at: null }), overview)

    expect(provenance.lastAnalyzedAt).toBe(CREATED)
    expect(provenance.lastAnalyzedAt).not.toBeNull()
  })

  it('un compte re-analysé garde la date RÉELLE de complétion, pas created_at', () => {
    const recompleted = '2026-08-01T10:00:00.000Z'
    const provenance = buildOverviewProvenance(
      account({ status: 'completed', last_analyzed_at: recompleted }),
      overview,
    )

    expect(provenance.lastAnalyzedAt).toBe(recompleted)
  })

  it('un compte jamais terminé (analyzing) reste honnêtement « pas encore analysé »', () => {
    const provenance = buildOverviewProvenance(account({ status: 'analyzing', last_analyzed_at: null }), overview)

    expect(provenance.lastAnalyzedAt).toBeNull()
  })
})
