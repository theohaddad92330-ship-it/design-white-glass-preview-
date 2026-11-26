import { describe, expect, it } from 'vitest'
import type { ProjectRow } from '@bellum/contracts'
import { describeOpportunityProvenance, hasProvenance } from './project-provenance'

const row = (patch: Partial<ProjectRow> = {}): ProjectRow => ({
  id: 'op-1',
  account_id: 'acc-1',
  company_name: 'ACME',
  sector: null,
  logo_url: null,
  website: null,
  kind: 'pain',
  label: 'Migration Cloud',
  detail: null,
  offer: null,
  source: 'pain',
  confidence: 'high',
  urgency: null,
  stage: 'detected',
  stage_entered_at: '2026-07-01T00:00:00.000Z',
  owner_id: null,
  expected_close_on: null,
  closed_at: null,
  outcome: null,
  loss_reason: null,
  first_detected_at: '2026-07-20T10:00:00.000Z',
  updated_at: '2026-07-20T10:00:00.000Z',
  ...patch,
})

describe('describeOpportunityProvenance', () => {
  it('reconnaît les 4 sources de la matérialisation', () => {
    for (const source of ['pain', 'challenge', 'program', 'implication'] as const) {
      expect(describeOpportunityProvenance(row({ source })).sourceKey).toBe(source)
    }
  })

  // #4191 (recette 2, E6) — « BOAMP », « client », « import » s'affichaient bruts sur les cartes du pipe.
  it('reconnaît les sources nommées, quelle que soit la casse stockée', () => {
    for (const [stored, key] of [
      ['BOAMP', 'boamp'],
      ['client', 'client'],
      ['import', 'import'],
      ['Import ', 'import'],
    ] as const) {
      expect(describeOpportunityProvenance(row({ source: stored })).sourceKey).toBe(key)
    }
  })

  it('« BOAMP » se lit « Appel d’offres public » (fr) et « Public tender » (en), jamais « BOAMP »', async () => {
    const { i18n } = await import('@/i18n')
    await i18n.loadNamespaces('projects')
    const key = describeOpportunityProvenance(row({ source: 'BOAMP' })).sourceKey
    expect(i18n.getFixedT('fr', 'projects')(`provenance.sources.${key}`)).toBe("Appel d'offres public")
    expect(i18n.getFixedT('en', 'projects')(`provenance.sources.${key}`)).toBe('Public tender')
  })

  it("rend telle quelle une source hors nomenclature plutôt que de l'écarter", () => {
    const provenance = describeOpportunityProvenance(row({ source: 'hubspot' }))
    expect(provenance.sourceKey).toBeNull()
    expect(provenance.sourceText).toBe('hubspot')
  })

  it('ne fabrique rien quand la colonne est vide — champ absent, pas « inconnu »', () => {
    const provenance = describeOpportunityProvenance(row({ source: null, confidence: '  ' }))
    expect(provenance.sourceKey).toBeNull()
    expect(provenance.sourceText).toBeNull()
    expect(provenance.confidenceKey).toBeNull()
    expect(provenance.confidenceText).toBeNull()
  })

  // #4336.1 — « RECETTE 26/09 » (créée dans Bellum) sortait avec une Origine vide, table ET carte.
  it('une affaire saisie dans Bellum (kind manual) sans source stockée se lit « saisie manuelle »', () => {
    expect(describeOpportunityProvenance(row({ kind: 'manual', source: null })).sourceKey).toBe('manual')
    expect(describeOpportunityProvenance(row({ kind: 'manual', source: '  ' })).sourceKey).toBe('manual')
    // une source stockée garde la main ; une autre nature sans source reste muette
    expect(describeOpportunityProvenance(row({ kind: 'manual', source: 'client' })).sourceKey).toBe('client')
    expect(describeOpportunityProvenance(row({ kind: 'pain', source: null })).sourceKey).toBeNull()
  })

  it('un seul libellé pour la saisie à la main : « Saisi à la main » / « Entered by hand »', async () => {
    const { i18n } = await import('@/i18n')
    await i18n.loadNamespaces('projects')
    expect(i18n.getFixedT('fr', 'projects')('provenance.sources.manual')).toBe('Saisi à la main')
    expect(i18n.getFixedT('fr', 'projects')('kinds.manual')).toBe('Saisi à la main')
    expect(i18n.getFixedT('en', 'projects')('provenance.sources.manual')).toBe('Entered by hand')
    expect(i18n.getFixedT('en', 'projects')('kinds.manual')).toBe('Entered by hand')
  })

  it('mappe les 3 niveaux de confiance stockés', () => {
    expect(describeOpportunityProvenance(row({ confidence: 'medium' })).confidenceKey).toBe('medium')
    expect(describeOpportunityProvenance(row({ confidence: 'low' })).confidenceKey).toBe('low')
  })

  it("n'annonce une fraîcheur que si l'actualisation dit autre chose que la détection", () => {
    expect(describeOpportunityProvenance(row()).refreshedAt).toBeNull()
    expect(describeOpportunityProvenance(row({ updated_at: '2026-07-22T09:00:00.000Z' })).refreshedAt).toBe(
      '2026-07-22T09:00:00.000Z',
    )
  })

  it('ignore une date illisible au lieu de rendre « Invalid Date »', () => {
    expect(describeOpportunityProvenance(row({ updated_at: 'pas-une-date' })).refreshedAt).toBeNull()
  })

  it('une ligne sans aucune provenance ne doit rien afficher', () => {
    const empty = describeOpportunityProvenance(row({ source: null, confidence: null }))
    expect(hasProvenance(empty)).toBe(false)
    expect(hasProvenance(describeOpportunityProvenance(row()))).toBe(true)
  })
})
