import { homonymResolutionSchema } from '@bellum/contracts'

export type EntityHypothesisView = {
  /** Phrase complète déjà composée côté IA (SIREN retenu, confiance, raison,
   *  écart avec le 2ᵉ) — rien à recalculer côté écran (GA-26). */
  message: string
}

/**
 * #2265.13 — « sinon choisir le plus probable et ANNONCER l'hypothèse ».
 *
 * `raw_analysis.homonyms` (écrit par `phase1_research.py`) porte le verdict de
 * la désambiguïsation d'homonymes. Un SEUL statut est une hypothèse au sens de
 * ce point : `selected` — un candidat DOMINE parmi plusieurs entités plausibles
 * du même nom, choisi sans confirmation humaine. Les autres statuts ne
 * qualifient pas :
 *  - `unique`/`locked` : rien deviné (un seul candidat, ou SIREN fourni par
 *    l'utilisateur) ;
 *  - `ambiguous`/`none` : rien sélectionné (l'UI doit encore arbitrer, ou
 *    aucun candidat plausible).
 *
 * `null` sur un dossier antérieur à ce chantier, un blob illisible, ou un
 * message vide — jamais une hypothèse à moitié devinée.
 */
export function readEntityHypothesis(
  rawAnalysis: Record<string, unknown> | null | undefined,
): EntityHypothesisView | null {
  const parsed = homonymResolutionSchema.safeParse(rawAnalysis?.['homonyms'])
  if (!parsed.success) return null
  if (parsed.data.status !== 'selected') return null
  const message = (parsed.data.message ?? '').trim()
  if (!message) return null
  return { message }
}
