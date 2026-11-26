/**
 * Tests the RootErrorBoundary dispatch:
 *   - error type  → correct screen
 *   - Sentry      → only for codes in SHOULD_REPORT_SENTRY_PER_CODE, + all unknowns
 *   - #1687.3     → trackErrorShown fires with {screen, errorCode} ONLY, per branch
 *
 * We don't mount a real TanStack router — we invoke the boundary directly
 * with synthetic ErrorComponentProps.
 */

import { render, screen } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'

// Sentry mock — must be declared BEFORE importing RootErrorBoundary
const captureException = vi.fn()
vi.mock('@sentry/react', () => ({
  captureException: (...args: unknown[]) => captureException(...args),
}))

// TanStack Router useNavigate — screens call it but we don't exercise nav.
// `useRouterState` is new with #1687.3 : RootErrorBoundary reads the current
// pathname to derive the `screen` of `trackErrorShown`.
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useRouterState: () => '/accounts/3f1c4b7a-9e2d-4a11-8b3a-1234567890ab',
}))

// #1687.3 — un espion, pas le module réel : ce test vérifie EXACTEMENT ce que
// chaque branche envoie (screen, errorCode), jamais un contenu de plus.
const trackErrorShown = vi.fn()
vi.mock('@/lib/product-tracker', () => ({
  trackErrorShown: (...args: unknown[]) => trackErrorShown(...args),
}))

import { RootErrorBoundary } from '@/components/templates/error-boundary'
import {
  ApiError,
  FunctionnalProblemError,
  InvalidLinkError,
  NotFoundError,
  TemporaryProblemError,
} from '@/lib/hooks/use-crash'

function renderBoundary(error: unknown) {
  return render(<RootErrorBoundary error={error as Error} reset={vi.fn()} />)
}

