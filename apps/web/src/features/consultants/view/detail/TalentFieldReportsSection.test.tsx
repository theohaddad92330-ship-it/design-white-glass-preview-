import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ConsultantFieldReport } from '@bellum/contracts'
import { TalentFieldReportsSection } from './TalentFieldReportsSection'
import { useRecordFieldReport } from '../../hooks'

vi.mock('@/features/profiles/hooks/useProfile', () => ({ useProfile: () => ({ data: null }) }))

vi.mock('../../hooks', () => ({ useRecordFieldReport: vi.fn() }))

const TALENT_ID = '11111111-1111-4111-8111-111111111111'

function mockMutation(overrides: Partial<ReturnType<typeof useRecordFieldReport>> = {}) {
  vi.mocked(useRecordFieldReport).mockReturnValue({
    mutate: vi.fn(),
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    isPending: false,
    ...overrides,
  } as unknown as ReturnType<typeof useRecordFieldReport>)
}

function report(overrides: Partial<ConsultantFieldReport> = {}): ConsultantFieldReport {
  return {
    id: 'r1',
    accountId: null,
    accountName: 'Société Générale',
    entity: null,
    team: null,
    manager: null,
    project: null,
    technologies: [],
    teamSize: null,
    partnersObserved: [],
    painPoints: null,
    possibleSponsor: null,
    decisionMakers: [],
    uncoveredNeed: null,
    peopleToContact: [],
    introductionPossible: null,
    notForCommercialUse: false,
    confidentialityLevel: 'confidentiel',
    usageAuthorization: null,
    scope: null,
    confidence: 'moyenne',
    recordedByUserId: 'u1',
    recordedByName: 'Louis Schlegel',
    declaredAt: '2026-09-27T08:00:00.000Z',
    ...overrides,
  }
}

/**
 * #3406 (retour bêta #3406) — capitaliser une information terrain, avec
 * consentement et sans mettre le consultant en difficulté.
 */
describe('TalentFieldReportsSection — #3406', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('une liste vide le DIT — jamais un bloc muet', () => {
    mockMutation()
    render(<TalentFieldReportsSection talentId={TALENT_ID} reports={[]} />)
    expect(screen.getByText(/Aucune information terrain capitalisée/i)).toBeTruthy()
  })

  it('rend une information capitalisée avec son entreprise et son veto commercial', () => {
    mockMutation()
    render(<TalentFieldReportsSection talentId={TALENT_ID} reports={[report({ notForCommercialUse: true })]} />)
    expect(screen.getByText('Société Générale')).toBeTruthy()
    expect(screen.getByText(/Pas d’usage commercial/i)).toBeTruthy()
  })

  it('ouvre le formulaire au clic sur « Ajouter »', () => {
    mockMutation()
    render(<TalentFieldReportsSection talentId={TALENT_ID} reports={[]} />)
    fireEvent.click(screen.getByText('Ajouter une information terrain'))
    expect(screen.getByText('Capitaliser une information terrain')).toBeTruthy()
  })

  it('envoie les listes découpées et le veto commercial au clic sur « Enregistrer »', () => {
    const mutateAsync = vi.fn().mockResolvedValue(undefined)
    mockMutation({ mutateAsync })
    render(<TalentFieldReportsSection talentId={TALENT_ID} reports={[]} />)
    fireEvent.click(screen.getByText('Ajouter une information terrain'))

    fireEvent.change(screen.getByLabelText('Entreprise'), { target: { value: 'Société Générale' } })
    fireEvent.change(screen.getByLabelText('Décideurs'), {
      target: { value: 'Une décideuse, Un second décideur' },
    })
    // Le consultant a demandé de ne pas exploiter cette information commercialement.
    fireEvent.click(screen.getByRole('switch', { name: 'Ne pas exploiter commercialement' }))

    fireEvent.click(screen.getByText('Enregistrer l’information'))

    expect(mutateAsync).toHaveBeenCalledTimes(1)
    const [[call]] = mutateAsync.mock.calls
    expect(call.id).toBe(TALENT_ID)
    expect(call.input.accountName).toBe('Société Générale')
    expect(call.input.decisionMakers).toEqual(['Une décideuse', 'Un second décideur'])
    expect(call.input.notForCommercialUse).toBe(true)
    // Deux crans nommés sont exigés par défaut, jamais un chiffre.
    expect(call.input.confidentialityLevel).toBe('interne')
    expect(call.input.confidence).toBe('moyenne')
  })
})
