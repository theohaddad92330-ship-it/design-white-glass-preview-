import { z } from 'zod'

/**
 * LA CATÉGORIE DÉCLARÉE (Louis 14/10/2026, refonte Pilotage L2 — Pipe).
 *
 * Une DÉCLARATION HUMAINE du commercial sur une opportunité : « engagé »,
 * « possible », « pipe », « hors prévision ». Ce n'est PAS une probabilité —
 * aucun pourcentage n'y est associé, aucun total pondéré n'en découle
 * (doctrine : PROBABILITÉ calibrée avec ses axes, jamais nue).
 *
 * `null` = non déclarée, une vraie réponse : jamais devinée depuis l'étape.
 * Liste FERMÉE, gardée par `opportunities_forecast_category_check` — une valeur
 * s'ajoute ICI d'abord (GA-11/GA-12), jamais directement en base.
 */
export const FORECAST_CATEGORIES = ['commit', 'best_case', 'pipeline', 'omitted'] as const
export const forecastCategorySchema = z.enum(FORECAST_CATEGORIES)
export type ForecastCategory = z.infer<typeof forecastCategorySchema>

/**
 * Les champs d'une opportunité dont le changement est journalisé
 * (`opportunity_field_changes`). Liste FERMÉE, gardée par
 * `opportunity_field_changes_field_check` (GA-11/GA-12).
 */
export const OPPORTUNITY_JOURNALED_FIELDS = ['amount_cents', 'expected_close_on'] as const
export type OpportunityJournaledField = (typeof OPPORTUNITY_JOURNALED_FIELDS)[number]

/** Le corps de `PATCH /projects/:id/forecast-category`. `null` efface. */
export const updateProjectForecastCategorySchema = z
  .object({ forecast_category: forecastCategorySchema.nullable() })
  .strict()
export type UpdateProjectForecastCategory = z.infer<typeof updateProjectForecastCategorySchema>

/**
 * LES SEUILS DES SIGNAUX DE RISQUE — UN SEUL ENDROIT (GA-26).
 *
 * Chaque signal est un FAIT chiffré (« date prévue dépassée de 12 j »), jamais
 * un score. Le web ne retape aucun de ces nombres : il lit ce que le serveur
 * a constaté.
 */
export const PIPE_RISK_THRESHOLDS = {
  /** Sans activité liée depuis plus de N jours. */
  noActivityDays: 21,
  /** Date prévue repoussée au moins N fois. */
  closeDatePushes: 2,
  /** Un montant baissé ne se signale que s'il date de moins de N jours. */
  amountLoweredWindowDays: 90,
  /** Une médiane de stade sous N opportunités ne veut rien dire : pas de signal. */
  stageMedianMinSample: 3,
} as const

/** Fenêtres de lecture du bloc « par commercial ». */
export const PIPE_OWNER_WINDOWS = {
  winRateDays: 90,
  salesCycleDays: 180,
  /** Sous cette base de clôturées, pas de % : « 2 sur 3 » se lit mieux et ne ment pas. */
  winRateMinBase: 10,
} as const

export const PIPE_RISK_KINDS = [
  'no_activity',
  'close_overdue',
  'close_pushed',
  'amount_lowered',
  'stage_stale',
] as const
export const pipeRiskKindSchema = z.enum(PIPE_RISK_KINDS)
export type PipeRiskKind = z.infer<typeof pipeRiskKindSchema>

/** Un fait, pas un score. `days`/`count`/`fromCents`/`toCents` portent le chiffre ; le web écrit la phrase. */
export const pipeRiskSignalSchema = z.object({
  kind: pipeRiskKindSchema,
  days: z.number().int().nonnegative().nullable(),
  count: z.number().int().nonnegative().nullable(),
  fromCents: z.number().int().nullable(),
  toCents: z.number().int().nullable(),
})
export type PipeRiskSignal = z.infer<typeof pipeRiskSignalSchema>

