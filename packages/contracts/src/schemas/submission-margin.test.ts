import { describe, expect, it } from 'vitest'
import {
  advanceSubmissionSchema,
  candidatePipelineColumn,
  createSubmissionSchema,
  plannedMarginCents,
} from './submission.js'

// #4192 (épopée #4191, lot L1) — la marge PRÉVUE d'un positionnement et la colonne du kanban candidat.
describe('plannedMarginCents', () => {
  it('= (TJM − coût) × jours', () => {
    expect(plannedMarginCents({ proposedRateCents: 650_00, dailyCostCents: 450_00, plannedDays: 120 })).toBe(24_000_00)
  })

  it.each([
    ['TJM', { proposedRateCents: null, dailyCostCents: 450_00, plannedDays: 120 }],
    ['coût', { proposedRateCents: 650_00, dailyCostCents: null, plannedDays: 120 }],
    ['jours', { proposedRateCents: 650_00, dailyCostCents: 450_00, plannedDays: null }],
  ])('est null (non mesurée, jamais 0) quand %s manque', (_name, input) => {
    expect(plannedMarginCents(input)).toBeNull()
  })

  it('reste mesurée — et négative — quand le coût dépasse le TJM, ou nulle quand ils s’égalent', () => {
    expect(plannedMarginCents({ proposedRateCents: 400_00, dailyCostCents: 450_00, plannedDays: 10 })).toBe(-500_00)
    expect(plannedMarginCents({ proposedRateCents: 450_00, dailyCostCents: 450_00, plannedDays: 10 })).toBe(0)
  })
})

describe('candidatePipelineColumn', () => {
  it.each([
    ['submitted', null, 'envoye'],
    ['submitted', 'to_validate', 'envoye'],
    ['submitted', 'presented', 'presente'],
    ['submitted', 'presented_manually', 'presente'],
    ['submitted', 'acknowledged', 'presente'],
    ['interview', 'interview_scheduled', 'entretien'],
    ['accepted', 'selected', 'retenu'],
    ['shortlisted', 'to_qualify', null],
    ['rejected', 'declined', null],
    ['withdrawn', null, null],
  ] as const)('%s + %s → %s', (stage, substatus, expected) => {
    expect(candidatePipelineColumn(stage, substatus)).toBe(expected)
  })
})

describe('création / mise à jour : jours et coût', () => {
  const base = {
    projectId: '11111111-1111-4111-8111-111111111111',
    consultantId: '22222222-2222-4222-8222-222222222222',
  }

  it('acceptent plannedDays et dailyCostCents, optionnels', () => {
    expect(createSubmissionSchema.parse(base).plannedDays).toBeUndefined()
    const parsed = createSubmissionSchema.parse({ ...base, plannedDays: 120, dailyCostCents: 450_00 })
    expect(parsed.plannedDays).toBe(120)
    expect(parsed.dailyCostCents).toBe(450_00)
    expect(
      advanceSubmissionSchema.parse({ stage: 'interview', plannedDays: 5, dailyCostCents: null }).dailyCostCents,
    ).toBeNull()
  })

  it('refusent des jours ≤ 0 ou un coût négatif (miroir des CHECK SQL)', () => {
    expect(createSubmissionSchema.safeParse({ ...base, plannedDays: 0 }).success).toBe(false)
    expect(createSubmissionSchema.safeParse({ ...base, dailyCostCents: -1 }).success).toBe(false)
  })
})
