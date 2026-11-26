import type { TFunction } from 'i18next'
import { formatDate } from '@/lib/locale'
import type { EvidenceItem } from './evaluationViewData'
import type { SignalListItem } from './SignalListCard'

/**
 * La seconde ligne d'un quick win / risque : sa PREUVE et sa DATE de recalcul
 * (Théo, restitution TF1 p28).
 *
 * Trois cas, et le premier est le plus important :
 * - **dossier antérieur** (ni date ni preuve) ⇒ aucune note. On n'affiche jamais
 *   une date inventée pour combler un vide.
 * - **item recalculé sans preuve rattachable** ⇒ « Preuve à qualifier », plus la
 *   date. C'est un aveu utile : le rep sait qu'il doit vérifier lui-même.
 * - **item prouvé** ⇒ nature de la preuve + son libellé + sa propre date, puis la
 *   date de recalcul. La date de la preuve et celle du recalcul sont distinctes
 *   et ne sont jamais confondues.
 */
export function toSignalListItem(item: EvidenceItem, t: TFunction<'accountDetail'>): SignalListItem {
  const parts: string[] = []

  if (item.proofType) {
    const kind = t(`evaluation.proof.types.${item.proofType}`, { defaultValue: item.proofType })
    const label = item.proof ? `${kind} — ${item.proof}` : kind
    parts.push(t('evaluation.proof.prefix', { proof: label }))
    if (item.proofDate) parts.push(formatDateLabel(item.proofDate))
  } else if (item.computedAt) {
    parts.push(t('evaluation.proof.none'))
  }

  if (item.computedAt) {
    parts.push(t('evaluation.proof.recomputedOn', { date: formatDateLabel(item.computedAt) }))
  }

  return { text: item.text, note: parts.length > 0 ? parts.join(' · ') : null }
}

/**
 * Une date de preuve peut être un vrai timestamp ou une période libre du signal
 * (« 2026 », « S1 2026 ») : on ne formate que ce qui EST une date, et on rend le
 * reste tel quel plutôt que de le déformer.
 *
 * ⚠️ `formatDate` (`@/lib/locale`) et non `formatShortDate` (`@bellum/utils`),
 * qui verrouille `.setLocale('fr')` : la date de recalcul de cet écran
 * s'affichait EN FRANÇAIS pour un utilisateur anglophone, quelle que soit la
 * langue de l'application. Cette note est la troisième formulation du produit
 * pour « quand ceci a été recalculé » ; les deux autres passent désormais par
 * `ComputedAt`, et celle-ci — qui construit une CHAÎNE et non du JSX — partage
 * au moins la même règle de langue.
 *
 * `formatDate` rend `null` sur ce qu'il ne sait pas lire : on retombe alors sur
 * la valeur d'origine, jamais sur une chaîne vide.
 */
function formatDateLabel(value: string): string {
  return formatDate(value, { dateStyle: 'short' }) ?? value
}
