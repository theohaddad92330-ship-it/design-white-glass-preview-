import { z } from 'zod'

/**
 * #2075.12 / #2075.13 (épopée #2774, « Audit interactif ») — commenter une
 * conclusion, refuser une recommandation.
 *
 * `target_key` reste une chaîne LIBRE côté contrat, jamais un enum : les
 * clés de l'audit (`AuditHeadlineKey`/`AuditColumnKey`, `build-audit.ts`,
 * apps/web) vivent dans le code de l'écran, pas ici — les dupliquer dans un
 * enum partagé romprait GA-26 le jour où l'écran en ajoute une (un audit
 * dérivé n'a pas de contrat côté serveur, `#2075` le documente).
 */
/**
 * #2075.14 (épopée #2880, lot V33) — `validated` : valider UN bloc de l'audit
 * (une conséquence « À partir de maintenant, BellumAI va… »), à côté de
 * « valider l'ensemble » (`POST /profile-context/validate`, #2075.15). Même
 * table, même lecture « le geste le plus récent par cible » : un bloc validé
 * puis refusé est refusé. Sans texte, comme un refus.
 */
export const commercialAuditFeedbackKindSchema = z.enum(['comment', 'refused', 'validated'])
export type CommercialAuditFeedbackKind = z.infer<typeof commercialAuditFeedbackKindSchema>

export const commercialAuditFeedbackSchema = z.object({
  target_key: z.string().min(1),
  kind: commercialAuditFeedbackKindSchema,
  /** NULL sur un refus ou une validation : ni l'un ni l'autre ne porte de texte (contrainte SQL, GA-11/GA-12). */
  comment_text: z.string().nullable(),
  created_at: z.string(),
})
export type CommercialAuditFeedback = z.infer<typeof commercialAuditFeedbackSchema>

/**
 * #2075.12 — un commentaire exige un texte non vide ; #2075.13 — un refus
 * n'en porte jamais. Deux formes distinctes plutôt qu'un `comment_text`
 * optionnel unique : un refus qui recevrait un texte par erreur serait
 * accepté en silence sans cette discrimination.
 */
export const createCommercialAuditFeedbackRequestSchema = z.discriminatedUnion('kind', [
  z.object({ target_key: z.string().min(1), kind: z.literal('comment'), comment_text: z.string().trim().min(1) }),
  z.object({ target_key: z.string().min(1), kind: z.literal('refused') }),
  z.object({ target_key: z.string().min(1), kind: z.literal('validated') }),
])
export type CreateCommercialAuditFeedbackRequest = z.infer<typeof createCommercialAuditFeedbackRequestSchema>

/** La note la plus RÉCENTE par cible — jamais l'historique complet à l'écran (append-only en base). */
export const commercialAuditFeedbackResponseSchema = z.object({
  feedback: z.record(z.string(), commercialAuditFeedbackSchema),
})
export type CommercialAuditFeedbackResponse = z.infer<typeof commercialAuditFeedbackResponseSchema>
