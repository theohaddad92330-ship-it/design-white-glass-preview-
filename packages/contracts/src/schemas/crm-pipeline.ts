import { z } from 'zod'

/**
 * Le rapport de pipeline, tel qu'il traverse la frontière API → SPA.
 *
 * Chaque champ qui peut être inconnu l'est explicitement (`nullable`) plutôt que
 * ramené à zéro : `winRate: null` se lit « rien n'est encore clos », là où `0`
 * se lirait « vous ne gagnez rien ». C'est la même discipline que le registre
 * des coûts fournisseurs, où une ligne non tarifée porte `null`.
 */

export const pipelinePeriodSchema = z.enum(['month', 'quarter', 'year'])

export const pipelineStageBucketSchema = z.object({
  stage: z.string(),
  label: z.string().nullable(),
  deals: z.number().int().nonnegative(),
  /** Somme des montants CONNUS de l'étape. */
  amount: z.number(),
  /** Deals de l'étape sans montant — exclus de `amount`, jamais comptés zéro. */
  amountUnknown: z.number().int().nonnegative(),
})

export const pipelineOwnerBucketSchema = z.object({
  ownerId: z.string(),
  ownerName: z.string().nullable(),
  open: z.number().int().nonnegative(),
  won: z.number().int().nonnegative(),
  lost: z.number().int().nonnegative(),
  wonAmount: z.number(),
})

export const pipelineReportSchema = z.object({
  from: z.string(),
  to: z.string(),
  period: pipelinePeriodSchema,
  open: z.object({
    deals: z.number().int().nonnegative(),
    amount: z.number(),
    amountUnknown: z.number().int().nonnegative(),
    byStage: z.array(pipelineStageBucketSchema),
  }),
  closed: z.object({
    won: z.number().int().nonnegative(),
    lost: z.number().int().nonnegative(),
    wonAmount: z.number(),
    lostAmount: z.number(),
    /** Clos dans la fenêtre mais d'issue illisible : ni gagné, ni perdu. */
    outcomeUnknown: z.number().int().nonnegative(),
  }),
  /** `null` quand rien n'est clos sur la fenêtre. */
  winRate: z.number().nullable(),
  /** `null` quand aucun deal clos n'est datable de bout en bout. */
  averageCycleDays: z.number().nullable(),
  cycleUnmeasured: z.number().int().nonnegative(),
  byOwner: z.array(pipelineOwnerBucketSchema),
  coverage: z.object({
    dealsRead: z.number().int().nonnegative(),
    truncated: z.boolean(),
    syncedAt: z.string().nullable(),
  }),
})

export type PipelineReport = z.infer<typeof pipelineReportSchema>
export type PipelinePeriod = z.infer<typeof pipelinePeriodSchema>

/** Une composante du score d'engagement, avec ce qu'elle a pesé. */
export const leadScoreComponentSchema = z.object({
  key: z.enum(['recency', 'notes', 'contacted', 'opens', 'clicks', 'deals']),
  label: z.string(),
  points: z.number(),
  max: z.number(),
})

export const scoredLeadSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  email: z.string().nullable(),
  company: z.string().nullable(),
  /** `null` quand AUCUN signal n'est lisible — différent d'un score de 0. */
  score: z.number().nullable(),
  band: z.enum(['hot', 'warm', 'cold', 'unknown']),
  components: z.array(leadScoreComponentSchema),
  signalsUsed: z.number().int().nonnegative(),
})

export type ScoredLead = z.infer<typeof scoredLeadSchema>

export const crmListSchema = z.object({
  id: z.string(),
  name: z.string(),
  size: z.number().nullable(),
  processingType: z.string().nullable(),
})

export type CrmList = z.infer<typeof crmListSchema>

export const crmSequenceSchema = z.object({ id: z.string(), name: z.string() })

export type CrmSequence = z.infer<typeof crmSequenceSchema>

/** Le résultat d'une inscription en séquence : ce qui est parti, et pourquoi le
 *  reste ne l'est pas. Chaque refus porte sa raison — un compteur seul
 *  laisserait croire à un bug. */
export const sequenceEnrollmentOutcomeSchema = z.object({
  sequenceId: z.string(),
  enrolled: z.array(z.string()),
  skipped: z.array(z.object({ contactId: z.string(), reason: z.string() })),
})

export type SequenceEnrollmentOutcome = z.infer<typeof sequenceEnrollmentOutcomeSchema>
