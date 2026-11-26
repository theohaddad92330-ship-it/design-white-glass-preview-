import type { ReportStatus } from '@bellum/contracts'
import { FEEDBACK_LABEL, type IssueProgress } from './github-issue.service'

const BACKOFFICE_LABEL = 'beta-backoffice'
const CATEGORY_LABEL_PREFIX = 'feedback:'

/**
 * #1960.10 — LES ÉTIQUETTES QUE LA CRÉATION POSE, écrites UNE fois.
 *
 * Elles vivent ici, à côté de la traduction de l'état, parce que l'une dépend
 * de l'autre : une étiquette posée par quelqu'un veut dire « pris en main »,
 * une étiquette posée par la création ne veut rien dire. Si la création en
 * ajoutait une sans que la traduction le sache, tous les signalements
 * passeraient « en cours » à la seconde où ils partent.
 *
 * `beta-backoffice` et non un `beta-feedback` de plus : le tri lit ces
 * étiquettes, et un retour d'opérateur ne se traite pas comme un retour de
 * bêta-testeur — il n'y a personne à qui répondre.
 */
export function creationLabels(category: string, fromBackoffice: boolean): string[] {
  const labels = [FEEDBACK_LABEL, `${CATEGORY_LABEL_PREFIX}${category}`]
  return fromBackoffice ? [...labels, BACKOFFICE_LABEL] : labels
}

function isCreationLabel(name: string): boolean {
  return name === FEEDBACK_LABEL || name === BACKOFFICE_LABEL || name.startsWith(CATEGORY_LABEL_PREFIX)
}

/**
 * #1960.10 — L'ÉTAT QUE L'AUTEUR LIT, dérivé du ticket. La SEULE traduction.
 *
 *  - **fermé comme résolu** → `fixed` (« corrigé ») ;
 *  - **fermé comme non prévu ou doublon** → `closed_unresolved` (« fermé sans
 *    suite ») : le service distingue ces fermetures, CE ticket n'a pas été
 *    corrigé, et l'écrire « corrigé » serait faux ;
 *  - **ouvert, et quelqu'un y a touché** — attribué, étiqueté au-delà de la
 *    création, une réponse humaine dans le fil, ou rouvert → `in_progress` ;
 *  - **ouvert, personne dessus** → `received` (« reçu »).
 *
 * ⚠️ `null` = état INDISPONIBLE, et deux cas y mènent exprès :
 *  - un ticket qu'on n'a pas pu lire n'est PAS « reçu » — il est peut-être
 *    corrigé depuis une semaine ;
 *  - une fermeture dont on ne connaît pas la raison n'est PAS une correction.
 * « Non mesuré » ne devient jamais un état.
 */
export function reportStatusOf(progress: IssueProgress | null | undefined): ReportStatus | null {
  if (!progress) return null
  if (progress.state === 'closed') {
    if (progress.stateReason === 'COMPLETED') return 'fixed'
    if (progress.stateReason === 'NOT_PLANNED' || progress.stateReason === 'DUPLICATE') return 'closed_unresolved'
    return null
  }
  const taken =
    progress.assigned ||
    progress.humanComment ||
    progress.stateReason === 'REOPENED' ||
    progress.labels.some(label => !isCreationLabel(label))
  return taken ? 'in_progress' : 'received'
}
