import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'

const navigate = vi.fn()
const openLauraInPlace = vi.hoisted(() => ({ value: null as ((q: string) => void) | null }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>,
  useNavigate: () => navigate,
}))
vi.mock('@/features/laura/bubble/use-open-laura-in-place', () => ({
  useOpenLauraInPlace: () => openLauraInPlace.value,
}))
vi.mock('@/features/knowledge/view/Knowledge', () => ({
  KNOWLEDGE_DOCUMENT_TABS: ['documents', 'templates'],
  KNOWLEDGE_STYLE_TABS: ['style', 'library'],
  Knowledge: ({ tabs }: { tabs?: readonly string[] }) => <p>KNOWLEDGE:{(tabs ?? []).join(',')}</p>,
}))
vi.mock('@/features/routines/view/RoutinesView', () => ({ RoutinesView: () => <p>BIBLIOTHEQUE-ROUTINES</p> }))
vi.mock('@/features/routines/view/RoutineDetailPage', () => ({
  RoutineDetailPage: ({ routineKey, embedded }: { routineKey: string; embedded?: boolean }) => (
    <p>
      DETAIL:{routineKey}:{String(embedded)}
    </p>
  ),
}))
vi.mock('@/features/action-os/view/ApprovalSettingsCard', () => ({
  ApprovalSettingsCard: () => <p>AUTONOMIE-ESPACE</p>,
}))
vi.mock('@/features/laura/view/LauraCataloguePanel', () => ({
  LauraCataloguePanel: () => <p>CATALOGUE-PROPOSITIONS</p>,
}))

const { LauraDocumentsPage } = await import('./LauraDocumentsPage')
const { LauraRoutinesPage } = await import('./LauraRoutinesPage')

beforeEach(async () => {
  await i18n.changeLanguage('fr')
  navigate.mockReset()
  openLauraInPlace.value = null
})

/**
 * Théo D settings-laura.R3 / R4 / N4 / A1 / A2 / A4 / A5 — Réglages › Laura : Documents & références en deux
 * onglets, Routines & veilles avec « Ouvrir avec Laura », l'autonomie, le catalogue et le détail en tiroir.
 */
describe('Réglages › Laura › Documents & références', () => {
  it('deux onglets : « Documents » (ce que Laura cite) et « Style & exemples » (styles appris, bibliothèque)', () => {
    const { unmount } = render(<LauraDocumentsPage tab="documents" onTabChange={vi.fn()} />)
    expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual(['Documents', 'Style & exemples'])
    expect(screen.getByText('KNOWLEDGE:documents,templates')).toBeInTheDocument()
    unmount()

    render(<LauraDocumentsPage tab="style" onTabChange={vi.fn()} />)
    expect(screen.getByText('KNOWLEDGE:style,library')).toBeInTheDocument()
  })

  it('un en-tête (eyebrow Espace · titre · phrase) avant les onglets', () => {
    render(<LauraDocumentsPage tab="documents" onTabChange={vi.fn()} />)
    expect(screen.getByText('Paramètres · Espace')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Documents & références' })).toBeInTheDocument()
    expect(screen.getByText('Retrouver les éléments que tu autorises Laura à mobiliser.')).toBeInTheDocument()
  })
})

describe('Réglages › Laura › Routines & veilles', () => {
  it('porte UN titre « Routines & veilles » sous l’eyebrow Personnel — la bibliothèque est montée en `embedded`', () => {
    render(<LauraRoutinesPage routineKey={undefined} />)
    expect(screen.getByText('Paramètres · Personnel')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Routines & veilles' })).toBeInTheDocument()
  })

  it('suit l’ordre de la maquette : Veilles, Automatisations, Autonomie, puis « Plages et objectifs » en repli fermé', () => {
    render(<LauraRoutinesPage routineKey={undefined} />)
    const text = document.body.textContent ?? ''
    const order = ['Gérer mes veilles', 'BIBLIOTHEQUE-ROUTINES', 'AUTONOMIE-ESPACE'].map(part => text.indexOf(part))
    expect(order.every(index => index >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    const ranges = screen.getByRole('link', { name: 'Voir les règles de l’équipe' }).closest('details')
    expect(ranges).not.toBeNull()
    expect(ranges).not.toHaveAttribute('open')
  })

  it('garde la bibliothèque, l’autonomie, le catalogue de propositions et le renvoi vers les veilles', () => {
    render(<LauraRoutinesPage routineKey={undefined} />)
    expect(screen.getByText('BIBLIOTHEQUE-ROUTINES')).toBeInTheDocument()
    expect(screen.getByText('AUTONOMIE-ESPACE')).toBeInTheDocument()
    expect(screen.getByText('CATALOGUE-PROPOSITIONS')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Gérer mes veilles' })).toHaveAttribute('href', '/signals/watches')
    expect(screen.getByRole('link', { name: 'Voir les règles de l’équipe' })).toHaveAttribute('href', '/team')
    expect(screen.getByRole('link', { name: /Notifications › Réglage fin/ })).toHaveAttribute(
      'href',
      '/settings/notifications',
    )
  })

  it('« Ouvrir avec Laura » PRÉ-REMPLIT la bulle quand elle est joignable — il n’envoie rien', async () => {
    const open = vi.fn()
    openLauraInPlace.value = open
    render(<LauraRoutinesPage routineKey={undefined} />)
    await userEvent.click(screen.getByRole('button', { name: 'Ouvrir avec Laura' }))
    expect(open).toHaveBeenCalledWith(expect.stringContaining('suivi automatique'))
    expect(navigate).not.toHaveBeenCalled()
  })

  it('sinon (mobile, page de chat) il ouvre /chat avec la phrase en `prompt`', async () => {
    render(<LauraRoutinesPage routineKey={undefined} />)
    await userEvent.click(screen.getByRole('button', { name: 'Ouvrir avec Laura' }))
    expect(navigate).toHaveBeenCalledWith({ to: '/chat', search: { prompt: expect.stringContaining('suivi') } })
  })

  it('le détail d’une routine s’ouvre dans un TIROIR quand `?routine=` est posé, la liste restant montée', () => {
    render(<LauraRoutinesPage routineKey="daily_briefing" />)
    expect(screen.getByText('BIBLIOTHEQUE-ROUTINES')).toBeInTheDocument()
    expect(screen.getByText('DETAIL:daily_briefing:true')).toBeInTheDocument()
  })

  it('NON : sans `?routine=` aucun tiroir', () => {
    render(<LauraRoutinesPage routineKey={undefined} />)
    expect(screen.queryByText(/^DETAIL:/)).not.toBeInTheDocument()
  })

  it('refonte Théo — la bannière, UN h1, puis les blocs dans l’ordre de la maquette', () => {
    render(<LauraRoutinesPage routineKey={undefined} />)
    expect(screen.getAllByRole('heading', { level: 1 }).map(h => h.textContent)).toEqual(['Routines & veilles'])
    const banner = screen.getByTestId('routines-banner')
    expect(banner.compareDocumentPosition(screen.getByRole('heading', { level: 1 }))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
    const blocks = screen.getByTestId('routines-blocks')
    const titles = Array.from(blocks.querySelectorAll('h2')).map(h => h.textContent)
    expect(titles[0]).toBe('Veilles sur les comptes')
    expect(titles[titles.length - 1]).toBe('Plages et objectifs')
    expect(blocks).toHaveTextContent(/BIBLIOTHEQUE-ROUTINES[\s\S]*AUTONOMIE-ESPACE[\s\S]*CATALOGUE-PROPOSITIONS/)
  })
})