export const pipeInspectionRowSchema = z.object({
  id: z.string().guid(),
  accountId: z.string().guid(),
  accountName: z.string(),
  label: z.string(),
  /** `null` = pas de montant saisi (ou hors euro) — jamais 0 €. */
  amountCents: z.number().int().nullable(),
  stage: z.string(),
  forecastCategory: forecastCategorySchema.nullable(),
  expectedCloseOn: z.string().nullable(),
  ownerId: z.string().guid().nullable(),
  ownerName: z.string().nullable(),
  daysInStage: z.number().int().nonnegative(),
  signals: z.array(pipeRiskSignalSchema),
})
export type PipeInspectionRow = z.infer<typeof pipeInspectionRowSchema>

/** Un total par catégorie, NON PONDÉRÉ. `category: null` = « non déclarée ». */
export const pipeCategoryTotalSchema = z.object({
  category: forecastCategorySchema.nullable(),
  count: z.number().int().nonnegative(),
  amountCents: z.number().int().nonnegative(),
  /** Opportunités de la catégorie sans montant : absentes de la somme, comptées ici. */
  withoutAmount: z.number().int().nonnegative(),
})
export type PipeCategoryTotal = z.infer<typeof pipeCategoryTotalSchema>

export const pipeInspectionSchema = z.object({
  rows: z.array(pipeInspectionRowSchema),
  totals: z.array(pipeCategoryTotalSchema),
  generatedAt: z.string(),
})
export type PipeInspection = z.infer<typeof pipeInspectionSchema>

/**
 * Le waterfall du pipe, NON PONDÉRÉ, en centimes.
 *
 * L'ÉQUATION, prouvée par test :
 *   closing = opening + created + raised − lowered − lost − signed − removed + unexplained
 * `unexplained` n'est jamais caché : c'est l'écart quand l'historique est
 * incomplet (opportunité d'avant le journal). Nul quand le journal est complet.
 */
export const pipeWaterfallSchema = z.object({
  from: z.string(),
  to: z.string(),
  openingCents: z.number().int(),
  createdCents: z.number().int(),
  raisedCents: z.number().int(),
  loweredCents: z.number().int(),
  lostCents: z.number().int(),
  signedCents: z.number().int(),
  /** Sorties sans issue gagnée ni perdue (mise en dormance, retour en amont). */
  removedCents: z.number().int(),
  closingCents: z.number().int(),
  unexplainedCents: z.number().int(),
  openingCount: z.number().int().nonnegative(),
  closingCount: z.number().int().nonnegative(),
  /** Opportunités ouvertes sans montant : hors des barres, nommées ici. */
  withoutAmountCount: z.number().int().nonnegative(),
})
export type PipeWaterfall = z.infer<typeof pipeWaterfallSchema>

export const pipeOwnerRowSchema = z.object({
  ownerId: z.string().guid().nullable(),
  ownerName: z.string().nullable(),
  openCount: z.number().int().nonnegative(),
  openCents: z.number().int().nonnegative(),
  signedCount: z.number().int().nonnegative(),
  signedCents: z.number().int().nonnegative(),
  /** Signées ÷ (signées + perdues) sur `winRateDays`. `null` sous la base minimale. */
  winRate: z.number().min(0).max(1).nullable(),
  winRateWon: z.number().int().nonnegative(),
  winRateLost: z.number().int().nonnegative(),
  winRateDays: z.number().int().positive(),
  /** Jours médians création → signature des signées de `cycleDays`. `null` sans signée. */
  medianCycleDays: z.number().nullable(),
  cycleSample: z.number().int().nonnegative(),
  cycleDays: z.number().int().positive(),
})
export type PipeOwnerRow = z.infer<typeof pipeOwnerRowSchema>

export const pipeByOwnerSchema = z.object({
  from: z.string(),
  to: z.string(),
  owners: z.array(pipeOwnerRowSchema),
})
export type PipeByOwner = z.infer<typeof pipeByOwnerSchema>