describe('RootErrorBoundary', () => {
  beforeEach(() => {
    captureException.mockClear()
    trackErrorShown.mockClear()
  })

  it('renders NotFound with message for NotFoundError', () => {
    renderBoundary(new NotFoundError('test'))
    expect(screen.getByText('test')).toBeInTheDocument()
    expect(screen.getByText('Page introuvable')).toBeInTheDocument()
    expect(captureException).not.toHaveBeenCalled()
  })

  it('renders Unauthorized for ApiError FORBIDDEN without Sentry report', () => {
    renderBoundary(new ApiError('FORBIDDEN', 'nope'))
    expect(screen.getByText('Accès refusé')).toBeInTheDocument()
    expect(screen.getByText('nope')).toBeInTheDocument()
    expect(captureException).not.toHaveBeenCalled()
  })

  it('renders Unauthorized for ApiError UNAUTHORIZED without Sentry report', () => {
    renderBoundary(new ApiError('UNAUTHORIZED', 'login please'))
    expect(screen.getByText('Accès refusé')).toBeInTheDocument()
    expect(captureException).not.toHaveBeenCalled()
  })

  it('renders NotFound for ApiError NOT_FOUND without Sentry report', () => {
    renderBoundary(new ApiError('NOT_FOUND', 'gone'))
    expect(screen.getByText('Page introuvable')).toBeInTheDocument()
    expect(screen.getByText('gone')).toBeInTheDocument()
    expect(captureException).not.toHaveBeenCalled()
  })

  it('renders CrashPage + reports to Sentry for ApiError INTERNAL_ERROR', () => {
    const err = new ApiError('INTERNAL_ERROR', 'boom')
    renderBoundary(err)
    expect(screen.getByText('Oups.')).toBeInTheDocument()
    expect(captureException).toHaveBeenCalledTimes(1)
    expect(captureException).toHaveBeenCalledWith(
      err,
      expect.objectContaining({
        tags: expect.objectContaining({ boundary: 'root', errorType: 'ApiError', apiCode: 'INTERNAL_ERROR' }),
      }),
    )
  })

  it('renders TemporaryFailureScreen for ApiError TIMEOUT without Sentry report', () => {
    renderBoundary(new ApiError('TIMEOUT', 'slow'))
    expect(screen.getByText('Problème temporaire')).toBeInTheDocument()
    expect(captureException).not.toHaveBeenCalled()
  })

  it('renders TemporaryFailureScreen + reports to Sentry for ApiError SERVICE_UNAVAILABLE', () => {
    renderBoundary(new ApiError('SERVICE_UNAVAILABLE', 'down'))
    expect(screen.getByText('Problème temporaire')).toBeInTheDocument()
    expect(captureException).toHaveBeenCalledTimes(1)
  })

  it('renders TemporaryFailureScreen for TemporaryProblemError without Sentry report', () => {
    renderBoundary(new TemporaryProblemError())
    expect(screen.getByText('Problème temporaire')).toBeInTheDocument()
    expect(captureException).not.toHaveBeenCalled()
  })

  it('renders InvalidLinkMessage for InvalidLinkError without Sentry report', () => {
    renderBoundary(new InvalidLinkError())
    expect(screen.getByText('Lien invalide')).toBeInTheDocument()
    expect(captureException).not.toHaveBeenCalled()
  })

  it('renders GenericProblemMessage for FunctionnalProblemError without Sentry report', () => {
    const err = new FunctionnalProblemError({
      title: 'Oh no',
      principalMessage: 'Something happened',
      firstSubText: 'It is fine',
    })
    renderBoundary(err)
    expect(screen.getByText('Oh no')).toBeInTheDocument()
    expect(screen.getByText('Something happened')).toBeInTheDocument()
    expect(captureException).not.toHaveBeenCalled()
  })

  it('renders StaleBuildPage — never CrashPage, never Sentry — for a chunk lost to a deploy', () => {
    renderBoundary(new Error('Failed to fetch dynamically imported module: /assets/index-a1b2c3.js'))
    expect(screen.getByText('Nouvelle version.')).toBeInTheDocument()
    expect(screen.queryByText('Oups.')).not.toBeInTheDocument()
    expect(captureException).not.toHaveBeenCalled()
  })

  it('renders CrashPage + reports to Sentry for unknown Error', () => {
    const err = new Error('unknown')
    renderBoundary(err)
    expect(screen.getByText('Oups.')).toBeInTheDocument()
    expect(captureException).toHaveBeenCalledTimes(1)
    expect(captureException).toHaveBeenCalledWith(
      err,
      expect.objectContaining({
        tags: expect.objectContaining({ boundary: 'root', errorType: 'Error' }),
      }),
    )
  })

  it('renders CrashPage + reports to Sentry for non-Error thrown value', () => {
    renderBoundary('just a string')
    expect(screen.getByText('Oups.')).toBeInTheDocument()
    expect(captureException).toHaveBeenCalledTimes(1)
  })

  /**
   * #1687.3 — la frontière d'erreur émet `trackErrorShown(screen, errorCode)`,
   * et RIEN d'autre : `screen` est le MOTIF de route (`/accounts/$id`, jamais
   * l'UUID réel du mock `useRouterState`), `errorCode` est un CODE fermé —
   * jamais `error.message`, qui pourrait porter un nom de compte client.
   */
  describe('#1687.3 — trackErrorShown, un code fermé par branche, jamais un message', () => {
    it('ApiError : le CODE fermé de l’enum, jamais le message', () => {
      renderBoundary(new ApiError('NOT_FOUND', 'ce message ne doit jamais partir'))
      expect(trackErrorShown).toHaveBeenCalledTimes(1)
      expect(trackErrorShown).toHaveBeenCalledWith('/accounts/$id', 'NOT_FOUND')
    })

    it('TemporaryProblemError : un littéral fixe', () => {
      renderBoundary(new TemporaryProblemError())
      expect(trackErrorShown).toHaveBeenCalledWith('/accounts/$id', 'TEMPORARY_PROBLEM')
    })

    it('FunctionnalProblemError : un littéral fixe, jamais `title`/`principalMessage`', () => {
      renderBoundary(
        new FunctionnalProblemError({
          title: 'un titre qui ne doit jamais partir',
          principalMessage: 'un message métier qui ne doit jamais partir',
          firstSubText: 'idem',
        }),
      )
      expect(trackErrorShown).toHaveBeenCalledWith('/accounts/$id', 'FUNCTIONAL_PROBLEM')
    })

    it('NotFoundError : un littéral fixe, jamais `error.message`', () => {
      renderBoundary(new NotFoundError('un identifiant qui ne doit jamais partir'))
      expect(trackErrorShown).toHaveBeenCalledWith('/accounts/$id', 'NOT_FOUND_CLIENT')
    })

    it('InvalidLinkError : un littéral fixe', () => {
      renderBoundary(new InvalidLinkError())
      expect(trackErrorShown).toHaveBeenCalledWith('/accounts/$id', 'INVALID_LINK')
    })

    it('crash générique : le NOM de la classe (déjà envoyé à Sentry), jamais le message', () => {
      renderBoundary(new Error('un message d’exception qui ne doit jamais partir'))
      expect(trackErrorShown).toHaveBeenCalledWith('/accounts/$id', 'Error')
    })

    it('une valeur non-Error : ne casse jamais l’émission (ensureError l’enveloppe)', () => {
      renderBoundary('just a string')
      expect(trackErrorShown).toHaveBeenCalledTimes(1)
    })

    it('StaleBuildPage : AUCUNE émission — ce n’est pas une friction produit, c’est un rechargement de version', () => {
      renderBoundary(new Error('Failed to fetch dynamically imported module: /assets/index-a1b2c3.js'))
      expect(trackErrorShown).not.toHaveBeenCalled()
    })
  })
})
