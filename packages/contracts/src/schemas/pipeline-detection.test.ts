import { describe, expect, it } from 'vitest'
import {
  PIPELINE_DETECTION_KINDS,
  PIPELINE_INTEREST_CALL_OUTCOMES,
  PIPELINE_DETECTION_STATUSES,
  PIPELINE_DETECTION_TARGET_STAGE,
  pipelineDetectionConfirmCreates,
  pipelineDetectionListSchema,
  pipelineDetectionSchema,
} from './pipeline-detection.js'

const detection = {
  id: '11111111-1111-4111-8111-111111111111',
  kind: 'interest_to_opportunity',
  status: 'detected',
  accountId: '22222222-2222-4222-8222-222222222222',
  accountName: 'Banque Exemple',
  label: 'Intérêt exprimé à l’appel du 10/10',
  sourceId: '33333333-3333-4333-8333-333333333333',
  sourceCallId: null,
  projectId: null,
  consultantId: null,
  submissionId: null,
  createdObjectId: null,
  detectedAt: '2026-10-11T05:50:00.000Z',
  decidedAt: null,
}

describe('#4016 L6 — le pipe « détecté, à revoir »', () => {
  it('trois passages, et seulement trois — intérêt, shortlist, entretien', () => {
    expect(PIPELINE_DETECTION_KINDS).toEqual([
      'interest_to_opportunity',
      'shortlist_to_submission',
      'interview_to_mission',
    ])
  })

  it('un statut d’ENTRÉE « détecté », puis la décision d’un humain — jamais « confirmé » tout seul', () => {
    expect(PIPELINE_DETECTION_STATUSES[0]).toBe('detected')
    expect(PIPELINE_DETECTION_STATUSES).toEqual(['detected', 'confirmed', 'dismissed'])
  })

  it('chaque passage vise un stade CANONIQUE de la chaîne commerciale', () => {
    expect(PIPELINE_DETECTION_TARGET_STAGE).toEqual({
      interest_to_opportunity: 'opportunite',
      shortlist_to_submission: 'positionnement',
      interview_to_mission: 'mission',
    })
  })

  it('la mission ne naît JAMAIS d’un clic de confirmation (#2320.21 : accord client ET consultant)', () => {
    expect(pipelineDetectionConfirmCreates('interest_to_opportunity')).toBe(true)
    expect(pipelineDetectionConfirmCreates('shortlist_to_submission')).toBe(true)
    expect(pipelineDetectionConfirmCreates('interview_to_mission')).toBe(false)
  })

  it('un intérêt se lit sur trois issues d’appel — jamais sur un simple rendez-vous pris', () => {
    expect(PIPELINE_INTEREST_CALL_OUTCOMES).toEqual(['interest', 'need_detected', 'need_confirmed'])
    expect(PIPELINE_INTEREST_CALL_OUTCOMES as readonly string[]).not.toContain('meeting_booked')
  })

  it('lit une détection, et refuse un statut inventé', () => {
    expect(pipelineDetectionSchema.parse(detection).status).toBe('detected')
    expect(() => pipelineDetectionSchema.parse({ ...detection, status: 'auto_confirmed' })).toThrow()
    expect(() => pipelineDetectionSchema.parse({ ...detection, kind: 'signal_to_mission' })).toThrow()
  })

  it('la liste dit si le balayage est coupé — une liste vide n’est pas « rien détecté »', () => {
    const parsed = pipelineDetectionListSchema.parse({ items: [detection], autoDetect: 'off' })
    expect(parsed.autoDetect).toBe('off')
    expect(() => pipelineDetectionListSchema.parse({ items: [] })).toThrow()
  })

  it('#4016.L6.a — l’appel source est un identifiant ou null, jamais une chaîne libre', () => {
    const base = { ...detection }
    expect(
      pipelineDetectionSchema.safeParse({ ...base, sourceCallId: '44444444-4444-4444-8444-444444444444' }).success,
    ).toBe(true)
    expect(pipelineDetectionSchema.safeParse({ ...base, sourceCallId: null }).success).toBe(true)
    expect(pipelineDetectionSchema.safeParse({ ...base, sourceCallId: 'un appel' }).success).toBe(false)
  })
})
