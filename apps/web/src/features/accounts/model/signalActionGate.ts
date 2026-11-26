import { evaluateSignalOfferRelevance } from './signalGuardrails'

/**
 * #2952 (#2305.43/.44/.45/.47/.48) — LAU-FINAL-046, la porte avant qu'un
 * signal devienne une action.
 *
 * « Un signal ne devient action que si : l'offre est pertinente, le périmètre
 * est clair, un interlocuteur ou une recherche est possible, le timing est
 * suffisamment actuel [déjà là, `SignalFreshness` — #2305.46], l'action reste
 * responsable. Sinon : "Contexte à conserver, aucune action justifiée." »
 *
 * ⚠️ Ce gate s'applique à la RECOMMANDATION de l'analyse (`sales_implication`/
 * `angles`, ce que le modèle propose de FAIRE) — pas aux deux gestes MANUELS
 * « créer un angle »/« ajouter au plan », qui restent disponibles sur chaque
 * signal par décision explicite et plus récente (#2119.25, commit du
 * 25/09/2026 : « le commercial peut toujours en créer un »). Retirer ce
 * choix reviendrait à priver le commercial de son initiative propre, ce que
 * l'issue ne demande pas — elle demande que Laura ne PRÉSENTE pas un signal
 * comme actionnable quand elle ne peut pas le justifier.
 */

export type SignalActionGateInput = {
  /** Le signal tel que porté par l'analyse : type + texte, pour les garde-fous. */
  type?: string | null
  signal?: string | null
  /** #2305.44 — vrai quand le périmètre a été retrouvé sur une entité NOMMÉE
   *  (pas le repli générique sur le compte). Voir `watchData.ts::derivePerimeter`. */
  perimeterIsSpecific: boolean
  /** #2305.46 (déjà là) — un signal archivé n'est pas un déclencheur actuel. */
  freshness: 'current' | 'archive' | 'undated'
  /** #2305.47 — une action reste responsable quand elle s'appuie sur une
   *  source réelle, jamais sur un signal non sourcé. */
  hasRealSource: boolean
}

export type SignalActionGateResult =
  | { allowed: true }
  | {
      allowed: false
      /** #2305.48 — le fallback littéral de l'issue, à afficher tel quel. */
      fallback: 'context_only'
    }

export function evaluateSignalActionGate(input: SignalActionGateInput): SignalActionGateResult {
  const offerRelevant = evaluateSignalOfferRelevance(input).relevant
  const perimeterClear = input.perimeterIsSpecific
  // #2305.45 — « un interlocuteur OU une recherche est possible » : sans
  // interlocuteur nommé (non mesuré, #2305.25), une recherche n'est possible
  // que si on sait AU MOINS où chercher — le même périmètre spécifique.
  const interlocutorOrSearchPossible = input.perimeterIsSpecific
  const timingCurrent = input.freshness !== 'archive'
  const actionResponsible = input.hasRealSource

  const allowed = offerRelevant && perimeterClear && interlocutorOrSearchPossible && timingCurrent && actionResponsible

  return allowed ? { allowed: true } : { allowed: false, fallback: 'context_only' }
}
