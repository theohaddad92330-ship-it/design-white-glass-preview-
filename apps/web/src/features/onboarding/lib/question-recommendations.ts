import type { Choice, Question } from '@/features/onboarding/lib/questions'
import type { RecommendationSource } from '@/features/onboarding/lib/questions/types'

/**
 * #2024.3 — UNE RECOMMANDATION SE FONDE SUR UNE RÉPONSE ANTÉRIEURE, ET LE DIT.
 *
 * Décision de Louis du 16/09/2026. Le point demandait qu'une recommandation du
 * questionnaire porte une « source nommée », et le chantier était bloqué depuis
 * des jours parce qu'aucune source NON INVENTÉE n'existait : proposer des
 * options « souvent choisies » aurait fallu les tirer de quelque part, et il n'y
 * avait rien d'honnête à citer.
 *
 * La seule source honnête est CE QUE LA PERSONNE A ELLE-MÊME RÉPONDU PLUS TÔT.
 * L'exemple qui a servi à trancher : proposer `reference_sectors` à partir de
 * `target_sectors` — « d'après vos secteurs cibles ». C'est vrai, c'est
 * vérifiable par qui le lit, et ça ne prétend rien sur le marché.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EXPLICITEMENT REFUSÉ : la mémoire marché de l'espace
 * ─────────────────────────────────────────────────────────────────────────────
 * « Les ESN de votre taille ciblent souvent X » se LIT comme un fait de marché
 * alors que ça mesure ce qu'on SAIT — c'est la doctrine du taux de couverture
 * (GA-259) appliquée à un préremplissage. Et un libellé se lit toujours hors
 * contexte : la nuance « d'après les espaces dont nous avons assez
 * d'observations » ne survit pas au coup d'œil, le « souvent » reste.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI COMPTE DANS L'ÉCRITURE
 * ─────────────────────────────────────────────────────────────────────────────
 * La source est NOMMÉE dans l'interface, pas seulement connue du code : une
 * suggestion sans sa provenance est indistinguable d'une invention. D'où
 * `sourceLabelKey`, obligatoire — une recommandation sans libellé de source ne
 * peut PAS se déclarer, c'est le type qui l'empêche.
 *
 * Deux garde-fous de plus, et chacun a sa raison :
 *  - on ne recommande QUE des valeurs présentes dans le catalogue de la
 *    question visée. Une réponse antérieure qui n'y figure pas (un « Autre »
 *    libre, un catalogue qui a changé) est ignorée plutôt que proposée : une
 *    option qu'on ne peut pas cocher n'est pas une recommandation ;
 *  - rien n'est coché à la place de qui que ce soit. On met en tête, on nomme
 *    la source, la personne clique. Une correction humaine gagne toujours, et
 *    ici il n'y a même rien à corriger : on n'a rien écrit.
 */

// Pas d’`export` : aucun autre fichier ne lit ce type (règle du dépôt, tenue par knip).
type Recommendation = {
  /** Les valeurs à mettre en tête, dans l'ordre où la personne les a données. */
  values: readonly string[]
  /** Clé i18n de la source, NOMMÉE à l'écran. */
  sourceLabelKey: string
}

/** Le catalogue d'une question à choix multiples, à plat. */
function catalogueOf(question: Question): Choice[] {
  if (question.kind === 'multi') return question.choices
  if (question.kind === 'multi-grouped') return question.groups.flatMap(group => group.choices)
  return []
}

/**
 * Ce qu'on met en tête de cette question, et d'où ça vient — ou `null`.
 *
 * `null` dans tous les cas où il n'y a rien d'honnête à proposer : la question
 * ne déclare pas de source, la réponse antérieure est absente ou vide, ou
 * aucune de ses valeurs n'existe dans le catalogue de cette question-ci.
 */
export function recommendationFor(
  question: Question,
  answers: Readonly<Record<string, unknown>>,
): Recommendation | null {
  const source = 'recommendedFrom' in question ? question.recommendedFrom : undefined
  if (!source) return null

  const earlier = answers[source.fromKey]
  if (!Array.isArray(earlier)) return null

  const catalogue = new Set(catalogueOf(question).map(choice => choice.value))
  const values = earlier.filter((value): value is string => typeof value === 'string' && catalogue.has(value))
  if (values.length === 0) return null

  return { values, sourceLabelKey: source.sourceLabelKey }
}
