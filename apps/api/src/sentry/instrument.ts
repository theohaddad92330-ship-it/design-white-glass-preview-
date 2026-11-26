import * as Sentry from '@sentry/nestjs'
import { scrubSentryBreadcrumb, scrubSentryEvent } from '@bellum/contracts'
import { redactForLog } from '../common/observability-privacy'

// `@sentry/profiling-node` ships prebuilt native binaries per Node NAPI version.
// Node 23 (NAPI 131) is not yet covered as of 8.55 → the `require` at import time
// crashes the dev server. We skip profiling for now; re-introduce once Sentry
// ships binaries for the project's Node target or once we pin to an LTS.
const dsn = process.env['SENTRY_DSN']

/**
 * #2442.7 — LA LISTE NE VIT PLUS ICI (GA-26 — un réglage vit à un seul endroit).
 *
 * Ce fichier tenait sa propre liste de noms de clés sensibles. Elle protégeait
 * ce qui partait vers Sentry — et rien d'autre : la même donnée écrite dans la
 * console n'était pas caviardée, parce qu'une deuxième liste, ailleurs, ne la
 * connaissait pas. `common/observability-privacy.ts` porte désormais les deux
 * listes (secrets ET contenu privé), et les trois chemins — console, Sentry,
 * corps d'erreur — les lisent.
 *
 * Le caviardage gagne au passage le DESCRIPTEUR de #2442.8 : là où on écrivait
 * `'[Filtered]'`, on écrit maintenant le type, la taille et l'empreinte — de
 * quoi diagnostiquer (« même corps qu'à la tentative précédente ») sans jamais
 * montrer une ligne du contenu.
 *
 * ⚠️ Ce fichier est importé AVANT le démarrage de Nest (`main.ts`) :
 * `observability-privacy.ts` est pur et ne doit jamais importer `@nestjs/*`.
 */
const scrub = (value: unknown): unknown => redactForLog(value)

/** Strip token/code/secret values out of a logged query string. */
function scrubQueryString(qs: string): string {
  return qs.replace(/(token|code|secret|apikey)=[^&]+/gi, '$1=[Filtered]')
}

if (dsn) {
  Sentry.init({
    dsn,
    // #4618 — Railway n'injecte pas SENTRY_RELEASE / SENTRY_ENVIRONMENT : on lit ce qu'il injecte (le SHA du commit
    // servi, le nom de l'environnement), comme le fait déjà l'IA. Absent partout : pas de release, jamais inventée.
    environment:
      process.env['SENTRY_ENVIRONMENT'] ??
      process.env['RAILWAY_ENVIRONMENT_NAME'] ??
      process.env['NODE_ENV'] ??
      'development',
    release:
      process.env['SENTRY_RELEASE'] ?? process.env['RAILWAY_GIT_COMMIT_SHA'] ?? process.env['GIT_COMMIT'] ?? undefined,
    tracesSampleRate: Number(process.env['SENTRY_TRACES_SAMPLE_RATE'] ?? 1.0),
    sendDefaultPii: false,
    // Defense-in-depth: even though we never log secrets, scrub headers/cookies/
    // body/extra so a future logger.error({ headers, body }) can't leak them.
    beforeSend(event) {
      const req = event.request
      if (req) {
        if (req.headers) req.headers = scrub(req.headers) as typeof req.headers
        if (req.cookies) req.cookies = scrub(req.cookies) as typeof req.cookies
        if (req.data) req.data = scrub(req.data)
        if (typeof req.query_string === 'string') req.query_string = scrubQueryString(req.query_string)
      }
      if (event.extra) event.extra = scrub(event.extra) as typeof event.extra
      if (event.contexts) event.contexts = scrub(event.contexts) as typeof event.contexts
      // #4113 — puis le masque de FORME (e-mails, téléphones, jetons) sur tout
      // ce qui part : message, exception, extra, contexts, request, breadcrumbs.
      // Trace seulement : les réponses d'API et l'écran restent en clair.
      return scrubSentryEvent(event)
    },
    beforeBreadcrumb: breadcrumb => scrubSentryBreadcrumb(breadcrumb),
  })
}
