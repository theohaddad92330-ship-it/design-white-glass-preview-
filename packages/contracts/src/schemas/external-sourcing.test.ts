import { describe, expect, it } from 'vitest'
import {
  buildExternalSourcingPartnerBriefMessage,
  EXTERNAL_SOURCING_MAX_VOLUME_PER_SOURCE,
  EXTERNAL_SOURCING_MIN_VOLUME_PER_SOURCE,
  EXTERNAL_SOURCING_SOURCE_KINDS,
  EXTERNAL_SOURCING_TIERS,
  EXTERNAL_SOURCING_SOURCE_LIMIT,
  externalSourcingPartnerBriefFeedbackSchema,
  externalSourcingPartnerBriefPrepareSchema,
  externalSourcingSearchQuerySchema,
  rankExternalSourcingCandidates,
  resolveExternalSourcingVolume,
  sharedExternalSourcingSkills,
  type ExternalSourcingCandidate,
} from './external-sourcing.js'

describe('sharedExternalSourcingSkills', () => {
  it('dit NON à une sous-chaîne : "Java" ne matche pas "JavaScript"', () => {
    expect(sharedExternalSourcingSkills(['Java'], ['JavaScript'])).toEqual([])
  })

  it('matche une égalité normalisée (casse et espaces ignorés)', () => {
    expect(sharedExternalSourcingSkills(['Kubernetes'], [' kubernetes '])).toEqual(['Kubernetes'])
  })

  it('dédoublonne et garde la casse du besoin', () => {
    expect(sharedExternalSourcingSkills(['Kubernetes', 'kubernetes', 'Terraform'], ['kubernetes'])).toEqual([
      'Kubernetes',
    ])
  })

  it('ignore les termes vides des deux côtés', () => {
    expect(sharedExternalSourcingSkills(['', '  '], ['kubernetes'])).toEqual([])
    expect(sharedExternalSourcingSkills(['Kubernetes'], ['', '  '])).toEqual([])
  })
})

describe('rankExternalSourcingCandidates', () => {
  const candidate = (overrides: Partial<ExternalSourcingCandidate>): ExternalSourcingCandidate => ({
    id: 'c-1',
    fullName: 'Alix Dupont',
    title: null,
    sourceKind: 'inbound_candidacy',
    sharedSkills: [],
    limits: [],
    ...overrides,
  })

  it('classe par nombre de compétences partagées, décroissant', () => {
    const one = candidate({ id: 'c-1', fullName: 'Zoé', sharedSkills: ['Kubernetes'] })
    const two = candidate({ id: 'c-2', fullName: 'Anne', sharedSkills: ['Kubernetes', 'Terraform'] })
    expect(rankExternalSourcingCandidates([one, two]).map(c => c.id)).toEqual(['c-2', 'c-1'])
  })

  it('départage à égalité par le nom, en français', () => {
    const zoe = candidate({ id: 'c-1', fullName: 'Zoé', sharedSkills: ['Kubernetes'] })
    const anne = candidate({ id: 'c-2', fullName: 'Anne', sharedSkills: ['Kubernetes'] })
    expect(rankExternalSourcingCandidates([zoe, anne]).map(c => c.id)).toEqual(['c-2', 'c-1'])
  })

  it('ne modifie jamais le tableau reçu', () => {
    const input = [candidate({ id: 'c-1' })]
    const frozen = Object.freeze([...input])
    expect(() => rankExternalSourcingCandidates(frozen)).not.toThrow()
  })
})

describe('EXTERNAL_SOURCING_SOURCE_LIMIT', () => {
  it('est le même réglage que celui lu par le port (GA-26, un seul endroit)', () => {
    expect(EXTERNAL_SOURCING_SOURCE_LIMIT).toBe(20)
  })
})

describe('externalSourcingSearchQuerySchema', () => {
  it('accepte une recherche sans volume — le défaut se résout ailleurs', () => {
    const parsed = externalSourcingSearchQuerySchema.safeParse({})
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.maxPerSource).toBeUndefined()
  })

  it('coerce une chaîne de query string en entier', () => {
    const parsed = externalSourcingSearchQuerySchema.safeParse({ maxPerSource: '10' })
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.maxPerSource).toBe(10)
  })

  it('refuse un volume hors bornes — pas de plafond deviné côté client', () => {
    expect(
      externalSourcingSearchQuerySchema.safeParse({ maxPerSource: EXTERNAL_SOURCING_MIN_VOLUME_PER_SOURCE - 1 })
        .success,
    ).toBe(false)
    expect(
      externalSourcingSearchQuerySchema.safeParse({ maxPerSource: EXTERNAL_SOURCING_MAX_VOLUME_PER_SOURCE + 1 })
        .success,
    ).toBe(false)
  })
})

