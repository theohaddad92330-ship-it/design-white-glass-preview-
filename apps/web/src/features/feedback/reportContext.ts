import { captureAppContext, type AppContext } from './appContext'
import { getRecentBreadcrumbs, type Breadcrumb } from './breadcrumbs'
import { getRecentConsole } from './consoleBuffer'
import { getRecentErrors } from './errorBuffer'
import { getRecentNetworkFailures, type NetworkFailure } from './networkBuffer'
import { redactUrl } from './safeUrl'

/**
 * #1960.7 / #1960.8 — LE CONTEXTE D'UN SIGNALEMENT, PRIS UNE FOIS, MONTRÉ, PUIS ENVOYÉ TEL QUEL.
 *
 * Avant ce lot, `FeedbackWidget` relisait les tampons AU MOMENT DE L'ENVOI, sans
 * rien en montrer : la page (adresse complète, requête et ancre comprises), les
 * journaux de la console, les appels en échec, les derniers gestes, le navigateur.
 * Seules la capture et « élément pointé joint » s'affichaient.
 *
 * Deux défauts, une famille :
 *  1. ce qui partait n'était pas montré — on ne peut pas consentir à ce qu'on ne voit pas ;
 *  2. montrer ne suffit pas si l'on renvoie AUTRE CHOSE : un tampon relu au clic
 *     contient ce qui est arrivé entre l'aperçu et l'envoi.
 *
 * D'où un INSTANTANÉ : pris à l'ouverture du formulaire, rendu par l'aperçu, et
 * c'est lui — pas une relecture — que l'envoi transmet. L'aperçu porte donc sur
 * exactement ce qui est utilisé (même règle que `appRouteTarget`).
 *
 * ⚠️ Un signalement est un envoi VOLONTAIRE, pas de l'analytique produit : il ne
 * part que sur un clic, après aperçu. La frontière de GA-264 (les émetteurs de
 * traçage ne portent aucun contenu) n'est pas franchie — ce module n'émet rien.
 */
export type ReportContext = {
  /** Origine + chemin ; la PRÉSENCE d'une requête ou d'une ancre, jamais leur valeur. */
  pageUrl: string
  userAgent: string
  consoleLogs: string | null
  errorLogs: string | null
  networkFailures: NetworkFailure[]
  breadcrumbs: Breadcrumb[]
  appContext: AppContext
}

export function collectReportContext(): ReportContext {
  return {
    pageUrl: redactUrl(window.location.href),
    userAgent: navigator.userAgent,
    consoleLogs: getRecentConsole() || null,
    errorLogs: getRecentErrors() || null,
    networkFailures: getRecentNetworkFailures(),
    breadcrumbs: getRecentBreadcrumbs(),
    appContext: captureAppContext(),
  }
}
