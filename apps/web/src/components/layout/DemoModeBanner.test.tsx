import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render as rtlRender, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DemoModeBanner } from './DemoModeBanner'

const render = (ui: React.ReactElement) =>
  rtlRender(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>)

const h = vi.hoisted(() => ({
  credits: null as { is_demo?: boolean } | null,
  logoutMutateAsync: vi.fn(),
}))

vi.mock('@/features/credits/hooks/useCredits', () => ({
  useCredits: () => ({ data: h.credits, isLoading: false, isError: false }),
}))

// #2602.1 — le bandeau est l'indicateur permanent DÉJÀ en place ; c'est donc
// lui qui porte le geste de sortie de la démonstration (`useLogout`, déjà
// utilisé par `ActiveSessionsRow` pour le même besoin : révoquer l'appareil,
// vider le cache, renvoyer vers /login).
vi.mock('@/features/auth/session-manager', () => ({
  sessionManager: { logout: () => h.logoutMutateAsync() },
}))

// 29/09/2026 — le premier clic ne menait nulle part : la sortie est une
// navigation DURE, jamais un `router.navigate` que la page qui se vide peut
// annuler (un autre `navigate` en vol, un garde qui se re-rend).
const assign = vi.fn()

beforeEach(() => {
  h.credits = null
  h.logoutMutateAsync.mockReset()
  h.logoutMutateAsync.mockResolvedValue(undefined)
  assign.mockReset()
  vi.stubGlobal('location', { ...window.location, assign })
})

describe('DemoModeBanner', () => {
  it('renders nothing outside a demo workspace', () => {
    h.credits = { is_demo: false }
    const { container } = render(<DemoModeBanner />)
    expect(container).toBeEmptyDOMElement()
  })

  // #1942.5 — un prospect qui voit Laura répondre en démo doit comprendre que
  // ce n'est pas le modèle qui répond : `demo-turn.ts` sert des réponses
  // ÉCRITES D'AVANCE (`DEMO_CHAT_PROMPTS`), zéro appel réseau. Le bandeau
  // disait déjà « aucun crédit consommé, aucune analyse réelle » sans jamais
  // dire que les réponses elles-mêmes sont préparées à l'avance.
  it("#1942.5 — dit que les réponses sont préparées à l'avance en espace de démonstration", () => {
    h.credits = { is_demo: true }
    render(<DemoModeBanner />)
    expect(screen.getByText(/préparées à l[’']avance/)).toBeInTheDocument()
    // #4463 — le bandeau ne parle plus de crédit : ni « aucun crédit », ni un nombre.
    expect(screen.getByRole('status')).not.toHaveTextContent(/crédit/i)
  })

  // #1942.1 — le bandeau disait « aucun crédit consommé, aucune analyse
  // réelle » sans jamais dire que les dossiers affichés eux-mêmes sont un
  // jeu D'EXEMPLES, pas le portefeuille réel de qui regarde. Une personne
  // qui rejoint une démo verrait sinon des comptes qu'elle pourrait croire
  // siens.
  it('#1942.1 — dit explicitement que les dossiers affichés sont un jeu d’exemples, pas un portefeuille réel', () => {
    h.credits = { is_demo: true }
    render(<DemoModeBanner />)
    expect(screen.getByText(/jeu d.exemples/)).toBeInTheDocument()
    expect(screen.getByText(/pas ton portefeuille réel/)).toBeInTheDocument()
  })

  // #2602.1 — recette en production du 18/09/2026 : une session entrée en
  // démonstration n'en ressortait plus (aucun bandeau « quitter », rien dans
  // le menu compte, rien dans les réglages) — seule issue trouvée : fermer
  // l'onglet. Le bandeau, déjà l'indicateur permanent, porte maintenant le
  // geste de sortie à portée de clic.
  it('#2602.1 — propose un geste explicite pour quitter la démonstration', async () => {
    const user = userEvent.setup()
    h.credits = { is_demo: true }
    render(<DemoModeBanner />)

    const exit = screen.getByRole('button', { name: /démonstration/i })
    await user.click(exit)

    expect(h.logoutMutateAsync).toHaveBeenCalledTimes(1)
  })

  it('29/09 — UN SEUL clic mène à /login (navigation dure, même si la déconnexion échoue)', async () => {
    const user = userEvent.setup()
    h.credits = { is_demo: true }
    h.logoutMutateAsync.mockRejectedValue(new Error('réseau'))
    render(<DemoModeBanner />)

    await user.click(screen.getByRole('button', { name: /démonstration/i }))

    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith('/login'))
    expect(assign).toHaveBeenCalledTimes(1)
  })

  it('#2602.1 — hors démo, aucun geste de sortie ne s’affiche (rien à quitter)', () => {
    h.credits = { is_demo: false }
    render(<DemoModeBanner />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  // #3788.4 — recette 07/10 à 360 px (/contacts) : « MODE DÉMO » chevauchait
  // « Espace de démonstration… ». Le titre n'avait ni `shrink-0` ni
  // `whitespace-nowrap` : écrasé par le bouton « Quitter » (lui-même
  // `shrink-0`, donc incompressible) et le corps `truncate`, son texte
  // débordait de sa boîte au lieu de se tenir en une ligne fixe — la seule
  // chose qui se compresse doit être le corps (`min-w-0`), jamais le
  // titre ni le bouton.
  it('#3788.4 — le titre ne peut jamais déborder sur le corps (largeur fixe, une ligne)', () => {
    h.credits = { is_demo: true }
    render(<DemoModeBanner />)
    const title = screen.getByText('Mode démo')
    expect(title.className).toContain('shrink-0')
    expect(title.className).toContain('whitespace-nowrap')
  })

  // #4191 (recette 3, F3) — « Espace de démonstration… » était coupé par « … » à 1485 px : à partir de
  // 768 px le corps passe à la ligne. Sous 768 px il reste sur UNE ligne : trois lignes de bandeau
  // poussaient le composeur du chat sous la barre d'onglets mobile (E2E focus-plan-mobile-2770).
  it('F3 — sur ordinateur le corps passe à la ligne ; sur mobile le bandeau garde une ligne', () => {
    h.credits = { is_demo: true }
    render(<DemoModeBanner />)
    const banner = screen.getByRole('status')
    expect(banner.className).toMatch(/(^|\s)md:flex-wrap(\s|$)/)
    expect(banner.className).not.toMatch(/(^|\s)flex-wrap(\s|$)/)
    const body = screen.getByText(/jeu d.exemples/)
    expect(body.className).toContain('md:whitespace-normal')
    expect(body.className).toContain('md:overflow-visible')
  })
})