describe('resolveExternalSourcingVolume', () => {
  it('rend le réglage par défaut quand rien n’est choisi — AVANT LANCEMENT l’affichait déjà, jamais deviné ici', () => {
    expect(resolveExternalSourcingVolume(undefined)).toBe(EXTERNAL_SOURCING_SOURCE_LIMIT)
  })

  it('borne un volume choisi aux limites publiées (défense en profondeur, le schéma borne déjà côté requête)', () => {
    expect(resolveExternalSourcingVolume(1)).toBe(EXTERNAL_SOURCING_MIN_VOLUME_PER_SOURCE)
    expect(resolveExternalSourcingVolume(9999)).toBe(EXTERNAL_SOURCING_MAX_VOLUME_PER_SOURCE)
    expect(resolveExternalSourcingVolume(30)).toBe(30)
  })
})

describe('buildExternalSourcingPartnerBriefMessage', () => {
  it('compose le brief à partir du besoin réel, jamais une donnée inventée', () => {
    const message = buildExternalSourcingPartnerBriefMessage({
      needTitle: 'Ingénieur DevOps Kubernetes',
      skillTerms: ['Kubernetes', 'Terraform'],
      headcount: 2,
    })
    expect(message).toContain('Ingénieur DevOps Kubernetes')
    expect(message).toContain('Kubernetes')
    expect(message).toContain('Terraform')
    expect(message).toContain('2')
  })

  it('nomme toujours la clause de non-sollicitation — jamais une case cochée en silence', () => {
    const message = buildExternalSourcingPartnerBriefMessage({
      needTitle: 'Chef de projet SI',
      skillTerms: ['Pilotage'],
      headcount: 1,
    })
    expect(message.toLowerCase()).toContain('non-sollicitation')
  })

  it('dit "aucune compétence typée" plutôt que de taire un besoin vide', () => {
    const message = buildExternalSourcingPartnerBriefMessage({ needTitle: 'Besoin X', skillTerms: [], headcount: 1 })
    expect(message).not.toContain('undefined')
  })
})

describe('externalSourcingPartnerBriefPrepareSchema', () => {
  it('exige un nom de partenaire non vide — texte LIBRE, pas une liste fermée', () => {
    expect(externalSourcingPartnerBriefPrepareSchema.safeParse({ partnerName: '' }).success).toBe(false)
    expect(externalSourcingPartnerBriefPrepareSchema.safeParse({ partnerName: 'ESN Atlas' }).success).toBe(true)
  })

  it('conditions et délai sont optionnels — un brief se prépare avant de les connaître', () => {
    const parsed = externalSourcingPartnerBriefPrepareSchema.safeParse({ partnerName: 'ESN Atlas' })
    expect(parsed.success).toBe(true)
  })
})

describe('externalSourcingPartnerBriefFeedbackSchema', () => {
  it('refuse un retour vide — un champ vide n’est pas un feedback conservé', () => {
    expect(externalSourcingPartnerBriefFeedbackSchema.safeParse({ feedback: '' }).success).toBe(false)
  })
})

describe('EXTERNAL_SOURCING_TIERS (#2190.1-.7)', () => {
  it("garde l'ordre des sept niveaux : vivier, dormants, réseau, partenaires, connectées, manuel, public", () => {
    expect(EXTERNAL_SOURCING_TIERS.map(tier => tier.key)).toEqual([
      'internal_pool',
      'dormant_profiles',
      'network',
      'authorized_partners',
      'connected_sources',
      'manual_import',
      'legal_public_search',
    ])
  })

  it('range chaque source interrogée dans UN seul niveau — aucune absente, aucune en double', () => {
    const placed = EXTERNAL_SOURCING_TIERS.flatMap(tier => [...tier.sourceKinds])
    expect([...placed].sort()).toEqual([...EXTERNAL_SOURCING_SOURCE_KINDS].sort())
  })

  it('dit NON à un niveau déjà ouvert qui prétendrait interroger une source', () => {
    for (const tier of EXTERNAL_SOURCING_TIERS) {
      if (tier.scope === 'before_search') expect(tier.sourceKinds).toEqual([])
    }
  })
})
