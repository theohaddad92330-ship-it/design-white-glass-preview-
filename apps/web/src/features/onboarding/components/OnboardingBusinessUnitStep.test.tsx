import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BusinessUnitList } from '@bellum/contracts'
import { OnboardingBusinessUnitStep } from './OnboardingBusinessUnitStep'

/**
 * #2017.1-.20 — « Toute l'entreprise ou un périmètre ? », posée après l'étape
 * entreprise. Ce fichier teste le sous-écran EN ISOLATION (les deux hooks
 * qu'il consomme sont mockés) : la navigation qui l'entoure est couverte par
 * `OnboardingCompanyPage.test.tsx`.
 */

const { mockUseMyBusinessUnits, mockUseTeam, joinMock, requestAccessMock, createMock } = vi.hoisted(() => ({
  mockUseMyBusinessUnits: vi.fn(),
  mockUseTeam: vi.fn(),
  joinMock: vi.fn(),
  requestAccessMock: vi.fn(),
  createMock: vi.fn(),
}))

vi.mock('@/features/business-units/hooks/useMyBusinessUnits', () => ({
  useMyBusinessUnits: () => mockUseMyBusinessUnits(),
}))

vi.mock('@/features/team/hooks/useTeam', () => ({
  useTeam: () => mockUseTeam(),
}))

const EMPTY_LIST: BusinessUnitList = { businessUnits: [], viewerAccess: 'workspace' }

function baseUnits(overrides: Partial<ReturnType<typeof mockUseMyBusinessUnits>> = {}) {
  return {
    data: EMPTY_LIST,
    isLoading: false,
    isError: false,
    join: joinMock,
    requestAccess: requestAccessMock,
    create: createMock,
    creating: false,
    pendingId: null,
    ...overrides,
  }
}

