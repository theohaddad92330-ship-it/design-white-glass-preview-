import type { Submission } from '@bellum/contracts'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { chooseOption } from '@/test/select'
import { PresentationsPage } from './PresentationsPage'

/**
 * Théo C projects-presentations — la liste autonome : quatre états à l'écran, sorties dans le filtre,
 * entonnoir 30 j, échéance « À préciser » quand elle manque.
 */
const submissions = vi.fn()

vi.mock('../api', () => ({
  useSubmissions: () => submissions(),
  useCreateSubmission: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('@/features/projects/open-needs/hooks/useOpenNeeds', () => ({
  useOpenNeeds: () => ({ data: { data: [] }, isLoading: false }),
}))
vi.mock('@/features/consultants/hooks', () => ({
  useConsultants: () => ({ data: [], isLoading: false }),
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
  useNavigate: () => vi.fn(),
}))
vi.mock('@/components/page/CustomerPage', () => ({
  CustomerPage: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

function sub(over: Partial<Submission> = {}): Submission {
  return {
    id: 'sub-1',
    projectId: 'proj-1',
    projectLabel: 'Renfort SAP',
    accountId: 'acc-1',
    accountName: 'Airbus',
    needId: null,
    needRole: 'Renfort SAP · reprise de données',
    consultantId: 'c-1',
    consultantName: 'Camille Moreau',
    stage: 'submitted',
    substatus: 'presented',
    stageEnteredAt: new Date().toISOString(),
    submittedAt: new Date().toISOString(),
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
    ownerName: 'Théo',
    recipientContactId: null,
    recipientContactName: null,
    channel: 'email',
    message: null,
    availability: null,
    conditions: null,
    consultantAgreement: null,
    consultantAgreementDate: null,
    nextActionLabel: null,
    nextActionDueAt: '2026-10-20T00:00:00.000Z',
    nextActionOwnerId: null,
    nextActionOwnerName: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...over,
  }
}

const loaded = (items: Submission[]) =>
  submissions.mockReturnValue({ data: { items, funnel: undefined }, isLoading: false, isError: false })

afterEach(() => {
  cleanup()
  submissions.mockReset()
})

describe('PresentationsPage', () => {
  // #4502 (PR 12C) — le poste du consultant sous son nom ; absent = aucune ligne (jamais un tiret).
  it('#4502 — le poste du consultant se lit sous son nom, dans la même cellule', () => {
    loaded([sub({ consultantTitle: 'Architecte cloud' })])
    render(<PresentationsPage />)
    const cell = screen.getByText('Camille Moreau').closest('td')!
    expect(within(cell).getByText('Architecte cloud')).toBeTruthy()
    expect(
      Boolean(
        screen.getByText('Camille Moreau').compareDocumentPosition(within(cell).getByText('Architecte cloud')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    ).toBe(true)
  })

  it('#4502 — sans poste (null ou absent), la cellule ne porte que le nom', () => {
    loaded([sub({ id: 'a', consultantTitle: null }), sub({ id: 'b', consultantName: 'Nicolas Petit' })])
    render(<PresentationsPage />)
    expect(screen.queryByTestId('presentation-consultant-title')).toBeNull()
    // L'avatar porte les initiales ; hors elles, la cellule ne dit que le nom.
    expect(screen.getByText('Camille Moreau').parentElement!.textContent).toBe('Camille Moreau')
  })

  it('montre par défaut « En cours » : une sortie ne s’y affiche pas', () => {
    loaded([
      sub({ id: 'a', consultantName: 'Camille Moreau' }),
      sub({ id: 'b', consultantName: 'Nicolas Petit', stage: 'rejected', substatus: 'declined' }),
    ])
    render(<PresentationsPage />)
    expect(screen.getByText('Camille Moreau')).toBeTruthy()
    expect(screen.queryByText('Nicolas Petit')).toBeNull()
    expect(screen.getByText('1 présentation')).toBeTruthy()
  })

  it('« Tous les états » retrouve la sortie — rien ne se perd', async () => {
    loaded([
      sub({ id: 'a' }),
      sub({ id: 'b', consultantName: 'Nicolas Petit', stage: 'rejected', substatus: 'declined' }),
    ])
    render(<PresentationsPage />)
    await chooseOption(screen.getByLabelText('Filtrer par état'), 'Tous les états')
    expect(screen.getByText('Nicolas Petit')).toBeTruthy()
    expect(screen.getByText('2 présentations')).toBeTruthy()
  })

  it('une présélection dit « Aucun envoi consigné » et « Pas encore présentée », jamais un canal supposé', () => {
    loaded([
      sub({
        id: 'p',
        consultantName: 'Claire Dubois',
        stage: 'shortlisted',
        substatus: 'to_qualify',
        submittedAt: null,
        channel: null,
        nextActionDueAt: null,
      }),
    ])
    render(<PresentationsPage />)
    const row = screen.getByText('Claire Dubois').closest('tr') as HTMLElement
    expect(within(row).getByText('Aucun envoi consigné')).toBeTruthy()
    expect(within(row).getByText('Pas encore présentée')).toBeTruthy()
    expect(within(row).getByText('À préciser')).toBeTruthy()
  })

  it('l’entonnoir donne les chiffres par commercial sans zéro inventé', () => {
    loaded([sub({ id: 'a', ownerName: 'Théo' })])
    render(<PresentationsPage />)
    expect(screen.getByText('Présentés')).toBeTruthy()
    expect(screen.getByTestId('presentations-by-owner')).toHaveTextContent('Théo1 en cours')
  })

  it('refonte Théo — l’entonnoir est UNE bande, puis la barre d’outils qui CHERCHE (consultant, besoin, compte)', () => {
    loaded([sub({ id: 'a', consultantName: 'Camille Moreau' }), sub({ id: 'b', consultantName: 'Inès Laurent' })])
    render(<PresentationsPage />)
    const funnel = screen.getByRole('list', { name: 'Entonnoir des 30 derniers jours' })
    const toolbar = screen.getByTestId('presentations-toolbar')
    expect(funnel.compareDocumentPosition(toolbar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    fireEvent.change(within(toolbar).getByPlaceholderText('Consultant, besoin ou compte…'), {
      target: { value: 'Inès' },
    })
    expect(screen.getByText('Inès Laurent')).toBeTruthy()
    expect(screen.queryByText('Camille Moreau')).toBeNull()
  })
})

// #3544 (recette Y20), reporté depuis `SubmissionsView` (#4528.4, retiré avec l'onglet de Talents) — la liste monte
// 50 lignes, le reste sur demande ; la recherche porte sur TOUTES les lignes.
describe('PresentationsPage — la liste ne monte pas 200 lignes d’un coup (#3544)', () => {
  const many = (count: number) =>
    Array.from({ length: count }, (_, i) =>
      sub({ id: `s${i}`, consultantName: `Consultant ${String(i).padStart(3, '0')}` }),
    )

  it('120 présentations : 50 lignes montées, le total dit, un geste montre la suite', () => {
    loaded(many(120))
    render(<PresentationsPage />)
    expect(screen.getAllByText(/^Consultant \d{3}$/)).toHaveLength(50)
    expect(screen.getByText('50 sur 120 présentations affichées')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Afficher les 50 suivants' }))
    expect(screen.getAllByText(/^Consultant \d{3}$/)).toHaveLength(100)
    fireEvent.click(screen.getByRole('button', { name: 'Afficher les 20 suivants' }))
    expect(screen.getAllByText(/^Consultant \d{3}$/)).toHaveLength(120)
  })

  it('SAIT DIRE NON : 50 présentations ou moins, aucun geste « suivants »', () => {
    loaded(many(50))
    render(<PresentationsPage />)
    expect(screen.getAllByText(/^Consultant \d{3}$/)).toHaveLength(50)
    expect(screen.queryByRole('button', { name: /Afficher les/ })).toBeNull()
  })

  it('la recherche porte sur les 120 lignes, pas sur les 50 montées', () => {
    loaded(many(120))
    render(<PresentationsPage />)
    expect(screen.queryByText('Consultant 110')).toBeNull()
    fireEvent.change(screen.getByPlaceholderText('Consultant, besoin ou compte…'), {
      target: { value: 'consultant 110' },
    })
    expect(screen.getByText('Consultant 110')).toBeInTheDocument()
  })
})

// Reporté de `SubmissionsView.test.tsx` (#4528.4, retiré avec l'onglet de Talents) : le tableau et les deux vides.
describe('PresentationsPage — le tableau et les deux vides (GA-197)', () => {
  it('les colonnes de la maquette, dans son ordre', () => {
    loaded([sub()])
    render(<PresentationsPage />)
    const headers = within(screen.getByRole('table'))
      .getAllByRole('columnheader')
      .map(cell => cell.textContent?.trim())
    expect(headers).toEqual([
      'Consultant',
      'Besoin / client',
      'Suivi',
      'Canal / responsable',
      'Prochaine échéance',
      'Ouvrir',
    ])
  })

  it('Suivi : « Présentation consignée le … » avec canal et responsable — jamais une preuve d’envoi', () => {
    loaded([
      sub({ id: 'a', consultantName: 'Marie Dupont', submittedAt: '2026-10-16T09:00:00.000Z', ownerName: 'Théo' }),
    ])
    render(<PresentationsPage />)
    const row = screen.getByText('Marie Dupont').closest('tr')!
    expect(within(row).getByText(/^Présentation consignée le /)).toBeInTheDocument()
    expect(within(row).getByText('E-mail')).toBeInTheDocument()
    expect(within(row).getByText('Théo')).toBeInTheDocument()
  })

  it('« Ouvrir » mène à la présentation', () => {
    loaded([sub({ id: 'a', consultantName: 'Paul Martin' })])
    render(<PresentationsPage />)
    const row = screen.getByText('Paul Martin').closest('tr')!
    expect(within(row).getByRole('link', { name: /Ouvrir/ })).toHaveAttribute('href', '/submissions/$id')
  })

  it('le besoin d’abord (rôle), le libellé de l’affaire quand aucun rôle n’est rattaché', () => {
    loaded([
      sub({ id: 'a', needId: 'need-1', needRole: 'Architecte Cloud AWS' }),
      sub({ id: 'b', consultantName: 'Paul Martin', needRole: null, projectLabel: 'Renfort plateforme' }),
    ])
    render(<PresentationsPage />)
    expect(screen.getByText('Architecte Cloud AWS')).toBeInTheDocument()
    expect(screen.getByText('Renfort plateforme')).toBeInTheDocument()
  })

  it('AUCUNE présentation : le geste « Ajouter une présentation » est proposé', () => {
    loaded([])
    render(<PresentationsPage />)
    expect(screen.getByText('Aucune présentation à afficher')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ajouter une présentation' })).toBeInTheDocument()
  })

  it('un filtre qui ne rend rien : le geste RETIRE le filtre, jamais « créer »', () => {
    loaded([sub({ consultantName: 'Marie Dupont' })])
    render(<PresentationsPage />)
    fireEvent.change(screen.getByPlaceholderText('Consultant, besoin ou compte…'), { target: { value: 'Kaczmarek' } })
    expect(screen.getByText('Aucune présentation ne correspond à ce filtre.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ajouter une présentation' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Tous les états' }))
    expect(screen.getByText('Marie Dupont')).toBeInTheDocument()
  })

  it('un échec n’est pas un vide', () => {
    submissions.mockReturnValue({ data: undefined, isLoading: false, isError: true })
    render(<PresentationsPage />)
    expect(screen.queryByText('Aucune présentation à afficher')).toBeNull()
    expect(screen.queryByRole('table')).toBeNull()
  })
})
