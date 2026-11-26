import { type ErrorComponentProps, useRouterState } from '@tanstack/react-router'
import * as Sentry from '@sentry/react'
import { ensureError } from '@bellum/errors'
import { resolveProductScreen } from '@bellum/contracts'

import { ApiErrorHandler } from '@/components/error-handler'
import { CrashPage } from '@/components/organisms/crash-page'
import { NotFound } from '@/components/organisms/not-found'
import { StaleBuildPage } from '@/components/organisms/stale-build-page'
import { TemporaryFailureScreen } from '@/components/organisms/temporary-failure-screen'
import { InvalidLinkMessage } from '@/components/organisms/invalid-link-message'
import { isStaleBuildError } from '@/lib/stale-build'
import { GenericProblemMessage } from '@bellum/ui'
import { ProblemIconCycle } from '@/components/feedback/AnimatedProblemIcons'
import { ProblemIllustration } from '@/components/feedback/ProblemIllustration'
import { trackErrorShown } from '@/lib/product-tracker'
import {
  ApiError,
  FunctionnalProblemError,
  InvalidLinkError,
  NotFoundError,
  SHOULD_REPORT_SENTRY_PER_CODE,
  TemporaryProblemError,
} from '@/lib/hooks/use-crash'

// #1687.3 — LA FRONTIÈRE D'ERREUR, exactement l'endroit où l'utilisateur VOIT
// l'erreur (pas où elle est levée). `RootErrorBoundary` est le
// `defaultErrorComponent` du routeur (`router.tsx`) : elle catche tout rendu
// d'écran qui échoue, sur TOUTES les routes — un seul câblage couvre donc
// l'ensemble du produit, pas un échantillon.
//
// `errorCode` est TOUJOURS un CODE fermé, jamais le message de l'erreur (qui
// peut porter une donnée de compte) : le code de `ApiError` (`ApiErrorCode`,
// une énumération fermée), ou un littéral fixe par CLASSE d'erreur pour les
// quatre autres branches. Pour le crash générique, `error.constructor.name`
// est repris tel quel — c'est déjà ce que Sentry reçoit deux lignes plus bas
// (`errorType`), jamais un contenu utilisateur.
//
// `screen` suit le même repliement que `router.tsx` (`resolveProductScreen`
// sur le pathname COURANT, via `useRouterState` plutôt que sur
// `event.toLocation` qui n'existe pas ici) : la fiche `/accounts/<uuid>` qui a
// crashé se range sous `/accounts/$id`, jamais sous son identifiant.
const UNKNOWN_ERROR_SCREEN = '(hors catalogue)'

export function RootErrorBoundary(props: ErrorComponentProps) {
  const pathname = useRouterState({ select: state => state.location.pathname })
  const screen = resolveProductScreen(pathname)?.route ?? UNKNOWN_ERROR_SCREEN
  const error = ensureError(props.error)
  const componentStack = props.info?.componentStack

  if (error instanceof ApiError) {
    if (SHOULD_REPORT_SENTRY_PER_CODE[error.code]) {
      Sentry.captureException(error, {
        tags: { boundary: 'root', errorType: 'ApiError', apiCode: error.code },
        extra: { componentStack },
      })
    }
    trackErrorShown(screen, error.code)
    return <ApiErrorHandler err={error} />
  }

  if (error instanceof TemporaryProblemError) {
    trackErrorShown(screen, 'TEMPORARY_PROBLEM')
    return <TemporaryFailureScreen />
  }

  if (error instanceof FunctionnalProblemError) {
    trackErrorShown(screen, 'FUNCTIONAL_PROBLEM')
    return (
      <GenericProblemMessage
        title={error.params.title}
        principalMessage={error.params.principalMessage}
        firstSubText={error.params.firstSubText}
        secondSubText={error.params.secondSubText}
        icon={<ProblemIconCycle className="text-[var(--bellum-text-accent)]" />}
        illustration={<ProblemIllustration />}
        buttonText={error.params.buttonText}
        onButtonClick={error.params.onButtonClick}
      />
    )
  }

  if (error instanceof NotFoundError) {
    trackErrorShown(screen, 'NOT_FOUND_CLIENT')
    return <NotFound message={error.message} />
  }

  if (error instanceof InvalidLinkError) {
    trackErrorShown(screen, 'INVALID_LINK')
    return <InvalidLinkMessage />
  }

  // Onglet ouvert pendant un déploiement : le chunk demandé n'existe plus sur
  // le serveur. Ce n'est pas un bug de l'app, c'est une page périmée — on
  // recharge (l'écran s'en charge) et on n'envoie rien à Sentry, sinon chaque
  // déploiement remplit le projet d'un bruit qu'aucune correction ne fera taire.
  // Même logique ici : ce n'est pas une friction produit, donc pas d'émission.
  if (isStaleBuildError(error)) {
    return <StaleBuildPage />
  }

  Sentry.captureException(error, {
    tags: { boundary: 'root', errorType: error.constructor.name },
    extra: { componentStack },
  })
  trackErrorShown(screen, error.constructor.name)

  return <CrashPage />
}
