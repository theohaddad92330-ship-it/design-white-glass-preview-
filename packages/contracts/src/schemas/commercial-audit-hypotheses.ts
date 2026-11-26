import { z } from 'zod'
import {
  commercialAuditConfidenceSchema,
  commercialTensionRuleIdSchema,
  type AuditContradiction,
} from './commercial-audit-context.js'

/**
 * #2010.10 — RELIRE LES HYPOTHÈSES, sur `/settings/profile/audit`.
 *
 * Même patron que #2074.10-.16 (`commercial-audit-moves.ts`) : ce fichier
 * n'invente rien, il DÉRIVE d'une source déjà mesurée. {@link AuditContradiction}
 * (`commercial-audit-context.ts`) porte déjà `possibleExplanation` — « ce qui
 * pourrait l'expliquer… une hypothèse reste nommée comme une hypothèse »
 * (#2064.15, doctrine #2062.21) — produit par les 18 règles de
 * `tension-detectors.ts` depuis #2066.18. Ce qui manquait n'était pas la
 * donnée, c'était un lecteur qui la rassemble en un bloc « Hypothèses à
 * vérifier », distinct de la liste des contradictions elle-même (qui reste
 * rendue ailleurs, `AuditFirstMoves`/`AuditChain`).
 *
 * `questionToValidate` voyage AVEC l'hypothèse : une hypothèse sans la
 * question qui la vérifierait serait une affirmation déguisée — exactement
 * ce que le ton de l'audit refuse (#2064.18).
 */
export const auditHypothesisSchema = z.object({
  /** La RÈGLE qui a détecté la tension dont cette hypothèse essaie de rendre
   *  compte — même trace que {@link AuditContradiction.ruleId}. */
  ruleId: commercialTensionRuleIdSchema,
  /** #2064.15 — ce qui pourrait expliquer la tension. Jamais présenté comme
   *  LE fait : c'est une hypothèse, nommée comme telle par le composant. */
  hypothesis: z.string().min(1),
  /** #2064.16 — la question ou vérification qui trancherait. `null` = la
   *  rupture n'en nomme pas — non mesuré, pas « aucune ». */
  questionToValidate: z.string().nullable(),
  /** `null` = confiance NON MESURÉE — distinct de la plus faible des trois. */
  confidence: commercialAuditConfidenceSchema.nullable(),
})
export type AuditHypothesis = z.infer<typeof auditHypothesisSchema>

/**
 * Une hypothèse par contradiction qui en porte une (`possibleExplanation`
 * non nul) — jamais une par défaut : une rupture sans hypothèse explicite
 * n'en fabrique pas une pour remplir le bloc (même discipline que
 * `auditMovesFrom`, `commercial-audit-moves.ts`).
 */
export function auditHypothesesFrom(
  contradictions:
    | readonly Pick<AuditContradiction, 'ruleId' | 'possibleExplanation' | 'questionToValidate' | 'confidence'>[]
    | null
    | undefined,
): AuditHypothesis[] {
  if (!contradictions || contradictions.length === 0) return []

  const hypotheses: AuditHypothesis[] = []
  for (const item of contradictions) {
    if (item.possibleExplanation === null) continue
    hypotheses.push({
      ruleId: item.ruleId,
      hypothesis: item.possibleExplanation,
      questionToValidate: item.questionToValidate,
      confidence: item.confidence,
    })
  }
  return hypotheses
}
