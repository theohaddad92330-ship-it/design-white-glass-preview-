import type { AccountIntelligenceContextView, AccountIntelligenceSource } from '@bellum/contracts'

/**
 * #2786/#2285.3/#2285.9 — « PAR OÙ OUVRIR CE COMPTE », LU UNE SEULE FOIS.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QUE CE FICHIER FERME
 * ─────────────────────────────────────────────────────────────────────────────
 * `useAccountOverviewData` (Analyser) ET `evaluationViewData` (Score)
 * reparsaient chacun, séparément, `raw_analysis.comment_ouvrir_compte` — deux
 * normalisations du même champ, dans deux fichiers différents. Le contexte
 * canonique (`AccountIntelligenceContextService`, #1618/#2116) arbitre déjà ce
 * fait — DataForge OU l'inférence du modèle, jamais les deux — sous
 * `entryPaths` et `recommendations`, et c'est CE calcul que `IncumbentEsnCard`
 * lit déjà pour l'ESN en place. Cette fonction fait la même chose pour
 * l'ouverture : elle ne recalcule rien, elle LIT l'arbitrage déjà fait.
 *
 * ⚠️ #2285.23 (NO-GO) : Analyser et Score ne doivent plus jamais nommer deux
 * portes différentes pour le même compte. Passer les DEUX écrans par cette
 * seule fonction est ce qui rend ça vrai.
 */
export type AccountOpeningStrategyEntryPoint = {
  readonly label: string
  readonly targetProfile: string | null
  readonly justification: string | null
}

type AccountOpeningStrategyView =
  | { readonly state: 'unknown' }
  | {
      readonly state: 'known'
      readonly source: AccountIntelligenceSource
      readonly observedAt: string | null
      /** Une narration libre — SEULEMENT quand aucune porte n'a été nommée
       *  (voir le docblock du service : une narration ne COMPLÈTE jamais une
       *  porte nommée, elle ne s'affiche que faute de mieux). */
      readonly narrative: string | null
      readonly entryPoints: readonly AccountOpeningStrategyEntryPoint[]
    }

/** L'identifiant que `AccountIntelligenceContextService.buildRecommendations`
 *  donne à la narration d'ouverture sans porte nommée — voir
 *  `account-intelligence-context.service.ts`, jamais recopié en dur ailleurs. */
const OPENING_STRATEGY_RECOMMENDATION_ID = 'opening-strategy'

export function accountOpeningStrategyView(
  context: Pick<AccountIntelligenceContextView, 'entryPaths' | 'recommendations'>,
): AccountOpeningStrategyView {
  const { entryPaths, recommendations } = context

  if (entryPaths.state === 'known') {
    return {
      state: 'known',
      source: entryPaths.provenance.source,
      observedAt: entryPaths.provenance.observedAt,
      narrative: null,
      entryPoints: entryPaths.value.map(path => ({
        label: path.label,
        targetProfile: path.targetProfile,
        justification: path.justification,
      })),
    }
  }

  const narrative = recommendations.find(candidate => candidate.id === OPENING_STRATEGY_RECOMMENDATION_ID)
  if (!narrative) return { state: 'unknown' }

  return {
    state: 'known',
    source: narrative.provenance.source,
    observedAt: narrative.provenance.observedAt,
    narrative: narrative.label,
    entryPoints: [],
  }
}
