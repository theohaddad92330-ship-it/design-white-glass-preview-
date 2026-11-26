import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OpenNeedRow, Submission } from '@bellum/contracts'

/**
 * Le bandeau « Staffing » — candidats suggérés / entretiens planifiés /
 * propositions envoyées / missions attribuées.
 *
 * `useSubmissions` est MOQUÉ, comme dans `NeedPositioningsTab.test.tsx` : la
 * dérivation elle-même (par stage) a ses propres tests dans
 * `model/need-staffing.test.ts`.
 */

const submissions = vi.fn()
vi.mock('@/features/submissions/api', () => ({ useSubmissions: () => submissions() }))

const { NeedStaffingBanner } = await import('./NeedStaffingBanner')

function need(over: Partial<OpenNeedRow> = {}): OpenNeedRow {
  return {
    id: 'n-1',
    title: 'Ingénieur données',
    urgency: null,
    skills: [],
    seniority: null,
    headcount: 1,
    target_tjm_cents: null,
    start_on: null,
    duration_months: null,
    location: null,
    contract_kind: 'regie',
    deadline_at: null,
    status: 'matching',
    status_reason: null,
    status_changed_at: null,
    source: null,
    provenance: null,
    owner_id: null,
    shortlist_count: 0,
    staffable: 'unknown',
    staffable_reason: null,
    project_id: 'p-1',
    project_label: 'Portail transporteurs',
    project_stage: 'qualified',
    account_id: 'a-1',
    account_name: 'NOVA LOGISTIQUE',
    entity_id: null,
    entity_name: null,
    ...over,
  } as unknown as OpenNeedRow
}

function submission(over: Partial<Submission> = {}): Submission {
  return {
    id: 's-1',
    projectId: 'p-1',
    projectLabel: 'Portail transporteurs',
    accountId: 'a-1',
    accountName: 'NOVA LOGISTIQUE',
    needId: 'n-1',
    needRole: 'Ingénieur données',
    consultantId: 'c-1',
    consultantName: 'Sophie M.',
    stage: 'shortlisted',
    // #2335.1 — champ requis par le contrat depuis l'ajout du sous-statut.
    substatus: null,
    stageEnteredAt: '2026-08-20T09:00:00.000Z',
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
    createdAt: '2026-08-20T09:00:00.000Z',
    updatedAt: '2026-08-20T09:00:00.000Z',
    ...over,
  }
}

beforeEach(() => submissions.mockReset())

describe('NeedStaffingBanner', () => {
  it('rend les trois comptes mesurables', () => {
    submissions.mockReturnValue({
      data: {
        items: [
          submission({ id: 's-1', stage: 'shortlisted' }),
          submission({ id: 's-2', stage: 'shortlisted' }),
          submission({ id: 's-3', stage: 'interview' }),
          submission({ id: 's-4', stage: 'submitted' }),
        ],
      },
      isLoading: false,
      isError: false,
    })
    render(<NeedStaffingBanner need={need()} />)
    // Quatre positionnements retenus au total (même source que le rail de la chaîne).
    expect(screen.getByText('4')).toBeInTheDocument()
    // Un seul entretien ET une seule proposition : « 1 » apparaît deux fois.
    expect(screen.getAllByText('1')).toHaveLength(2)
  })

  it('#3486 — la case ne dit pas « candidats suggérés » : elle compte les profils retenus, accordée', () => {
    // Recette Y7 : « 1 Candidats suggérés » au-dessus de « Aucun profil au-dessus du seuil »
    // se lisait comme une contradiction — ce sont des positionnements au stade « Retenu ».
    submissions.mockReturnValue({
      data: { items: [submission({ id: 's-1', stage: 'shortlisted' })] },
      isLoading: false,
      isError: false,
    })
    render(<NeedStaffingBanner need={need()} />)
    expect(screen.queryByText(/suggéré/i)).toBeNull()
    expect(screen.getByText('Profil retenu')).toBeInTheDocument()
  })

  it('« missions attribuées » n’écrit JAMAIS 0 quand des missions de l’affaire n’ont pas de rôle', () => {
    // Les missions créées avant `missions.need_id` ne le portent pas, et rien
    // ne peut le deviner pour elles : « 0 » affirmerait « aucune mission n'est
    // née d'ici » alors qu'on ne peut pas le savoir.
    submissions.mockReturnValue({ data: { items: [] }, isLoading: false, isError: false })
    render(<NeedStaffingBanner need={need({ missions_assigned: 0, project_missions_unlinked: 2 })} />)
    expect(screen.getByText(/non mesuré/)).toBeInTheDocument()
  })

  it('« missions attribuées » écrit son compte quand il est mesuré', () => {
    submissions.mockReturnValue({ data: { items: [] }, isLoading: false, isError: false })
    render(<NeedStaffingBanner need={need({ missions_assigned: 2, project_missions_unlinked: 0 })} />)
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.queryByText(/non mesuré/)).not.toBeInTheDocument()
  })

  it('un compte mesuré à côté de missions sans rôle s’annonce comme un PLANCHER', () => {
    submissions.mockReturnValue({ data: { items: [] }, isLoading: false, isError: false })
    render(<NeedStaffingBanner need={need({ missions_assigned: 1, project_missions_unlinked: 3 })} />)
    expect(screen.getByText(/au moins/i)).toBeInTheDocument()
  })

  it('#3544.5 : un ZÉRO mesuré se dit « Aucun », jamais « 0 », et reste distinct de « non mesuré » — sur les QUATRE cases', () => {
    submissions.mockReturnValue({ data: { items: [] }, isLoading: false, isError: false })
    render(<NeedStaffingBanner need={need({ missions_assigned: 0, project_missions_unlinked: 0 })} />)
    expect(screen.queryByText('0')).not.toBeInTheDocument()
    expect(screen.getAllByText('Aucun').length).toBe(4)
    expect(screen.queryByText(/non mesuré/)).not.toBeInTheDocument()
  })
})
