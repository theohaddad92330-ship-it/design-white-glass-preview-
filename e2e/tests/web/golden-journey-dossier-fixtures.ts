import type { Page } from '@playwright/test'
import { fulfillJson, mockSignedInShell } from './golden-journey-fixtures'

/**
 * Socle des parcours dorés « dossier d'affaire » (#2208.48-.50) : une
 * opportunité à une étape donnée, et les positionnements qui y sont rattachés.
 * Partagé (GA-26) : trois fichiers simulent le même `/projects/:id`.
 */

export const PROJECT_ID = '55555555-5555-4555-8555-555555555555'
export const SUBMISSION_ID = '66666666-6666-4666-8666-666666666666'

function project(stage: string, interviewCount: number): Record<string, unknown> {
  return {
    id: PROJECT_ID,
    account_id: '77777777-7777-4777-8777-777777777777',
    company_name: 'ACME',
    sector: null,
    logo_url: null,
    website: null,
    kind: 'pain',
    label: 'Migration data lake',
    detail: null,
    offer: null,
    source: null,
    confidence: null,
    urgency: null,
    stage,
    stage_entered_at: '2026-09-20T10:00:00.000Z',
    owner_id: null,
    expected_close_on: null,
    closed_at: null,
    outcome: null,
    loss_reason: null,
    first_detected_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-09-28T00:00:00.000Z',
    amount_cents: null,
    interview_count: interviewCount,
  }
}

function submission(): Record<string, unknown> {
  return {
    id: SUBMISSION_ID,
    projectId: PROJECT_ID,
    projectLabel: 'Migration data lake',
    accountId: '77777777-7777-4777-8777-777777777777',
    accountName: 'ACME',
    needId: null,
    needRole: 'Data Engineer',
    consultantId: 'a0000000-0000-4000-8000-000000000001',
    consultantName: 'Sophie M.',
    stage: 'submitted',
    substatus: null,
    stageEnteredAt: '2026-09-25T09:00:00.000Z',
    submittedAt: '2026-09-25T09:00:00.000Z',
    firstFeedbackAt: null,
    closedAt: null,
    outcomeReason: null,
    outcomeDetail: null,
    proposedRateCents: 65000,
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
    createdAt: '2026-09-25T09:00:00.000Z',
    updatedAt: '2026-09-25T09:00:00.000Z',
  }
}

/** `/projects/:id` à l'étape `stage`, avec UN positionnement « CV envoyé » chez ACME. */
export async function mockProjectDossier(
  page: Page,
  options: { userId: string; tag: string; stage: string; interviewCount?: number },
): Promise<void> {
  await mockSignedInShell(page, { userId: options.userId, tag: options.tag, features: ['pipe', 'needs'] })
  await page.route(/\/projects\?id=/, route =>
    fulfillJson(route, [project(options.stage, options.interviewCount ?? 0)]),
  )
  await page.route(/\/submissions\?/, route =>
    fulfillJson(route, {
      items: [submission()],
      funnel: { submitted: 1, acceptanceRate: null, medianDaysToFeedback: null, noFeedback: 1 },
    }),
  )
}
