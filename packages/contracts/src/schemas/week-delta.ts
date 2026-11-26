import { z } from 'zod'

/**
 * Cockpit › « ce qui a bougé » (Louis 14/10/2026, refonte Pilotage L1).
 *
 * Les règles qui tiennent ce contrat — elles ne se re-litigent pas :
 *  - AUCUNE probabilité : les sommes sont NON pondérées.
 *  - Une source illisible vaut `null`, JAMAIS 0. Une source lue et vide vaut 0.
 *  - Une absence ne fait aucune ligne ; le total dit sa période (`period`).
 */
export const WEEK_DELTA_MAX_LINES = 20
export const WEEK_DELTA_DEFAULT_DAYS = 7
export const WEEK_DELTA_MISSION_HORIZON_DAYS = 30

const opportunityMoveSchema = z.object({
  id: z.string(),
  label: z.string(),
  accountName: z.string().nullable(),
  /** Euros, non pondéré. `null` = montant jamais saisi (jamais 0). */
  amount: z.number().nullable(),
  from: z.string().nullable(),
  to: z.string(),
})

export const weekDeltaOpportunityBucketSchema = z.object({
  count: z.number().int().nonnegative(),
  /** Somme des seuls montants saisis ; `null` quand AUCUN montant n'est saisi. */
  amount: z.number().nullable(),
  lines: z.array(opportunityMoveSchema).max(WEEK_DELTA_MAX_LINES),
})

export const weekDeltaMissionEndingSchema = z.object({
  id: z.string(),
  consultantName: z.string().nullable(),
  accountName: z.string().nullable(),
  endsOn: z.string(),
})

const cashInLineSchema = z.object({
  accountId: z.string(),
  accountName: z.string().nullable(),
  amountCents: z.number(),
  count: z.number().int().positive(),
})

export const weekDeltaSchema = z.object({
  period: z.object({ from: z.string(), to: z.string() }),
  generatedAt: z.string(),
  created: weekDeltaOpportunityBucketSchema.nullable(),
  advanced: weekDeltaOpportunityBucketSchema.nullable(),
  regressed: weekDeltaOpportunityBucketSchema.nullable(),
  lost: weekDeltaOpportunityBucketSchema.nullable(),
  won: weekDeltaOpportunityBucketSchema.nullable(),
  missionsEnding: z
    .object({
      count: z.number().int().nonnegative(),
      horizonDays: z.number().int().positive(),
      lines: z.array(weekDeltaMissionEndingSchema).max(WEEK_DELTA_MAX_LINES),
    })
    .nullable(),
  cashIn: z
    .object({
      count: z.number().int().nonnegative(),
      amountCents: z.number(),
      lines: z.array(cashInLineSchema).max(WEEK_DELTA_MAX_LINES),
    })
    .nullable(),
})
export type WeekDelta = z.infer<typeof weekDeltaSchema>
export type WeekDeltaOpportunityBucket = z.infer<typeof weekDeltaOpportunityBucketSchema>

export const weekDeltaQuerySchema = z
  .object({
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
  })
  .refine(q => !q.from || !q.to || new Date(q.from) < new Date(q.to), { message: 'from doit précéder to' })

/**
 * Objectif / réalisé / couverture du MOIS EN COURS. Le serveur calcule le
 * réalisé et le pipe ouvert ; l'objectif est la somme des `member_objectives`.
 * Sans objectif saisi : `target` vaut `null`, et ni couverture ni rythme.
 */
export const monthObjectiveSchema = z.object({
  /** `AAAA-MM-01`. */
  month: z.string(),
  generatedAt: z.string(),
  /** Euros. `null` = aucun objectif de CA saisi pour le mois. */
  target: z.number().nullable(),
  /** Euros, signé du mois (étape gagnée, clôture dans le mois). Non pondéré. */
  realised: z.number().nullable(),
  /** Euros, pipe ouvert non pondéré (montants saisis). `null` = illisible. */
  openPipe: z.number().nullable(),
  /** Jours ouvrés restants, aujourd'hui compris. */
  workingDaysLeft: z.number().int().nonnegative(),
  /** (objectif − réalisé) restant à signer, plancher 0. `null` sans objectif. */
  remaining: z.number().nullable(),
  /** openPipe ÷ remaining. `null` sans reste à signer ou sans pipe lisible. */
  coverage: z.number().nullable(),
  /** remaining ÷ workingDaysLeft. `null` sans objectif ou sans jour ouvré. */
  expectedPacePerDay: z.number().nullable(),
})
export type MonthObjective = z.infer<typeof monthObjectiveSchema>

/** Jours ouvrés (lun-ven) de `from` inclus à la fin du mois de `from` inclus. */
export function workingDaysLeftInMonth(from: Date): number {
  const end = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 0))
  let count = 0
  for (let day = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate())); day <= end; ) {
    const weekday = day.getUTCDay()
    if (weekday !== 0 && weekday !== 6) count += 1
    day = new Date(day.getTime() + 86_400_000)
  }
  return count
}

/** Couverture et rythme attendu, purs : testés une fois, lus partout. */
export function monthCoverage(input: {
  target: number | null
  realised: number | null
  openPipe: number | null
  workingDaysLeft: number
}): Pick<MonthObjective, 'remaining' | 'coverage' | 'expectedPacePerDay'> {
  const { target, realised, openPipe, workingDaysLeft } = input
  if (target === null || realised === null) return { remaining: null, coverage: null, expectedPacePerDay: null }
  const remaining = Math.max(0, target - realised)
  return {
    remaining,
    coverage: remaining > 0 && openPipe !== null ? openPipe / remaining : null,
    expectedPacePerDay: workingDaysLeft > 0 ? remaining / workingDaysLeft : null,
  }
}
