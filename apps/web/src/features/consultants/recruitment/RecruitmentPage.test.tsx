import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import type { RecruitmentColumn } from '@bellum/contracts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { RecruitmentPage } from './RecruitmentPage'
import { useChangeRecruitmentStage, useRecruitmentBoard } from './recruitment-hooks'

vi.mock('./recruitment-hooks', () => ({ useRecruitmentBoard: vi.fn(), useChangeRecruitmentStage: vi.fn() }))

const card = (over: Record<string, unknown> = {}) => ({
  talentId: '00000000-0000-4000-8000-000000000001',
  fullName: 'Sophie Ledran',
  title: 'Architecte SAP',
  location: 'Lyon',
  relation: 'freelance',
  stage: 'to_qualify',
  stageSince: null,
  reason: null,
  plannedAt: null,
  ...over,
})

function board(columns: Partial<Record<string, unknown[]>>): RecruitmentColumn[] {
  return ['to_qualify', 'call_planned', 'qualified', 'on_hold', 'discarded'].map(stage => ({
    stage,
    cards: columns[stage] ?? [],
  })) as RecruitmentColumn[]
}

function mockBoard(columns: RecruitmentColumn[], extra: Record<string, unknown> = {}) {
  vi.mocked(useRecruitmentBoard).mockReturnValue({
    data: columns,
    isLoading: false,
    isError: false,
    ...extra,
  } as unknown as ReturnType<typeof useRecruitmentBoard>)
}

const mutateAsync = vi.fn()

describe('RecruitmentPage — Théo C talents-recrutement', () => {
  beforeEach(() => {
    mutateAsync.mockReset().mockResolvedValue({ id: 'e1' })
    vi.mocked(useChangeRecruitmentStage).mockReturnValue({ mutateAsync, isPending: false } as unknown as ReturnType<
      typeof useChangeRecruitmentStage
    >)
  })
  afterEach(cleanup)

  it('N1 — les cinq colonnes de Théo, avec leur effectif, vides comprises', async () => {
    mockBoard(board({ to_qualify: [card()], qualified: [card({ talentId: 'b' }), card({ talentId: 'c' })] }))
    renderWithRouter(<RecruitmentPage />)
    for (const [label, count] of [
      ['À qualifier', 1],
      ['Échange prévu', 0],
      ['Qualifié', 2],
      ['En veille', 0],
      ['Écartée', 0],
    ] as const) {
      const column = await screen.findByRole('region', { name: new RegExp(`^${label}`) })
      expect(within(column).getByText(String(count))).toBeInTheDocument()
    }
    expect(screen.getAllByText('Aucun profil à cette étape.')).toHaveLength(3)
  })

  it('une carte dit la personne : nom, métier, ville · relation — jamais ses présentations', async () => {
    mockBoard(board({ to_qualify: [card()] }))
    renderWithRouter(<RecruitmentPage />)
    expect(await screen.findByText('Sophie Ledran')).toBeInTheDocument()
    expect(screen.getByText('Architecte SAP')).toBeInTheDocument()
    expect(screen.getByText(/Lyon/)).toBeInTheDocument()
    expect(screen.getByText(/Freelance/)).toBeInTheDocument()
  })

  it('une valeur absente ne s’affiche pas : pas de relation inventée, pas de « 0 »', async () => {
    mockBoard(board({ to_qualify: [card({ relation: null, location: null, title: null })] }))
    renderWithRouter(<RecruitmentPage />)
    await screen.findByText('Sophie Ledran')
    expect(screen.queryByText(/inconnu/i)).toBeNull()
  })

  it('N1/N2 — « Changer l’étape » ouvre la fenêtre, dit l’indépendance, et enregistre étape + motif', async () => {
    mockBoard(board({ to_qualify: [card()] }))
    renderWithRouter(<RecruitmentPage />)
    fireEvent.click(await screen.findByRole('button', { name: /Changer l’étape.*Sophie Ledran/ }))
    expect(
      await screen.findByText(
        'Cette étape ne change pas ses présentations sur les besoins ni ses affectations de mission.',
      ),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: 'En veille' }))
    expect(screen.getByRole('radiogroup', { name: 'Étape de recrutement' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Retour ou motif'), { target: { value: 'Repasse en janvier' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        talentId: '00000000-0000-4000-8000-000000000001',
        input: { stage: 'on_hold', reason: 'Repasse en janvier' },
      }),
    )
  })

  it('la date d’échange n’est proposée qu’à « Échange prévu »', async () => {
    mockBoard(board({ to_qualify: [card()] }))
    renderWithRouter(<RecruitmentPage />)
    fireEvent.click(await screen.findByRole('button', { name: /Changer l’étape/ }))
    expect(screen.queryByLabelText('Date de l’échange')).toBeNull()
    fireEvent.click(screen.getByRole('radio', { name: 'Échange prévu' }))
    expect(screen.getByLabelText('Date de l’échange')).toBeInTheDocument()
  })

  it('le badge du rendez-vous est sur la carte, et le motif consigné y est lisible', async () => {
    mockBoard(
      board({
        call_planned: [card({ stage: 'call_planned', plannedAt: '2026-10-28T08:00:00.000Z' })],
        on_hold: [card({ talentId: 'z', stage: 'on_hold', reason: 'Repasse en janvier' })],
      }),
    )
    renderWithRouter(<RecruitmentPage />)
    expect(await screen.findByText(/Échange le/)).toBeInTheDocument()
    expect(screen.getByText('Repasse en janvier')).toBeInTheDocument()
  })

  it('la carte renvoie à la fiche de la personne', async () => {
    mockBoard(board({ to_qualify: [card()] }))
    renderWithRouter(<RecruitmentPage />)
    const link = await screen.findByRole('link', { name: 'Sophie Ledran' })
    expect(link.getAttribute('href')).toBe('/consultants/00000000-0000-4000-8000-000000000001')
  })

  it('la barre Vivier · Recrutement est là, sans Présentations (#4528.1), Recrutement est l’écran courant', async () => {
    mockBoard(board({}))
    renderWithRouter(<RecruitmentPage />)
    expect(await screen.findByRole('link', { name: 'Vivier' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Présentations' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Recrutement' }).getAttribute('aria-current')).toBe('page')
  })

  it('la durée de conservation est dite une fois, sous « En veille »', async () => {
    mockBoard(board({}))
    renderWithRouter(<RecruitmentPage />)
    const column = await screen.findByRole('region', { name: /^En veille/ })
    expect(within(column).getByText(/reste dans le vivier tant que son consentement est valable/)).toBeInTheDocument()
    expect(screen.getAllByText(/tant que son consentement est valable/)).toHaveLength(1)
  })

  it('« Ajouter un profil » ouvre la porte d’enregistrement du vivier (la même, jamais une seconde)', async () => {
    mockBoard(board({}))
    renderWithRouter(<RecruitmentPage />)
    const link = await screen.findByRole('link', { name: 'Ajouter un profil' })
    expect(link.getAttribute('href')).toContain('/consultants')
    expect(link.getAttribute('href')).toContain('new=true')
  })

  it('une erreur de chargement est dite — pas un tableau vide', async () => {
    mockBoard([], { data: undefined, isError: true })
    renderWithRouter(<RecruitmentPage />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger le recrutement')
  })
})
