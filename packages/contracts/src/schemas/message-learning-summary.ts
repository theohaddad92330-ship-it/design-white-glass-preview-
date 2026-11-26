import { z } from 'zod'
import { messageLearningRuleSnapshotStatusSchema } from './message-learning-rule-snapshot-decision.js'

/**
 * L'ÉCRAN AGRÉGAT DU MOTEUR D'APPRENTISSAGE DES MESSAGES (épopée #2877, recette
 * prod 02/10 : « l'écran agrégat reste à faire »). Les signaux existaient
 * (express, comportementaux, qualité déclarée, règle proposée), lisibles
 * seulement par le back-office ; cette forme est celle que l'ESPACE lit.
 *
 * Doctrine, tenue par la forme :
 *  - des COMPTES, jamais un taux ni une probabilité ;
 *  - un bloc sans échantillon vaut `null` (« aucun signal »), jamais une
 *    rangée de zéros — on n'affiche pas ce qu'on n'a pas ;
 *  - aucun corps de message : seulement des décomptes et le texte de la règle
 *    PROPOSÉE (jamais appliquée sans accord) ;
 *  - uniquement l'espace de l'appelant (jamais d'agrégat entre espaces, #2385.10).
 */
export const messageLearningSummarySchema = z.object({
  express: z
    .object({
      approvedWithoutEdit: z.number().int().nonnegative(),
      approvedAfterEdit: z.number().int().nonnegative(),
      rejected: z.number().int().nonnegative(),
      sample: z.number().int().positive(),
    })
    .nullable(),
  behavioral: z
    .object({
      sent: z.number().int().nonnegative(),
      replied: z.number().int().nonnegative(),
      meetingBooked: z.number().int().nonnegative(),
      optOut: z.number().int().nonnegative(),
      bounced: z.number().int().nonnegative(),
      /** `null` = non mesuré (aucune réponse datée), jamais 0 h. */
      medianReplyDelayHours: z.number().nonnegative().nullable(),
      sample: z.number().int().positive(),
    })
    .nullable(),
  quality: z
    .object({
      wrongFact: z.number().int().nonnegative(),
      wrongCta: z.number().int().nonnegative(),
      wrongPersona: z.number().int().nonnegative(),
      flaggedMessages: z.number().int().positive(),
    })
    .nullable(),
  /** Le candidat de règle du moment : PROPOSÉ, jamais appliqué sans accord (#2385.11). */
  proposedRule: z.object({ summary: z.string(), basedOnSample: z.number().int().nonnegative() }).nullable(),
  /**
   * #2877.1 — le niveau GLOBAL (Louis 11/10/2026) : la règle apprise sur la base
   * commune (k ≥ 3 espaces, anonymisée), PROPOSÉE comme les autres. Texte et
   * taille d'échantillon seulement — jamais un espace, jamais un contenu.
   */
  globalRule: z.object({ summary: z.string(), basedOnSample: z.number().int().nonnegative() }).nullable(),
  /** Les règles déjà proposées (versionnées), la plus récente d'abord ; les décidées restent visibles. */
  history: z.array(
    z.object({
      version: z.number().int().positive(),
      status: messageLearningRuleSnapshotStatusSchema,
      summary: z.string(),
      basedOnSample: z.number().int().nonnegative(),
      createdAt: z.string(),
      decidedAt: z.string().nullable(),
    }),
  ),
})
export type MessageLearningSummary = z.infer<typeof messageLearningSummarySchema>
