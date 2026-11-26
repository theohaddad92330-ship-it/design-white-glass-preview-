import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiFetch, ApiError } from '@/lib/api'
import { resetLauraIntro, useLauraOpenRequest } from '@/features/laura/bubble/laura-intro-store'
import { ValidateContextStatus } from './ValidateContextStatus'

const apiFetchMock = vi.mocked(apiFetch)

// #2075.24/.27/.28 — même parti pris que `InvoiceReadinessPanel.test.tsx` :
// la bulle du copilote a ses propres tests, ce module prouve seulement que le
// geste est PROPOSÉ (repli `<Link>` d'`AskLaura`), pas ce que la bulle en fait.
vi.mock('@/features/laura/bubble/laura-intro-store', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/laura/bubble/laura-intro-store')>()),
  useAskLauraIntro: () => false,
}))
// Même mock que `WelcomeScreen.test.tsx` : un `<a>` qui garde `to`/`search`
// lisibles, sans monter de vrai routeur.
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    search,
    ...rest
  }: { children: ReactNode; to: string; search?: unknown } & Record<string, unknown>) => (
    <a href={to} data-to={to} data-search={JSON.stringify(search ?? {})} {...rest}>
      {children}
    </a>
  ),
}))

// useFirstName lit le drapeau démo via useCredits (R21-FIX) : hors démo ici, sans session ni requête.
vi.mock('@/features/credits/hooks/useCredits', () => ({ useCredits: () => ({ data: undefined }) }))
vi.mock('@/features/profiles/hooks/useProfile', () => ({
  useProfile: () => ({ data: { first_name: 'Maëlle' } }),
}))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { email: 'maelle@example.com' } }) }))

function wrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

function renderStatus(validatedAt: string | null) {
  return render(<ValidateContextStatus validatedAt={validatedAt} />, { wrapper: wrapper() })
}

/**
 * D9 — décision Louis 14/09/2026 : valider le contexte commercial.
 *
 * Ces quatre tests prouvent exactement les quatre preuves demandées :
 * le bouton existe et porte un nom, le clic déclenche le POST, l'état
 * « Validé le … » se rend sans second aller-retour, et une erreur affiche le
 * message DE L'API — jamais « Bad Request ».
 */
