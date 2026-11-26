import { describe, expect, it } from 'vitest'
import {
  buildExpertiseCredibilityAudit,
  createExpertiseGroundingSchema,
  EXPERTISE_GROUNDING_ANSWER_KEYS,
  EXPERTISE_GROUNDING_KINDS,
  projectExpertiseGroundings,
  updateExpertiseGroundingSchema,
  type ExpertiseGrounding,
} from './expertise-grounding.js'

function stored(partial: Partial<ExpertiseGrounding>): ExpertiseGrounding {
  return {
    id: 'g-1',
    expertiseKey: 'Data & Intelligence Artificielle',
    kind: 'client_reference',
    state: 'declared',
    stateSource: 'user',
    sourceType: null,
    sourceId: null,
    sourceLabel: null,
    label: null,
    confidentiality: null,
    archivedAt: null,
    createdAt: '2026-09-28T10:00:00.000Z',
    updatedAt: '2026-09-28T10:00:00.000Z',
    ...partial,
  }
}

describe('expertise-grounding — le modèle relationnel expertise ↔ fondement (#2880)', () => {
  it('les types de fondement sont EXACTEMENT ceux que pose déjà `credibilite-preuves.ts`', () => {
    expect([...EXPERTISE_GROUNDING_KINDS].sort()).toEqual(
      ['client_reference', 'development_intent', 'partner', 'personal_experience', 'talent_pool'].sort(),
    )
    expect(Object.values(EXPERTISE_GROUNDING_ANSWER_KEYS).sort()).toEqual(
      [
        'expertise_client_reference',
        'expertise_no_concrete_proof',
        'expertise_partner',
        'expertise_personal_experience',
        'expertise_talent_pool',
      ].sort(),
    )
  })

  describe('projection de l’existant (décision 2 — lu tel quel, jamais « prouvé » inventé)', () => {
    it('une réponse plate devient un fondement DÉCLARÉ, sans identifiant (rien n’est écrit)', () => {
      const out = projectExpertiseGroundings({ expertise_client_reference: ['Cloud'] }, [])
      expect(out).toEqual([
        expect.objectContaining({
          id: null,
          expertiseKey: 'Cloud',
          kind: 'client_reference',
          state: 'declared',
          stateSource: 'onboarding_answer',
          sourceType: null,
        }),
      ])
    })

    it('« simple volonté de développement » est À PROUVER — la réponse le dit, rien n’est deviné', () => {
      const out = projectExpertiseGroundings({ expertise_no_concrete_proof: ['Cyber'] }, [])
      expect(out[0]).toMatchObject({ kind: 'development_intent', state: 'to_prove' })
    })

    it('une ligne stockée pour la même paire GAGNE sur la réponse plate (correction humaine)', () => {
      const out = projectExpertiseGroundings({ expertise_partner: ['Cloud'] }, [
        stored({
          id: 'g-9',
          expertiseKey: 'Cloud',
          kind: 'partner',
          state: 'proven',
          sourceType: 'document',
          sourceId: 'd-1',
        }),
      ])
      expect(out).toHaveLength(1)
      expect(out[0]).toMatchObject({ id: 'g-9', state: 'proven' })
    })

    it('une ligne ARCHIVÉE éteint la projection de sa paire sans réapparaître (on archive, on ne supprime pas)', () => {
      const out = projectExpertiseGroundings({ expertise_partner: ['Cloud'] }, [
        stored({ expertiseKey: 'Cloud', kind: 'partner', archivedAt: '2026-09-28T11:00:00.000Z' }),
      ])
      expect(out).toEqual([])
    })

    it('sans réponse, aucune ligne (on n’affiche pas ce qu’on n’a pas)', () => {
      expect(projectExpertiseGroundings({}, [])).toEqual([])
    })
  })

  describe('écriture — « prouvé » exige un objet source (#2039.9/.12)', () => {
    it('refuse « prouvé » sans objet rattaché', () => {
      const parsed = createExpertiseGroundingSchema.safeParse({
        expertiseKey: 'Cloud',
        kind: 'client_reference',
        state: 'proven',
      })
      expect(parsed.success).toBe(false)
    })

    it('accepte une mission rattachée comme preuve (#2039.9)', () => {
      const parsed = createExpertiseGroundingSchema.safeParse({
        expertiseKey: 'Cloud',
        kind: 'client_reference',
        state: 'proven',
        sourceType: 'mission',
        sourceId: '00000000-0000-4000-8000-000000000001',
      })
      expect(parsed.success).toBe(true)
    })

    it('la confidentialité se pose PAR RÉFÉRENCE client, jamais sur un autre fondement (#2039.13)', () => {
      expect(
        createExpertiseGroundingSchema.safeParse({
          expertiseKey: 'Cloud',
          kind: 'client_reference',
          confidentiality: 'anonymizable',
        }).success,
      ).toBe(true)
      expect(
        createExpertiseGroundingSchema.safeParse({
          expertiseKey: 'Cloud',
          kind: 'partner',
          confidentiality: 'anonymizable',
        }).success,
      ).toBe(false)
    })

    it('une mise à jour vide est refusée', () => {
      expect(updateExpertiseGroundingSchema.safeParse({}).success).toBe(false)
    })
  })

  describe('audit à 3 états — savoir-faire, preuve, vendable maintenant (#2039.14)', () => {
    it('une expertise sans aucun fondement : les trois axes sont NOMMÉS non évaluables, jamais « non »', () => {
      const [entry] = buildExpertiseCredibilityAudit(['Cloud'], [])
      expect(entry).toMatchObject({
        expertiseKey: 'Cloud',
        knowHow: { status: 'not_evaluable', reason: 'no_grounding' },
        proof: { status: 'not_evaluable', reason: 'no_grounding' },
        sellableNow: { status: 'not_evaluable', reason: 'no_grounding' },
      })
    })

    it('déclaré seulement : sait le faire, pas de preuve, donc pas vendable maintenant', () => {
      const [entry] = buildExpertiseCredibilityAudit(
        ['Cloud'],
        [stored({ expertiseKey: 'Cloud', kind: 'personal_experience', state: 'declared' })],
      )
      expect(entry?.knowHow.status).toBe('established')
      expect(entry?.proof).toEqual({ status: 'not_established', reason: 'no_proven_grounding' })
      expect(entry?.sellableNow).toEqual({ status: 'not_established', reason: 'no_proven_grounding' })
    })

    it('simple volonté seulement : le savoir-faire n’est PAS établi', () => {
      const [entry] = buildExpertiseCredibilityAudit(
        ['Cyber'],
        [stored({ expertiseKey: 'Cyber', kind: 'development_intent', state: 'to_prove' })],
      )
      expect(entry?.knowHow).toEqual({ status: 'not_established', reason: 'development_intent_only' })
    })

    it('prouvé + vivier + référence citable : vendable maintenant', () => {
      const [entry] = buildExpertiseCredibilityAudit(
        ['Cloud'],
        [
          stored({
            expertiseKey: 'Cloud',
            kind: 'client_reference',
            state: 'proven',
            sourceType: 'mission',
            sourceId: 'm-1',
            confidentiality: 'citable',
          }),
          stored({ id: 'g-2', expertiseKey: 'Cloud', kind: 'talent_pool', state: 'declared' }),
        ],
      )
      expect(entry?.proof.status).toBe('established')
      expect(entry?.sellableNow.status).toBe('established')
    })

    it('prouvé mais sans vivier déclaré : la capacité est NOMMÉE inconnue, pas « non »', () => {
      const [entry] = buildExpertiseCredibilityAudit(
        ['Cloud'],
        [
          stored({
            expertiseKey: 'Cloud',
            kind: 'client_reference',
            state: 'proven',
            sourceType: 'mission',
            sourceId: 'm-1',
          }),
        ],
      )
      expect(entry?.sellableNow).toEqual({ status: 'not_evaluable', reason: 'capacity_unknown' })
    })

    it('toutes les preuves sont confidentielles : pas vendable maintenant, et on dit pourquoi', () => {
      const [entry] = buildExpertiseCredibilityAudit(
        ['Cloud'],
        [
          stored({
            expertiseKey: 'Cloud',
            kind: 'client_reference',
            state: 'proven',
            sourceType: 'mission',
            sourceId: 'm-1',
            confidentiality: 'confidential',
          }),
          stored({ id: 'g-2', expertiseKey: 'Cloud', kind: 'talent_pool', state: 'declared' }),
        ],
      )
      expect(entry?.sellableNow).toEqual({ status: 'not_established', reason: 'proof_confidential' })
    })

    it('une expertise citée par un fondement mais absente des domaines déclarés reste listée, après eux', () => {
      const out = buildExpertiseCredibilityAudit(['Cloud'], [stored({ expertiseKey: 'SAP', kind: 'partner' })])
      expect(out.map(e => e.expertiseKey)).toEqual(['Cloud', 'SAP'])
    })

    it('les lignes archivées ne comptent pas', () => {
      const [entry] = buildExpertiseCredibilityAudit(
        ['Cloud'],
        [stored({ expertiseKey: 'Cloud', kind: 'partner', archivedAt: '2026-09-28T11:00:00.000Z' })],
      )
      expect(entry?.knowHow.status).toBe('not_evaluable')
    })
  })
})
