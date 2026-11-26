import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Théo C automations-liste — l'écran « Tes automatisations » : Laura d'abord (champ + trois suggestions),
 * les cartes ensuite, et l'arrivée depuis un dossier de mission (HT-4).
 */
const navigate = vi.fn()
let search: Record<string, unknown> = {}
// #4345.2 — la bulle de Laura : `null` = non atteignable (mobile, surcouche, /chat), sinon l'ouverture sur place.
const openInPlace = vi.fn()
let bubbleReachable = false
vi.mock('@/features/laura/bubble/use-open-laura-in-place', () => ({
  useOpenLauraInPlace: () => (bubbleReachable ? openInPlace : null),
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
  useNavigate: () => navigate,
  useSearch: () => search,
}))
vi.mock('@/components/page/CustomerPage', () => import('./customerPageDouble'))
vi.mock('@/features/laura/bubble/page-context-store', () => ({ useLauraContext: vi.fn() }))
vi.mock('../api', () => ({ useAutomationTrials: () => ({ data: [{ id: 't1' }, { id: 't2' }] }) }))
vi.mock('../useAutomationRows', () => ({
  useAutomationRows: () => ({ rows: [{}, {}, {}], routines: { data: new Array(44).fill({}) }, loading: false }),
}))
vi.mock('./SignalSequencesSection', () => ({ SignalSequencesSection: () => <section>liste des cartes</section> }))

const { AutomationsPage } = await import('./AutomationsPage')

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <AutomationsPage />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  navigate.mockClear()
  openInPlace.mockClear()
  bubbleReachable = false
  search = {}
})

describe('AutomationsPage', () => {
  it('porte le titre et la liste des cartes', () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: 'Tes automatisations' })).toBeInTheDocument()
    expect(screen.getByText('liste des cartes')).toBeInTheDocument()
  })

  it('« Décris ton automatisation » ouvre Laura avec la phrase, rien n’est créé seul', async () => {
    renderPage()
    await userEvent.type(screen.getByLabelText('Décris ton automatisation'), 'relancer les devis')
    await userEvent.click(screen.getByRole('button', { name: 'Construire avec Laura' }))
    expect(navigate).toHaveBeenCalledWith({
      to: '/chat',
      search: { prompt: 'Je veux créer une automatisation : relancer les devis' },
    })
  })

  it('#4345.2 — bulle atteignable : la phrase OUVRE la bulle, sans quitter la page', async () => {
    bubbleReachable = true
    renderPage()
    await userEvent.type(screen.getByLabelText('Décris ton automatisation'), 'relancer les devis')
    await userEvent.click(screen.getByRole('button', { name: 'Construire avec Laura' }))
    expect(openInPlace).toHaveBeenCalledWith('Je veux créer une automatisation : relancer les devis')
    expect(navigate).not.toHaveBeenCalled()
  })

  it('un champ vide ne part pas', async () => {
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Construire avec Laura' }))
    expect(navigate).not.toHaveBeenCalled()
  })

  it('offre trois suggestions vers Laura et le lien vers les routines', () => {
    renderPage()
    expect(screen.getByRole('link', { name: 'Anticiper une fin de mission' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Relancer après 7 jours' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Préparer mes rendez-vous' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Voir les 44 routines' })).toHaveAttribute(
      'href',
      '/actions/automatisations/bibliotheque',
    )
  })

  it('les trois sous-onglets portent leur compteur : 3 automatisations, 44 routines, 2 essais', () => {
    renderPage()
    const nav = screen.getByRole('navigation', { name: 'Automatisations' })
    expect(nav).toHaveTextContent('Mes automatisations3')
    expect(nav).toHaveTextContent('Bibliothèque de routines44')
    expect(nav).toHaveTextContent('Journal des essais2')
  })

  it('le champ de Laura est une zone de texte, avec la promesse « elle naît éteinte »', () => {
    renderPage()
    expect(screen.getByLabelText('Décris ton automatisation').tagName).toBe('TEXTAREA')
    expect(screen.getByText(/elle naît éteinte et rien ne part sans ton geste/)).toBeInTheDocument()
  })

  it('le guide métier est replié, et ne prend pas le nom du lien de la coque (« Comment travailler ici ? »)', () => {
    renderPage()
    const summary = screen.getByText('Ce qu’est une automatisation, et le parcours utile')
    expect(summary.closest('details')).not.toHaveAttribute('open')
    expect(screen.queryByText('Comment travailler ici ?')).not.toBeInTheDocument()
  })

  it('l’en-tête est DÉCLARÉ à la coque : titre, phrase, « Parcourir les routines » — un seul h1', () => {
    renderPage()
    const head = screen.getByTestId('page-head')
    expect(head).toHaveTextContent('Tes automatisations')
    expect(head).toHaveTextContent(/Confie les suivis récurrents à Laura/)
    expect(screen.getByRole('link', { name: 'Parcourir les routines' })).toHaveAttribute(
      'href',
      '/actions/automatisations/bibliotheque',
    )
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('l’ordre de la maquette : guide, bandeau Laura, sous-onglets, puis les cartes', () => {
    const { container } = renderPage()
    const guide = container.querySelector('details')!
    const laura = screen.getByRole('region', { name: 'Dis-moi ce que tu veux déléguer.' })
    const tabs = screen.getByRole('navigation', { name: 'Automatisations' })
    const cards = screen.getByText('liste des cartes')
    const follows = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
    expect(follows(guide, laura)).toBe(true)
    expect(follows(laura, tabs)).toBe(true)
    expect(follows(tabs, cards)).toBe(true)
  })

  it('le bandeau Laura porte son surtitre et son titre de niveau 2', () => {
    renderPage()
    const laura = screen.getByRole('region', { name: 'Dis-moi ce que tu veux déléguer.' })
    expect(laura).toHaveTextContent(/Laura · ton assistante IA/i)
    expect(screen.getByRole('heading', { level: 2, name: 'Dis-moi ce que tu veux déléguer.' })).toBeInTheDocument()
  })

  it('arrivé depuis un dossier de mission (HT-4) : le dit et propose de revenir', () => {
    search = { depuis: 'mission' }
    renderPage()
    expect(screen.getByText(/ancien écran « Suivi de mission »/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Revenir au dossier' })).toBeInTheDocument()
  })

  it('sans arrivée depuis une mission, aucun bandeau', () => {
    renderPage()
    expect(screen.queryByText(/Suivi de mission/)).not.toBeInTheDocument()
  })
})