describe('ValidateContextStatus', () => {
  beforeEach(() => apiFetchMock.mockReset())

  it('affiche un bouton « Valider » nommé quand le contexte n’est pas encore validé', () => {
    renderStatus(null)

    const button = screen.getByRole('button', { name: 'Valider' })
    expect(button).toBeInTheDocument()
    expect(button).toHaveAttribute('type', 'button')
  })

  it('au clic, POST /profile-context/validate puis affiche « Validé le … par … » sans rechargement', async () => {
    apiFetchMock.mockResolvedValueOnce({
      profile_context: {},
      status: 'validated',
      validatedAt: '2026-09-14T10:00:00.000Z',
    })
    renderStatus(null)
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Valider' }))

    expect(apiFetchMock).toHaveBeenCalledWith({ path: '/profile-context/validate', method: 'POST' })
    expect(await screen.findByText(/Validé le 14 septembre 2026 par Maëlle/)).toBeInTheDocument()
    // Le bouton disparaît : il n'y a plus rien à valider une fois validé.
    expect(screen.queryByRole('button', { name: 'Valider' })).toBeNull()
  })

  // #2075.25 — le message de remerciement ne se rend QU'à l'INSTANT où le
  // clic vient de valider (réponse de la mutation), jamais sur un rechargement.
  it('#2075.25 — au clic, affiche EN PLUS le message « Merci … j’ai maintenant suffisamment de contexte »', async () => {
    apiFetchMock.mockResolvedValueOnce({
      profile_context: {},
      status: 'validated',
      validatedAt: '2026-09-14T10:00:00.000Z',
    })
    renderStatus(null)
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Valider' }))

    expect(await screen.findByText('Merci Maëlle ! J’ai maintenant suffisamment de contexte.')).toBeInTheDocument()
  })

  it('rend directement « Validé le … » quand le contexte arrive déjà validé (pas de rechargement nécessaire)', () => {
    renderStatus('2026-09-10T08:00:00.000Z')

    expect(screen.getByText(/Validé le 10 septembre 2026 par Maëlle/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Valider' })).toBeNull()
  })

  // #2075.25 — un contexte déjà validé AVANT ce montage (rechargement de
  // page, ou revisite ultérieure) ne réaffiche jamais le message ponctuel :
  // ce n'est plus « l'instant » de la validation.
  it('#2075.25 — ne réaffiche PAS le message de remerciement sur un contexte déjà validé au montage', () => {
    renderStatus('2026-09-10T08:00:00.000Z')

    expect(screen.queryByText(/J’ai maintenant suffisamment de contexte/)).toBeNull()
  })

  it('affiche le message d’erreur DE L’API — jamais « Bad Request »', async () => {
    apiFetchMock.mockRejectedValueOnce(
      new ApiError('Aucun contexte de profil généré : rien à valider.', 409, 'no_profile_context'),
    )
    renderStatus(null)
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Valider' }))

    await waitFor(() => {
      expect(screen.getByText('Aucun contexte de profil généré : rien à valider.')).toBeInTheDocument()
    })
    expect(screen.queryByText(/Bad Request/)).toBeNull()
    // L'échec n'a pas validé le contexte : le bouton reste, pour réessayer.
    expect(screen.getByRole('button', { name: 'Valider' })).toBeInTheDocument()
  })
})

// #2010.1 / #2010.17 — tranché par Louis 22/09 soir (decisions-louis-22-09-soir.md
// §1) : un résultat IA qui remplace une version antérieure n'est pas encore
// la vérité tant qu'il n'a pas été validé.
describe('ValidateContextStatus — #2010.1/.17 (revue en attente)', () => {
  beforeEach(() => apiFetchMock.mockReset())

  it('n’affiche AUCUNE bannière de revue pour une première génération (isPendingReview absent)', () => {
    renderStatus(null)
    expect(screen.queryByTestId('validate-pending-review')).not.toBeInTheDocument()
  })

  it('affiche la bannière « une nouvelle version remplace la précédente » quand isPendingReview est vrai', () => {
    render(<ValidateContextStatus validatedAt={null} isPendingReview />, { wrapper: wrapper() })
    expect(screen.getByTestId('validate-pending-review')).toHaveTextContent(
      'Une nouvelle version de ton profil remplace la précédente',
    )
    // Le bouton Valider reste : la revue se fait EN validant.
    expect(screen.getByRole('button', { name: 'Valider' })).toBeInTheDocument()
  })

  it('ne montre plus la bannière une fois le contexte validé', () => {
    render(<ValidateContextStatus validatedAt="2026-09-22T10:00:00.000Z" isPendingReview />, { wrapper: wrapper() })
    expect(screen.queryByTestId('validate-pending-review')).not.toBeInTheDocument()
  })
})

/**
 * #2075.24 / #2075.27 / #2075.28 — LAURA PREND LE RELAIS APRÈS VALIDATION.
 *
 * Rebranchement sur des mécanismes déjà là (épopée #2774, §« Points repris »
 * exclut explicitement ces trois points) : `AskLaura` (D44, jamais un second
 * moteur) pour la conversation dédiée, la même donnée que
 * `FirstAnalysisSuggestionsGrid` pour « compte à tester », et le filtre RÉEL
 * `availability=immediate` (déjà dans `consultantAvailabilitySchema`) pour
 * « consultant à positionner » — jamais un nom inventé.
 */
describe('ValidateContextStatus — #2075.24/.27/.28 (relais après validation)', () => {
  const suggestion = { companyName: 'Société Générale', sector: 'Banque', reason: 'secteur cible déclaré' }

  beforeEach(() => apiFetchMock.mockReset())

  it("#2075.24 — au clic sur Valider, propose une question DÉDIÉE à Laura (pas d'envoi seul)", async () => {
    apiFetchMock.mockResolvedValueOnce({
      profile_context: {},
      status: 'validated',
      validatedAt: '2026-09-24T10:00:00.000Z',
    })
    render(
      <ValidateContextStatus validatedAt={null} weeklyPriorityAction="Combien de secteurs vises-tu vraiment ?" />,
      {
        wrapper: wrapper(),
      },
    )
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Valider' }))

    // #4309.1 (lot LAURA, 19/10/2026) — sur bureau, le relais ouvre la bulle SUR PLACE : un bouton qui
    // dépose la question dans le magasin de Laura, lue ici comme la bulle la lit.
    resetLauraIntro()
    await user.click(await screen.findByRole('button', { name: /Laura/ }))
    // la question part du VRAI calcul (`weeklyPriorityAction`), jamais une phrase inventée
    expect(renderHook(() => useLauraOpenRequest()).result.current?.question).toContain(
      'Combien de secteurs vises-tu vraiment',
    )
  })

  it('#2075.24 — sans priorité calculée, la question reste réelle (générique, jamais devinée)', async () => {
    apiFetchMock.mockResolvedValueOnce({
      profile_context: {},
      status: 'validated',
      validatedAt: '2026-09-24T10:00:00.000Z',
    })
    render(<ValidateContextStatus validatedAt={null} weeklyPriorityAction={null} />, { wrapper: wrapper() })
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Valider' }))

    expect(await screen.findByRole('button', { name: /Laura/ })).toBeInTheDocument()
  })

  it('#2075.27/.28 — propose LE compte à tester des suggestions, le clic ouvre /search PRÉREMPLI', async () => {
    apiFetchMock.mockResolvedValueOnce({
      profile_context: {},
      status: 'validated',
      validatedAt: '2026-09-24T10:00:00.000Z',
    })
    render(<ValidateContextStatus validatedAt={null} firstAnalysisSuggestions={[suggestion]} />, { wrapper: wrapper() })
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Valider' }))

    const link = await screen.findByRole('link', { name: /Société Générale/ })
    expect(link).toHaveAttribute('data-to', '/search')
    const search = JSON.parse(link.getAttribute('data-search') ?? '{}')
    expect(search).toMatchObject({ company: 'Société Générale', suggestionReason: 'secteur cible déclaré' })
  })

  it('#2075.27 — sans aucune suggestion, ne propose PAS un compte inventé (on n’affiche pas ce qu’on n’a pas)', async () => {
    apiFetchMock.mockResolvedValueOnce({
      profile_context: {},
      status: 'validated',
      validatedAt: '2026-09-24T10:00:00.000Z',
    })
    render(<ValidateContextStatus validatedAt={null} firstAnalysisSuggestions={[]} />, { wrapper: wrapper() })
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Valider' }))

    await screen.findByRole('button', { name: /Laura/ })
    expect(screen.queryByTestId('validate-handoff-account')).not.toBeInTheDocument()
  })

  it('#2075.27/.28 — propose « consultant à positionner » vers le vivier filtré RÉELLEMENT disponible', async () => {
    apiFetchMock.mockResolvedValueOnce({
      profile_context: {},
      status: 'validated',
      validatedAt: '2026-09-24T10:00:00.000Z',
    })
    render(<ValidateContextStatus validatedAt={null} />, { wrapper: wrapper() })
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Valider' }))

    const link = await screen.findByTestId('validate-handoff-consultant')
    expect(link).toHaveAttribute('data-to', '/consultants')
    expect(JSON.parse(link.getAttribute('data-search') ?? '{}')).toEqual({ availability: 'immediate' })
  })

  it('n’affiche AUCUN relais tant que le contexte n’a pas ÉTÉ JUSTE validé (déjà validé au montage)', () => {
    render(<ValidateContextStatus validatedAt="2026-09-20T08:00:00.000Z" weeklyPriorityAction="Une action" />, {
      wrapper: wrapper(),
    })
    expect(screen.queryByTestId('validate-handoff')).not.toBeInTheDocument()
  })
})
