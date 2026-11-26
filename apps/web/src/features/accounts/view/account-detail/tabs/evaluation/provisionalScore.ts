import type { EvaluationViewData } from './evaluationViewData'
import type { ScoreFactorView } from './scoreFactors'

/**
 * Score PROVISOIRE et leviers (rapport TF1 p28, point 1).
 *
 * Critique de Théo : « Le score dépend de données incomplètes : 9 contacts,
 * 6 signaux, achats non qualifiés. Afficher un score provisoire et ce qui ferait
 * évoluer la note. » L'écran affichait une note d'apparence définitive alors
 * qu'elle reposait sur un dossier à moitié rempli — une précision fictive, ce que
 * la spec interdit explicitement (« Le score ne doit jamais donner une précision
 * fictive »).
 *
 * Deux signaux existants disent que la note est encore molle, et aucun n'était
 * exploité côté rendu :
 *  - `qualityCapped` — l'IA a PLAFONNÉ la note faute de matière ;
 *  - une confiance donnée basse (`confidence` < 60), qui mesure ce qu'on peut
 *    croire, pas ce qu'on a.
 *
 * Les leviers ne sont pas rédigés par nous : ce sont les axes du /25 restés sous
 * la moyenne, cités avec leur poids réel. Un axe déjà au maximum n'est pas un
 * levier ; un dossier sans facteurs n'en produit aucun plutôt qu'un conseil creux.
 */

/** En dessous, la donnée est trop incomplète pour présenter une note ferme. */
const WEAK_CONFIDENCE = 60

/** Un axe noté au moins à la moitié de son maximum n'est plus un levier utile. */
const LEVER_RATIO = 0.5

type ProvisionalScore = {
  /** La note doit être annoncée comme provisoire. */
  provisional: boolean
  /** Pourquoi elle l'est — jamais les deux raisons à la fois, la plus forte gagne. */
  reason: 'qualityCapped' | 'weakConfidence' | null
  /** Axes qui feraient bouger la note, du plus loin du maximum au plus proche. */
  levers: ScoreFactorView[]
}

export function buildProvisionalScore(data: EvaluationViewData): ProvisionalScore {
  const reason = data.qualityCapped ? 'qualityCapped' : hasWeakConfidence(data) ? 'weakConfidence' : null

  const levers = data.scoreFactors
    .filter(factor => factor.kind === 'axis')
    .filter(factor => isLever(factor))
    // Le plus gros écart au maximum d'abord : c'est là que la note bouge le plus.
    .sort((a, b) => gap(b) - gap(a))

  return { provisional: reason !== null, reason, levers }
}

function hasWeakConfidence(data: EvaluationViewData): boolean {
  return typeof data.confidence === 'number' && data.confidence < WEAK_CONFIDENCE
}

function isLever(factor: ScoreFactorView): boolean {
  if (factor.weight === null || factor.max === null || factor.max <= 0) return false
  return factor.weight < factor.max * LEVER_RATIO
}

function gap(factor: ScoreFactorView): number {
  if (factor.weight === null || factor.max === null) return 0
  return factor.max - factor.weight
}
