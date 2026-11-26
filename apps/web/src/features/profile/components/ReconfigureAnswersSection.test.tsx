import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EsnAnswers, OnboardingStateResponse } from '@bellum/contracts'
import { TEMPS1_QUESTION_KEYS } from '@/features/onboarding/lib/questions'
import { ReconfigureAnswersSection } from './ReconfigureAnswersSection'

/**
 * #2022 — l'ENTRÉE de la reconfiguration guidée.
 *
 * `POST /onboarding/refresh` est la seule arête qui pose `refresh_required`, et
 * `refresh_required` est la seule chose que lit `resolveOnboardingEntry` pour
 * ouvrir la page de reconfiguration. L'endpoint existait, testé, sans AUCUN
 * appelant web : la reconfiguration était inatteignable depuis le produit. Ce
 * fichier tient les deux bouts — le geste existe, et il est EXPLICITE.
 */

const h = vi.hoisted(() => ({
  navigate: vi.fn(),
  refreshMutate: vi.fn().mockResolvedValue(undefined),
  toastError: vi.fn(),
  startTour: vi.fn(),
  state: { status: 'completed' } as unknown as OnboardingStateResponse,
  answers: {} as EsnAnswers,
  credits: { is_demo: false } as { is_demo: boolean } | null,
}))

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => h.navigate }))
vi.mock('sonner', () => ({ toast: { error: h.toastError } }))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => (options ? `${key}:${JSON.stringify(options)}` : key),
  }),
}))
vi.mock('@/features/onboarding/hooks/useOnboarding', () => ({
  useOnboardingState: () => ({ data: h.state }),
  useRequestOnboardingRefresh: () => ({ mutateAsync: h.refreshMutate, isPending: false }),
}))
vi.mock('@/features/profile/hooks/useEsnProfile', () => ({
  useEsnProfile: () => ({ data: h.answers }),
}))
vi.mock('@/features/credits/hooks/useCredits', () => ({
  useCredits: () => ({ data: h.credits }),
}))
vi.mock('@/features/product-tour/product-tour-store', () => ({
  useProductTourStore: (selector: (state: { start: () => void }) => unknown) => selector({ start: h.startTour }),
}))

/**
 * Toutes les questions du Temps 1, renseignées — DÉRIVÉES du parcours, jamais
 * recopiées. `reconfigurationPlan` compte sur `TEMPS1_QUESTION_KEYS` : une
 * liste figée ici deviendrait fausse à la première question ajoutée, et le
 * test rougirait pour une raison qui n'a rien à voir avec ce qu'il garde.
 * Mesuré le 15/09/2026 : les dix clés écrites en dur dataient d'un
 * questionnaire à 19 questions ; il en pose 72.
 */
const FULL_ANSWERS = Object.fromEntries(TEMPS1_QUESTION_KEYS.map(key => [key, 'rempli'])) as unknown as EsnAnswers

/** Deux clés du parcours, prises à la fin pour ne dépendre d'aucun libellé. */
const [MISSING_A, MISSING_B] = TEMPS1_QUESTION_KEYS.slice(-2)

function textOf(): string {
  return document.body.textContent ?? ''
}