describe('OnboardingBusinessUnitStep', () => {
  beforeEach(() => {
    joinMock.mockReset()
    requestAccessMock.mockReset()
    createMock.mockReset().mockResolvedValue({ id: 'new-bu', name: 'Agence Lyon' })
    mockUseMyBusinessUnits.mockReturnValue(baseUnits())
    mockUseTeam.mockReturnValue({ team: { workspace: { role: 'owner' } } })
  })

  it('#2017.2 — "Toute l’entreprise" est sélectionnée par défaut et "Continuer" avance sans rien créer', () => {
    const onContinue = vi.fn()
    render(<OnboardingBusinessUnitStep onContinue={onContinue} />)

    expect(screen.getByRole('button', { name: 'Toute l’entreprise' })).toHaveAttribute('aria-pressed', 'true')
    // #2017.19 — le défaut n'écrit rien : aucune BU listée, aucun geste de
    // création ou de rejoint proposé.
    expect(screen.queryByText('Choisir un périmètre existant')).toBeNull()

    fireEvent.click(screen.getByTestId('business-unit-scope-continue'))
    expect(onContinue).toHaveBeenCalledTimes(1)
    expect(createMock).not.toHaveBeenCalled()
    expect(joinMock).not.toHaveBeenCalled()
  })

  it('#2017.3-.8 — les sept choix sont les sept valeurs de kind, jamais un libellé parallèle', () => {
    render(<OnboardingBusinessUnitStep onContinue={vi.fn()} />)
    for (const label of [
      'Toute l’entreprise',
      'Une BU',
      'Une agence',
      'Une équipe commerciale',
      'Un territoire',
      'Une nouvelle activité à lancer',
      'Je travaille seul',
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
  })

  it('#2017.17 — choisir un kind liste les BU existantes de ce kind, avec "Demander l’accès"', () => {
    mockUseMyBusinessUnits.mockReturnValue(
      baseUnits({
        data: {
          viewerAccess: 'workspace',
          businessUnits: [
            {
              id: 'bu-1',
              name: 'Agence Lyon',
              kind: 'agency',
              territory: 'Auvergne-Rhône-Alpes',
              specialties: [],
              consultantCount: null,
              teamSize: null,
              leadUserId: null,
              portfolioNote: null,
              capacityAvailableConsultants: null,
              quarterObjective: null,
              status: 'active',
              memberCount: 3,
              viewerIsMember: false,
              viewerAccessRequestStatus: null,
            },
          ],
        },
      }),
    )
    render(<OnboardingBusinessUnitStep onContinue={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Une agence' }))

    expect(screen.getByText('Agence Lyon')).toBeInTheDocument()
    const requestButton = screen.getByRole('button', { name: 'Demander l’accès à Agence Lyon' })
    fireEvent.click(requestButton)
    expect(requestAccessMock).toHaveBeenCalledWith({ id: 'bu-1', name: 'Agence Lyon' })
  })

  it('#2017.18 — sans le rôle team:manage, "en créer une" est masqué et la demande d’accès est le seul geste proposé', () => {
    mockUseTeam.mockReturnValue({ team: { workspace: { role: 'sales' } } })
    render(<OnboardingBusinessUnitStep onContinue={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Une BU' }))

    expect(screen.queryByRole('button', { name: 'En créer un autre' })).toBeNull()
    expect(screen.getByText(/Tu n’as pas le rôle nécessaire pour créer un périmètre/)).toBeInTheDocument()
  })

  it('#2017.7 / #2087.17 — avec team:manage, créer un périmètre envoie name+kind+les colonnes EXISTANTES de business_units', async () => {
    render(<OnboardingBusinessUnitStep onContinue={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Une agence' }))
    fireEvent.click(screen.getByRole('button', { name: 'En créer un autre' }))

    fireEvent.change(screen.getByLabelText('Nom du périmètre'), { target: { value: 'Agence Lyon' } })
    fireEvent.change(screen.getByLabelText('Territoire (facultatif)'), {
      target: { value: 'Auvergne-Rhône-Alpes' },
    })
    fireEvent.change(screen.getByLabelText('Consultants (facultatif)'), { target: { value: '5' } })
    fireEvent.change(screen.getByLabelText('Commerciaux (facultatif)'), { target: { value: '2' } })

    fireEvent.click(screen.getByRole('button', { name: 'Créer' }))

    await waitFor(() => expect(createMock).toHaveBeenCalled())
    expect(createMock).toHaveBeenCalledWith({
      name: 'Agence Lyon',
      kind: 'agency',
      territory: 'Auvergne-Rhône-Alpes',
      specialties: [],
      consultantCount: 5,
      teamSize: 2,
      portfolioNote: null,
    })
  })

  it('#2087.12 / #2087.13 — un périmètre porté se représente « Entreprise → Agence → Équipe », puis la phrase de cloisonnement', () => {
    mockUseTeam.mockReturnValue({
      team: {
        workspace: { role: 'owner', name: 'Accenture' },
        members: [{ userId: 'u-herve', fullName: 'Hervé Martin' }],
      },
    })
    mockUseMyBusinessUnits.mockReturnValue(
      baseUnits({
        data: {
          viewerAccess: 'business_unit',
          businessUnits: [
            {
              id: 'bu-1',
              name: 'Agence Toulouse',
              kind: 'agency',
              territory: null,
              specialties: [],
              consultantCount: null,
              teamSize: null,
              leadUserId: 'u-herve',
              portfolioNote: null,
              capacityAvailableConsultants: null,
              quarterObjective: null,
              status: 'active',
              memberCount: 3,
              viewerIsMember: true,
              viewerAccessRequestStatus: null,
            },
          ],
        },
      }),
    )
    render(<OnboardingBusinessUnitStep onContinue={vi.fn()} />)

    const path = screen.getByRole('list', { name: 'Ton périmètre, de l’entreprise à ton équipe' })
    expect(path).toHaveTextContent('Accenture')
    expect(path).toHaveTextContent('Agence Toulouse')
    expect(path).toHaveTextContent('Équipe de Hervé Martin')
    expect(screen.getByText(/Bellum distinguera les ressources du groupe/)).toBeInTheDocument()
  })

  it('#2087.12 — sans périmètre porté, aucune représentation (rien à montrer)', () => {
    render(<OnboardingBusinessUnitStep onContinue={vi.fn()} />)
    expect(screen.queryByTestId('business-unit-scope-path')).toBeNull()
  })

  it('#2017.9 — le nom est obligatoire à la création : un nom vide ne crée rien', () => {
    render(<OnboardingBusinessUnitStep onContinue={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Un territoire' }))
    fireEvent.click(screen.getByRole('button', { name: 'En créer un autre' }))
    fireEvent.click(screen.getByRole('button', { name: 'Créer' }))

    expect(createMock).not.toHaveBeenCalled()
    expect(screen.getByText('Le nom est obligatoire.')).toBeInTheDocument()
  })
})
