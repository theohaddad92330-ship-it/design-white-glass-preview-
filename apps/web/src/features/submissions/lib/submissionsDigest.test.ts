import type { Submission } from '@bellum/contracts'
import type { TFunction } from 'i18next'
import { describe, expect, it } from 'vitest'
import { i18n } from '@/i18n'
import { composeSubmissionsDigest } from './submissionsDigest'

/**
 * #2335.8 — même patron que `morning-brief.test.ts` : on lit le VRAI
 * catalogue (FR, puis EN), pas un dictionnaire jouet. Une phrase composée mais
 * mal traduite se lit comme une panne — c'est la phrase qu'on vérifie ici.
 */
const fr = i18n.getFixedT('fr', 'submissions') as TFunction<'submissions'>
const en = i18n.getFixedT('en', 'submissions') as TFunction<'submissions'>

function submission(over: Partial<Submission> = {}): Submission {
  return {
    id: 'sub-1',
    projectId: 'proj-1',
    projectLabel: 'Renfort plateforme',
    accountId: 'acc-1',
    accountName: 'ACME',
    needId: null,
    needRole: null,
    consultantId: 'c-1',
    consultantName: 'Marie Dupont',
    stage: 'submitted',
    // #2335.1 — champ requis par le contrat depuis l'ajout du sous-statut.
    substatus: null,
    stageEnteredAt: '2026-08-01T00:00:00.000Z',
    submittedAt: '2026-08-01T00:00:00.000Z',
    firstFeedbackAt: null,
    closedAt: null,
    outcomeReason: null,
    outcomeDetail: null,
    proposedRateCents: null,
    cvSnapshot: null,
    plannedDays: null,
    dailyCostCents: null,
    plannedMarginCents: null,
    ownerId: 'u-1',
    ownerName: 'Louis',
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
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...over,
  }
}

const NOW = new Date('2026-08-15T00:00:00.000Z')

describe.each([
  ['fr', fr],
  ['en', en],
])('composeSubmissionsDigest (%s)', (_lang, t) => {
  it('rend `null` quand rien n’est en cours — Laura ne parle pas dans le vide', () => {
    expect(composeSubmissionsDigest(t, [], NOW)).toBeNull()
    expect(
      composeSubmissionsDigest(t, [submission({ stage: 'accepted', closedAt: '2026-08-10T00:00:00.000Z' })], NOW),
    ).toBeNull()
  })

  it('compte les profils EN COURS (shortlisted/submitted/interview)', () => {
    const digest = composeSubmissionsDigest(
      t,
      [
        submission({ id: 's1', stage: 'submitted' }),
        submission({ id: 's2', stage: 'interview' }),
        submission({ id: 's3', stage: 'accepted', closedAt: '2026-08-01T00:00:00.000Z' }),
      ],
      NOW,
    )
    expect(digest).toContain('2')
  })

  it('nomme l’entretien confirmé', () => {
    const digest = composeSubmissionsDigest(
      t,
      [submission({ id: 's1', stage: 'interview', consultantName: 'Yanis Berthier' })],
      NOW,
    )
    expect(digest).not.toBeNull()
  })

  it('cible UNE SEULE relance — le profil sans retour depuis le PLUS longtemps', () => {
    const digest = composeSubmissionsDigest(
      t,
      [
        submission({
          id: 's1',
          stage: 'submitted',
          consultantName: 'Ancien Profil',
          submittedAt: '2026-08-01T00:00:00.000Z',
        }),
        submission({
          id: 's2',
          stage: 'submitted',
          consultantName: 'Profil Récent',
          submittedAt: '2026-08-13T00:00:00.000Z',
        }),
      ],
      NOW,
    )
    expect(digest).toContain('Ancien Profil')
    expect(digest).not.toContain('Profil Récent')
  })

  it('ne recommande AUCUNE relance sans profil silencieux', () => {
    const digest = composeSubmissionsDigest(t, [submission({ id: 's1', stage: 'interview' })], NOW)
    expect(digest).not.toBeNull()
    expect(digest).not.toContain('Marie Dupont')
  })

  it('n’écrit jamais de POURCENTAGE ni de mot de probabilité — doctrine', () => {
    const digest = composeSubmissionsDigest(
      t,
      [submission({ id: 's1', stage: 'submitted', submittedAt: '2026-08-01T00:00:00.000Z' })],
      NOW,
    )
    expect(digest).not.toMatch(/%|chance|probab|likely/i)
  })
})
