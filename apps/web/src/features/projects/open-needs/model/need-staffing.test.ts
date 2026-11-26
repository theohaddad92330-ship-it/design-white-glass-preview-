import { describe, expect, it } from 'vitest'
import type { Submission } from '@bellum/contracts'
import { deriveNeedStaffingBand, missionsAssignedOf } from './need-staffing.js'

const NEED_ID = 'n-1'

function submission(over: Partial<Submission> = {}): Submission {
  return {
    id: 's-1',
    projectId: 'p-1',
    projectLabel: 'Portail transporteurs',
    accountId: 'a-1',
    accountName: 'NOVA LOGISTIQUE',
    needId: NEED_ID,
    needRole: 'Ingénieur données',
    consultantId: 'c-1',
    consultantName: 'Sophie M.',
    stage: 'shortlisted',
    // #2335.1 — champ requis par le contrat depuis l'ajout du sous-statut.
    substatus: null,
    stageEnteredAt: '2026-05-01T00:00:00.000Z',
    submittedAt: null,
    firstFeedbackAt: null,
    closedAt: null,
    outcomeReason: null,
    outcomeDetail: null,
    proposedRateCents: null,
    cvSnapshot: null,
    plannedDays: null,
    dailyCostCents: null,
    plannedMarginCents: null,
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
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    ...over,
  }
}

describe('deriveNeedStaffingBand', () => {
  it('compte chaque stage — 2 entretiens, 1 proposition ; les retenus = tous les positionnements du besoin', () => {
    const submissions = [
      submission({ id: 's-1', stage: 'shortlisted' }),
      submission({ id: 's-2', stage: 'shortlisted' }),
      submission({ id: 's-3', stage: 'shortlisted' }),
      submission({ id: 's-4', stage: 'interview' }),
      submission({ id: 's-5', stage: 'interview' }),
      submission({ id: 's-6', stage: 'submitted' }),
    ]
    expect(deriveNeedStaffingBand(submissions, NEED_ID)).toEqual({
      retainedProfiles: 6,
      interviewsScheduled: 2,
      proposalsSent: 1,
    })
  })

  it('ignore les positionnements des AUTRES besoins du même projet', () => {
    const submissions = [
      submission({ id: 's-1', needId: NEED_ID, stage: 'shortlisted' }),
      submission({ id: 's-2', needId: 'un-autre-besoin', stage: 'shortlisted' }),
    ]
    expect(deriveNeedStaffingBand(submissions, NEED_ID).retainedProfiles).toBe(1)
  })

  it('rend zéro pour un stage sans positionnement — un ZÉRO MESURÉ, pas une absence', () => {
    expect(deriveNeedStaffingBand([], NEED_ID)).toEqual({
      retainedProfiles: 0,
      interviewsScheduled: 0,
      proposalsSent: 0,
    })
  })

  it('#3486 — « profils retenus » = la MÊME source que le rail de la chaîne : tous les positionnements du besoin, quel que soit leur stade', () => {
    // Recette Y11 : bandeau « 1 » vs rail « 3 profils retenus ». Le rail compte
    // `submissions` du besoin (chain-projectors, sourcing_matching étape 4).
    const submissions = [
      submission({ id: 's-1', stage: 'shortlisted' }),
      submission({ id: 's-2', stage: 'interview' }),
      submission({ id: 's-3', stage: 'rejected' }),
    ]
    expect(deriveNeedStaffingBand(submissions, NEED_ID).retainedProfiles).toBe(3)
  })

  it('n’attribue jamais un positionnement CLOS (accepté/refusé/retiré) à un des trois compteurs', () => {
    const submissions = [
      submission({ id: 's-1', stage: 'accepted' }),
      submission({ id: 's-2', stage: 'rejected' }),
      submission({ id: 's-3', stage: 'withdrawn' }),
    ]
    expect(deriveNeedStaffingBand(submissions, NEED_ID)).toEqual({
      retainedProfiles: 3,
      interviewsScheduled: 0,
      proposalsSent: 0,
    })
  })
})

/**
 * « MISSIONS ATTRIBUÉES » — les quatre situations, et les quatre phrases.
 *
 * Ce quatrième chiffre était « non mesuré » par construction jusqu'au
 * 31/08/2026 : une mission ne portait que l'identité de l'AFFAIRE. Le lien
 * existe désormais (`missions.need_id`), et ce qui se teste ici est la seule
 * chose qui compte vraiment — **quand le zéro est vrai, et quand il ment**.
 */
describe('missionsAssignedOf', () => {
  it('un vrai ZÉRO : aucune mission sur ce rôle, aucune mission sans rôle sur l’affaire', () => {
    // La requête a compté, elle n'a rien trouvé. Ce zéro-là s'affiche.
    expect(missionsAssignedOf({ missions_assigned: 0, project_missions_unlinked: 0 })).toEqual({
      measured: true,
      count: 0,
      unlinked: 0,
    })
  })

  it('des missions SANS rôle sur l’affaire ⇒ non mesuré, JAMAIS 0', () => {
    // Les missions créées avant le lien ne le portent pas, et rien ne peut le
    // deviner pour elles. « 0 » affirmerait « aucune mission n'est née d'ici ».
    expect(missionsAssignedOf({ missions_assigned: 0, project_missions_unlinked: 3 })).toEqual({
      measured: false,
      reason: 'unlinked',
      unlinked: 3,
    })
  })

  it('un compte mesuré à côté de missions sans rôle est un PLANCHER, et il le dit', () => {
    expect(missionsAssignedOf({ missions_assigned: 1, project_missions_unlinked: 2 })).toEqual({
      measured: true,
      count: 1,
      unlinked: 2,
    })
  })

  it('un compte mesuré sans aucune mission orpheline n’est pas un plancher', () => {
    expect(missionsAssignedOf({ missions_assigned: 2, project_missions_unlinked: 0 })).toEqual({
      measured: true,
      count: 2,
      unlinked: 0,
    })
  })

  it('le serveur qui ne dit RIEN n’est pas un zéro non plus — et ce n’est pas la même absence', () => {
    // La fenêtre de déploiement : le web part en une minute, l'API en
    // plusieurs. Un écran neuf lit alors une réponse ancienne.
    expect(missionsAssignedOf({})).toEqual({ measured: false, reason: 'unserved', unlinked: 0 })
    expect(missionsAssignedOf({ missions_assigned: undefined, project_missions_unlinked: 4 })).toEqual({
      measured: false,
      reason: 'unserved',
      unlinked: 0,
    })
    // L'inverse compte autant : un compte sans son voisin ne dit pas s'il est
    // un fait ou un plancher.
    expect(missionsAssignedOf({ missions_assigned: 2, project_missions_unlinked: undefined })).toEqual({
      measured: false,
      reason: 'unserved',
      unlinked: 0,
    })
  })
})
