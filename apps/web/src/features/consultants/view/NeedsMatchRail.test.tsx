import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { openNeeds, match } = vi.hoisted(() => ({ openNeeds: vi.fn(), match: vi.fn() }))
vi.mock('@/features/projects/open-needs/hooks/useOpenNeeds', () => ({ useOpenNeeds: () => openNeeds() }))
// ⚠️ Le mock REÇOIT son argument et le note. La version qui le jetait laissait
// passer le défaut de production : le rail appelait le classement avec un id de
// BESOIN là où la route attend un id d'AFFAIRE, donc 404, donc « aucun profil »
// affiché pour tous les besoins ouverts.
vi.mock('../hooks', () => ({ useConsultantMatch: (id: string | null) => match(id) }))
vi.mock('@/features/matching/view/TransparencyBanner', () => ({
  TransparencyBanner: () => <div data-testid="transparency-banner" />,
}))

const { NeedsMatchRail } = await import('./NeedsMatchRail')

const NEED_A = { id: 'need-a', project_id: 'project-a', title: 'Chef de projet IA', account_name: 'Astréa' }
const NEED_B = { id: 'need-b', project_id: 'project-b', title: 'Architecte Cloud AWS', account_name: null }

function pushMatch(over: Partial<{ consultant_id: string; full_name: string | null; score: number | null }> = {}) {
  return {
    consultant_id: over.consultant_id ?? 'c1',
    full_name: over.full_name ?? 'Sophie Martin',
    score: over.score === undefined ? 92 : over.score,
    breakdown: [],
    unevaluated: [],
    skills: [],
    reasons: [],
    risks: [],
    blocked: false,
    clientHistory: null,
  }
}

beforeEach(() => {
  openNeeds.mockReset().mockReturnValue({ data: { data: [NEED_A, NEED_B] }, isLoading: false })
  match.mockReset().mockReturnValue({ data: { ranked: [pushMatch()], push: [pushMatch()] }, isLoading: false })
})
afterEach(cleanup)

/**
 * Le rail « Matching suggéré », groupé par besoin (PDF-22 §01, « à garder »).
 */
describe('NeedsMatchRail', () => {
  it('groupe par besoin, chacun avec son propre bandeau de transparence — deux besoins ouverts, deux groupes', () => {
    render(<NeedsMatchRail onOpenInPanel={vi.fn()} />)
    expect(screen.getByText('Chef de projet IA')).toBeInTheDocument()
    expect(screen.getByText('Architecte Cloud AWS')).toBeInTheDocument()
    expect(screen.getByTestId('transparency-banner')).toBeInTheDocument()
  })

  it('ne rend RIEN quand il n’y a aucun besoin ouvert — pas de rail vide qui prend de la place', () => {
    openNeeds.mockReturnValue({ data: { data: [] }, isLoading: false })
    const { container } = render(<NeedsMatchRail onOpenInPanel={vi.fn()} />)
    expect(container.textContent).toBe('')
  })

  it('« Voir tous les matchings (N) » ouvre le MÊME panneau existant, jamais un second moteur', () => {
    const onOpenInPanel = vi.fn()
    render(<NeedsMatchRail onOpenInPanel={onOpenInPanel} />)
    const [button] = screen.getAllByRole('button', { name: /voir tous les matchings/i })
    fireEvent.click(button as HTMLElement)
    // L'AFFAIRE, pas le besoin : c'est la valeur des options du `<select>` du
    // panneau (`/projects`), et l'id que la route de classement sait relire.
    expect(onOpenInPanel).toHaveBeenCalledWith('project-a')
  })

  /**
   * La régression de production du 01/09/2026 : `GET /consultants/match/:id`
   * relit une ligne d'`opportunities`. Le rail lui passait `need.id`, donc 404
   * sur CHAQUE besoin ouvert — et un 404 se lisait « aucun profil ».
   */
  it('classe contre l’AFFAIRE du besoin — un id de besoin rendrait 404 sur toute la ligne', () => {
    render(<NeedsMatchRail onOpenInPanel={vi.fn()} />)
    expect(match).toHaveBeenCalledWith('project-a')
    expect(match).toHaveBeenCalledWith('project-b')
    expect(match).not.toHaveBeenCalledWith('need-a')
  })

  it('un score `null` s’écrit « non mesuré », jamais 0', () => {
    match.mockReturnValue({
      data: { ranked: [pushMatch({ score: null })], push: [pushMatch({ score: null })] },
      isLoading: false,
    })
    const { container } = render(<NeedsMatchRail onOpenInPanel={vi.fn()} />)
    expect(container.textContent).not.toMatch(/\b0\b/)
  })
})
