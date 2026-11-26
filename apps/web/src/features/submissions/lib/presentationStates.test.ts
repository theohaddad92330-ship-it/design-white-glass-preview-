import type { Submission } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import {
  isPresentationInProgress,
  presentationFunnel,
  presentationState,
  presentationsByOwner,
} from './presentationStates'

function sub(over: Partial<Submission> = {}): Submission {
  return {
    id: 'sub-1',
    projectId: 'proj-1',
    projectLabel: 'Renfort SAP',
    accountId: 'acc-1',
    accountName: 'Airbus',
    needId: null,
    needRole: null,
    consultantId: 'c-1',
    consultantName: 'Camille Moreau',
    stage: 'submitted',
    substatus: null,
    stageEnteredAt: '2026-10-16T00:00:00.000Z',
    submittedAt: '2026-10-16T00:00:00.000Z',
    firstFeedbackAt: null,
    closedAt: null,
    outcomeReason: null,
    outcomeDetail: null,
    proposedRateCents: null,
    plannedDays: null,
    dailyCostCents: null,
    plannedMarginCents: null,
    cvSnapshot: null,
    ownerId: null,
    ownerName: null,
    recipientContactId: null,
    recipientContactName: null,
    channel: null,
    message: null,
    availability: null,
    conditions: null,
    consultantAgreement: null,
    consultantAgreementDate: null,
    nextActionLabel: null,
    nextActionDueAt: null,
    nextActionOwnerId: null,
    nextActionOwnerName: null,
    createdAt: '2026-10-10T00:00:00.000Z',
    updatedAt: '2026-10-16T00:00:00.000Z',
    ...over,
  }
}

describe('presentationState — les états de Théo, sans rien perdre des sorties', () => {
  it('range les cinq étapes vivantes sur quatre états + « à présenter »', () => {
    expect(presentationState(sub({ stage: 'shortlisted', substatus: 'to_qualify' }))).toBe('preselection')
    expect(presentationState(sub({ stage: 'shortlisted', substatus: null }))).toBe('preselection')
    expect(presentationState(sub({ stage: 'shortlisted', substatus: 'ready_to_present' }))).toBe('to_present')
    expect(presentationState(sub({ stage: 'submitted', substatus: 'presented' }))).toBe('presented')
    expect(presentationState(sub({ stage: 'interview', substatus: 'interview_done' }))).toBe('client_interview')
    expect(presentationState(sub({ stage: 'accepted', substatus: 'selected' }))).toBe('retained')
  })

  it('garde les sorties : refusé, retiré, sans réponse, converti, archivé', () => {
    expect(presentationState(sub({ stage: 'rejected', substatus: 'declined' }))).toBe('declined')
    expect(presentationState(sub({ stage: 'withdrawn', substatus: 'withdrawn' }))).toBe('withdrawn')
    expect(presentationState(sub({ stage: 'submitted', substatus: 'no_response' }))).toBe('no_response')
    expect(presentationState(sub({ stage: 'accepted', substatus: 'converted_to_mission' }))).toBe('converted')
    expect(presentationState(sub({ stage: 'accepted', substatus: 'archived' }))).toBe('archived')
  })

  it('« En cours » ne montre aucune sortie', () => {
    expect(isPresentationInProgress('retained')).toBe(true)
    expect(isPresentationInProgress('preselection')).toBe(true)
    for (const exit of ['declined', 'withdrawn', 'no_response', 'converted', 'archived'] as const) {
      expect(isPresentationInProgress(exit)).toBe(false)
    }
  })
})

describe('presentationFunnel — quatre chiffres sur 30 jours, jamais un zéro inventé', () => {
  const now = new Date('2026-10-22T12:00:00.000Z')

  it('compte présélectionnés, présentés (dont sans réponse), entretiens, retenus à préparer', () => {
    const items = [
      sub({ id: 'a', stage: 'shortlisted', createdAt: '2026-10-20T00:00:00.000Z', submittedAt: null }),
      sub({ id: 'b', stage: 'submitted', substatus: 'presented' }),
      sub({ id: 'c', stage: 'submitted', substatus: 'no_response' }),
      sub({
        id: 'd',
        stage: 'interview',
        substatus: 'interview_scheduled',
        stageEnteredAt: '2026-10-21T00:00:00.000Z',
      }),
      sub({ id: 'e', stage: 'accepted', substatus: 'selected' }),
      sub({ id: 'f', stage: 'accepted', substatus: 'converted_to_mission' }),
      sub({
        id: 'old',
        stage: 'submitted',
        createdAt: '2026-07-01T00:00:00.000Z',
        submittedAt: '2026-07-02T00:00:00.000Z',
      }),
    ]
    const funnel = presentationFunnel(items, now)
    expect(funnel.preselected).toBe(1)
    expect(funnel.presented).toBe(5)
    expect(funnel.presentedWithoutReply).toBe(2)
    expect(funnel.interviews).toBe(1)
    expect(funnel.interviewsThisWeek).toBe(1)
    expect(funnel.retained).toBe(2)
    expect(funnel.missionsToPrepare).toBe(1)
  })

  it('ne dit pas « 0 présentée » sans présentation : le champ reste nul', () => {
    const funnel = presentationFunnel([], now)
    expect(funnel.presented).toBeNull()
    expect(funnel.preselected).toBeNull()
  })
})

describe('presentationsByOwner', () => {
  it('range en cours / retenues par commercial, et ignore ceux qui n’ont pas de porteur', () => {
    const rows = presentationsByOwner([
      sub({ id: '1', ownerName: 'Théo', stage: 'submitted' }),
      sub({ id: '2', ownerName: 'Théo', stage: 'interview' }),
      sub({ id: '3', ownerName: 'Maëva', stage: 'accepted', substatus: 'selected' }),
      sub({ id: '4', ownerName: null, stage: 'submitted' }),
      sub({ id: '5', ownerName: 'Julien', stage: 'rejected' }),
    ])
    expect(rows).toEqual([
      { owner: 'Théo', inProgress: 2, retained: 0 },
      { owner: 'Maëva', inProgress: 0, retained: 1 },
    ])
  })
})
