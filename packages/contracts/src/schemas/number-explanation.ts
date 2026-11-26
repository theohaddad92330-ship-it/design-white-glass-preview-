import type { Completeness } from './completeness.js'

/**
 * « EXPLIQUE-MOI CE CHIFFRE » — PDF 6 (IA) §5.1.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE PROBLÈME
 * ─────────────────────────────────────────────────────────────────────────────
 * « Un utilisateur qui ne comprend pas un nombre ne s'en sert pas. Il retourne à
 * son tableur. » Un clic sur un nombre donne sa formule, sa source, sa date et
 * sa complétude.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA LIGNE « COMPLÉTUDE » EST OBLIGATOIRE, ET C'EST TOUT LE SUJET
 * ─────────────────────────────────────────────────────────────────────────────
 * « Un chiffre calculé sur une base partielle doit le dire, sinon il ment. »
 *
 * C'est la différence entre « la marge est de 28 % » et « la marge est de 28 %
 * sur les 9 missions qui portent un coût chargé, 4 n'en ont pas ». Le premier
 * énoncé fait prendre une décision ; le second dit sur quoi elle repose.
 *
 * Le type l'impose : `completeness` n'est pas optionnel. Un champ facultatif se
 * fait oublier au premier appelant ajouté — « paramètre déclaré, jamais passé »
 * est un défaut déjà payé dans ce dépôt.
 *
 * ⚠️ La dérivation, elle, n'est PAS refaite ici : elle vit dans
 * `deriveCompleteness` et la primitive `<Completeness>` l'affiche. Ce module
 * assemble, il ne réinvente pas — `ScoreWithAxes`, `MeasuredValue`,
 * `measurability.ts` et `Completeness` existaient déjà.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA PORTÉE, ET CE QU'ELLE EXCLUT
 * ─────────────────────────────────────────────────────────────────────────────
 * « Tout nombre non trivial : score, KPI, agrégat, montant, taux, délai. **Pas**
 * les comptages simples ni les dates. » Un « 12 comptes » n'a pas de formule à
 * expliquer, et lui coller un geste apprendrait à l'utilisateur que le geste ne
 * sert à rien.
 *
 * ⚠️ Et un chiffre qui ne SAIT PAS expliquer son calcul n'affiche pas le geste :
 * `canExplainNumber` en est le seul juge. Un bouton qui ouvre un panneau vide
 * est pire que pas de bouton — il se clique une fois.
 */

/**
 * Les chiffres RÉELLEMENT dotés du geste, nommés.
 *
 * Volontairement court. Un « explique » branché sur quinze chiffres à moitié ne
 * vaut rien ; quatre chiffres complets apprennent à l'utilisateur que le geste
 * tient sa promesse, et c'est ce qui le fait cliquer sur le cinquième.
 *
 * Les quatre sont ceux dont le calcul porte DÉJÀ sa complétude côté serveur —
 * `measurability`, `undatable`, `disputed`, `measured`/`unmeasured` : la ligne
 * obligatoire n'a donc rien à inventer.
 */
export const EXPLAINABLE_NUMBERS = ['bench_rate', 'gross_margin', 'dso_days', 'signed_revenue'] as const
export type ExplainableNumber = (typeof EXPLAINABLE_NUMBERS)[number]

/**
 * Le contenu du panneau. Les six lignes du §5.1, dans l'ordre.
 *
 * Les libellés arrivent DÉJÀ traduits, comme le `of` de `<Completeness>` : le
 * contrat est partagé avec l'API, qui n'a pas de i18n, et l'écran est le seul à
 * savoir dans quelle langue il parle.
 */
export interface NumberExplanation {
  metric: ExplainableNumber
  /** FORMULE — l'énoncé, en toutes lettres. */
  formula: string
  /** CALCUL — le calcul littéral, « 7 / 56 ». `null` = un terme n'a pas été lu. */
  calculation: string | null
  /** SOURCE — d'où vient le chiffre, et QUAND il a été calculé. */
  source: {
    label: string
    /** `null` = on ne sait pas quand. Jamais « maintenant » par défaut. */
    computedAt: string | null
  }
  /** COMPLÉTUDE — obligatoire. Voir le bloc ci-dessus. */
  completeness: Completeness
  /**
   * SEUIL — vide quand aucun seuil n'existe pour ce chiffre.
   *
   * ⚠️ Les seuils ne sont pas définis ici : ils viennent de là où ils vivent
   * déjà (`kpiTarget`, `MEASURABILITY_THRESHOLDS`, le réglage d'espace de la
   * marge). Un réglage vit à un seul endroit (GA-26), et un panneau qui
   * réécrirait « < 5 % » à la main divergerait du jour où quelqu'un change la
   * cible.
   */
  thresholds: readonly string[]
  /** DÉCISION — `null` quand aucune règle écrite n'existe. Jamais inventée. */
  decision: string | null
}

/**
 * Ce chiffre sait-il expliquer son calcul ?
 *
 * Le seul juge de l'affichage du geste. Trois exigences, et chacune correspond à
 * une ligne qui serait vide sinon :
 *
 *  - une FORMULE — sans elle, le panneau ne répond pas à la question posée ;
 *  - un CALCUL — « 7 / 56 » est ce que l'utilisateur venait chercher ; `null`
 *    veut dire qu'un terme n'a pas été lu, et un panneau qui l'avoue quand même
 *    n'apprend rien de plus que le « non mesuré » déjà affiché sur le chiffre ;
 *  - une SOURCE — un chiffre sans origine n'est pas vérifiable.
 *
 * La COMPLÉTUDE n'est pas dans cette liste, et ce n'est pas un oubli : le type
 * la rend obligatoire, elle est donc toujours là. Ses quatre verdicts sont TOUS
 * recevables, y compris `unknownTotal` — « calculé sur 12 comptes, population
 * totale non lue » est une réponse honnête, pas une absence de réponse.
 */
export function canExplainNumber(explanation: NumberExplanation | null | undefined): boolean {
  if (!explanation) return false
  if (explanation.formula.trim().length === 0) return false
  if (explanation.calculation === null || explanation.calculation.trim().length === 0) return false
  return explanation.source.label.trim().length > 0
}
