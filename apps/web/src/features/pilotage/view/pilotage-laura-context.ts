import type { TFunction } from 'i18next'
import type { LauraContextFacet, LauraPageContext } from '@bellum/contracts'

/**
 * #2206.45-.48 — CE QUE /PILOTAGE DÉCLARE À LAURA.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE GAP QUE CE FICHIER FERME
 * ─────────────────────────────────────────────────────────────────────────────
 * `PilotagePage` déclarait déjà un contexte `kind: 'pilotage'`, mais réduit à
 * une seule chose : la couverture (« X/Y maillons mesurés »). AskLaura
 * pré-remplit pourtant la question en quatre temps — « pourquoi, quels
 * dossiers sont concernés, et quelle décision prendre en premier »
 * (`page.askLauraQuestion`) — sans que le contexte envoyé au modèle porte de
 * quoi y répondre : Laura recevait la question sans les faits.
 *
 * Ce fichier ajoute les trois choses qui manquaient, dans le même ordre que
 * la page elle-même (#1440 : « où ça décroche → pourquoi → quels dossiers →
 * quelle décision → où agir ») :
 *  - **pourquoi** : `purpose`, la phrase fixe qui dit à quoi sert l'écran ;
 *  - **quels dossiers / quelle décision** : les décisions ouvertes les plus
 *    graves (mêmes objets que `InterventionsBlock`, classés par
 *    `rankInterventions` côté serveur — on ne reclasse pas une seconde fois) ;
 *  - **comment agir** : les gestes que l'écran rend réellement (`actions`),
 *    et lequel citer en premier (`recommendedAction`) — `canAssign` n'ajoute
 *    « attribuer » que pour qui porte réellement le bouton (#2206.53).
 *
 * `renderLauraPageContext` (`@bellum/contracts`) transforme cette structure en
 * texte de prompt ; `_SCREEN_FACTS_EXPLAINED` (`laura_role_and_voice.py`,
 * #2206.49) dit à Laura de s'en SERVIR plutôt que de la réciter.
 */

type PilotageLauraDecision = {
  /** Le libellé de la nature, déjà traduit — pas le kind brut. */
  kindLabel: string
  /** Le détail tel qu'affiché sur la carte, avec ses chiffres. */
  detail: string
}

type PilotageContextInput = {
  isLoading: boolean
  /** `null` tant que la chaîne n'a pas été lue — non mesuré n'est pas zéro. */
  coverage: { measured: number; total: number } | null
  /** Les maillons dont le statut est `non_mesure`, déjà LIBELLÉS. */
  unmeasuredLevelLabels: readonly string[]
  /** Les décisions ouvertes les plus graves, déjà classées par l'appelant. */
  topDecisions: readonly PilotageLauraDecision[]
  /** #2206.53 — seul qui porte `team:manage` voit le geste « attribuer ». */
  canAssign: boolean
}

/** Un détail de carte peut dépasser la borne d'un facet (`lauraContextFacetSchema`,
 *  160 caractères) : on coupe plutôt que de laisser le contexte entier tomber
 *  à `null` (règle 1 du docblock de `laura-context.ts`). */
function clipToFacet(value: string): string {
  return value.length <= 160 ? value : `${value.slice(0, 159)}…`
}

export function pilotageLauraContext(t: TFunction<'pilotage'>, input: PilotageContextInput): LauraPageContext {
  const facets: LauraContextFacet[] = []
  if (input.coverage) {
    facets.push({ label: t('coverageOf'), value: `${input.coverage.measured}/${input.coverage.total}` })
  }
  // Trois au plus : `lauraContextFacetSchema` plafonne le tableau à six, et la
  // couverture en tient déjà une — jamais une liste plus longue que ce que
  // `DecisionStrip` montre lui-même à l'écran.
  for (const decision of input.topDecisions.slice(0, 3)) {
    facets.push({ label: decision.kindLabel, value: clipToFacet(decision.detail) })
  }

  const hasDecisions = input.topDecisions.length > 0
  const actions = hasDecisions
    ? [t('laura.actionOpen'), ...(input.canAssign ? [t('laura.actionAssign')] : [])]
    : undefined

  return {
    kind: 'pilotage',
    label: t('page.title'),
    entityId: null,
    facets,
    state: input.isLoading ? 'loading' : 'ready',
    purpose: t('laura.purpose'),
    ...(input.unmeasuredLevelLabels.length > 0 ? { missing: input.unmeasuredLevelLabels.slice(0, 4) } : {}),
    ...(actions ? { actions, recommendedAction: t('laura.actionOpen') } : {}),
  }
}