describe('#2022 — ReconfigureAnswersSection', () => {
  beforeEach(() => {
    h.navigate.mockClear()
    h.refreshMutate.mockClear()
    h.refreshMutate.mockResolvedValue(undefined)
    h.toastError.mockClear()
    h.startTour.mockClear()
    h.state = { status: 'completed' } as unknown as OnboardingStateResponse
    h.answers = FULL_ANSWERS
    h.credits = { is_demo: false }
  })

  /**
   * #2021 (recette démo 03/10/2026, DÉCISION TRANCHÉE — brief N08, 07/10/2026)
   * — réfuté : le lien était ABSENT en démo. Il reste maintenant visible, mais
   * son geste ouvre la visite guidée EXISTANTE (le survol produit) au lieu du
   * vrai flux d'onboarding : l'espace démo est PARTAGÉ, et `POST
   * /onboarding/refresh` y écrirait `refresh_required` pour le prospect
   * SUIVANT.
   */
  it('en démo : propose la visite guidée existante, jamais le vrai flux d’onboarding', async () => {
    h.credits = { is_demo: true }
    render(<ReconfigureAnswersSection />)
    const cta = screen.getByRole('button', { name: 'reconfigure.cta' })

    await act(async () => {
      cta.click()
    })

    expect(h.refreshMutate).not.toHaveBeenCalled()
    expect(h.navigate).not.toHaveBeenCalled()
    expect(h.startTour).toHaveBeenCalledTimes(1)
  })

  it('ne propose RIEN avant même d’avoir démarré (not_started)', () => {
    // `requestRefresh` refuse encore ce départ (`invalid_transition`) : le
    // proposer avant tout démarrage offrirait un bouton que le serveur refuse.
    h.state = { status: 'not_started' } as unknown as OnboardingStateResponse
    const { container } = render(<ReconfigureAnswersSection />)
    expect(container).toBeEmptyDOMElement()
  })

  /**
   * #2021 (recette écran 27/09/2026, DÉCISION Louis) — réfuté sur l'espace
   * RÉEL de Louis : `in_progress` n'était pas un état terminal, donc ce
   * jumeau restait invisible pour un compte pourtant déjà PASSÉ par
   * l'onboarding. « Tout statut postérieur à `not_started` », pas seulement
   * `completed`/`activated`.
   */
  it('propose la reconfiguration dès `in_progress` — tout statut postérieur au démarrage, pas seulement un état terminal', () => {
    h.state = { status: 'in_progress' } as unknown as OnboardingStateResponse
    render(<ReconfigureAnswersSection />)
    expect(screen.getByRole('button', { name: 'reconfigure.cta' })).toBeInTheDocument()
  })

  it('demande la reconfiguration puis ouvre le parcours, sur un geste explicite', async () => {
    render(<ReconfigureAnswersSection />)
    const cta = screen.getByRole('button', { name: 'reconfigure.cta' })

    await act(async () => {
      cta.click()
    })

    expect(h.refreshMutate).toHaveBeenCalledTimes(1)
    expect(h.navigate).toHaveBeenCalledWith({ to: '/onboarding' })
  })

  it('ne navigue pas si la demande échoue — un état non posé ne s’annonce pas', async () => {
    h.refreshMutate.mockRejectedValueOnce(new Error('boom'))
    render(<ReconfigureAnswersSection />)

    await act(async () => {
      screen.getByRole('button', { name: 'reconfigure.cta' }).click()
    })

    expect(h.navigate).not.toHaveBeenCalled()
    expect(h.toastError).toHaveBeenCalledTimes(1)
  })

  /**
   * #2572.1 — mesuré en production le 18/09 : cliquer « Reprendre la
   * reconfiguration » sur un compte DÉJÀ `refresh_required` (avec un
   * `skipped_at` posé APRÈS la demande précédente — un « Plus tard » depuis
   * le questionnaire, #2579.2) rendait `GET /onboarding/state` avec
   * `skipped_at` toujours posé, et `needsOnboarding` (web) renvoyait le
   * compte hors du questionnaire qu'il venait pourtant de redemander — la
   * carte ne l'ouvrait jamais.
   *
   * `refresh_required → refresh_required` EST légal : `transitionTo` (API)
   * le traite en idempotence (#2004.11, succès sans re-transition), donc
   * rappeler `refresh.mutateAsync()` ne fait PAS échouer le geste — c'est le
   * test précédent qui tenait une fausse prémisse. Le clic est le geste
   * humain le plus récent, il doit gagner sur un report plus ancien : cet
   * appel purge le report périmé (côté API, #2572.2) avant de naviguer.
   */
  it('redemande AUSSI une reconfiguration déjà posée — pour effacer un report plus récent (#2572.1)', async () => {
    h.state = { status: 'refresh_required' } as unknown as OnboardingStateResponse
    render(<ReconfigureAnswersSection />)

    await act(async () => {
      screen.getByRole('button', { name: 'reconfigure.resume' }).click()
    })

    expect(h.refreshMutate).toHaveBeenCalledTimes(1)
    expect(h.navigate).toHaveBeenCalledWith({ to: '/onboarding' })
  })

  it('ne navigue pas si la reprise échoue, même sur une reconfiguration déjà posée', async () => {
    h.state = { status: 'refresh_required' } as unknown as OnboardingStateResponse
    h.refreshMutate.mockRejectedValueOnce(new Error('boom'))
    render(<ReconfigureAnswersSection />)

    await act(async () => {
      screen.getByRole('button', { name: 'reconfigure.resume' }).click()
    })

    expect(h.navigate).not.toHaveBeenCalled()
    expect(h.toastError).toHaveBeenCalledTimes(1)
  })

  it('nomme ce qui sera redemandé, et RIEN d’autre', () => {
    h.answers = { ...FULL_ANSWERS, [MISSING_A]: '', [MISSING_B]: [] } as unknown as EsnAnswers
    render(<ReconfigureAnswersSection />)

    const text = textOf()
    expect(text).toContain('reconfigure.missing.some')
    expect(text).toContain('"count":2')
    expect(text).toContain('reconfigure.duration')
    // Les trois autres familles de l'issue (ambigu, contradictoire, obsolète)
    // supposent une date PAR RÉPONSE que rien ne porte : elles ne s'affichent
    // pas, elles se NOMMENT comme non mesurées.
    expect(text).toContain('reconfigure.unmeasured')
  })

  it('n’écrit jamais « 0 minute » quand il n’y a rien à compléter', () => {
    render(<ReconfigureAnswersSection />)

    const text = textOf()
    expect(text).toContain('reconfigure.missing.none')
    // « 0 minute » n'est pas une durée, et une durée inventée serait pire :
    // aucune fourchette n'est rendue quand il n'y a rien à compléter.
    expect(text).not.toContain('reconfigure.duration')
  })
})
