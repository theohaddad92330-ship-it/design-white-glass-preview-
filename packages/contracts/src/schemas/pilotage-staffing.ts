import { z } from 'zod'

/**
 * L'écran Staffing de Pilotage (`/pilotage/staffing`, L3 du 14/10/2026).
 *
 * Quatre lectures, aucune probabilité, aucune pondération :
 *  - capacité vs demande sur 12 semaines (jours, deux demandes SÉPARÉES) ;
 *  - l'intercontrat, nominatif, chiffré SEULEMENT si le coût est connu ;
 *  - les fins de mission à 30 / 60 / 90 jours ;
 *  - le TACE, planifié et réel, avec son dénominateur.
 *
 * Une donnée absente vaut `null` — « non mesuré » — jamais 0 (GA-18 / GA-19).
 */

/** Les motifs d'absence d'un consultant (`consultant_absences.kind`) — même liste que le CHECK SQL. */
export const CONSULTANT_ABSENCE_KINDS = ['leave', 'sick', 'training', 'other'] as const
export type ConsultantAbsenceKind = (typeof CONSULTANT_ABSENCE_KINDS)[number]

export const TACE_THRESHOLD_MIN_PERCENT = 1
export const TACE_THRESHOLD_MAX_PERCENT = 100

/** Le seuil d'alerte TACE de l'espace. `null` = rien saisi = AUCUNE alerte. */
export const setTaceThresholdSchema = z
  .object({
    thresholdPercent: z.number().min(TACE_THRESHOLD_MIN_PERCENT).max(TACE_THRESHOLD_MAX_PERCENT).nullable(),
  })
  .strict()

export const staffingCapacityWeekSchema = z.object({
  /** Lundi de la semaine, `AAAA-MM-JJ`. */
  weekStart: z.string(),
  /** Jours ouvrés de la semaine (fériés FR exclus). */
  workingDays: z.number().int().min(0).max(5),
  /** Consultants non archivés comptés dans la capacité. */
  consultants: z.number().int().min(0),
  /** Capacité en jours : consultants × jours ouvrés − congés/absences. */
  capacityDays: z.number().min(0),
  /** Jours demandés par les missions signées (affectations × charge). */
  signedMissionDays: z.number().min(0),
  /** Jours demandés par les besoins ouverts DATÉS. Séparés des précédents. */
  openNeedDays: z.number().min(0),
})
export type StaffingCapacityWeek = z.infer<typeof staffingCapacityWeekSchema>

export const staffingCapacitySchema = z.object({
  generatedAt: z.string(),
  from: z.string(),
  to: z.string(),
  weeks: z.array(staffingCapacityWeekSchema),
  /** Besoins ouverts SANS date de début : non comptés, mais nommés. */
  undatedOpenNeeds: z.number().int().min(0),
})
export type StaffingCapacity = z.infer<typeof staffingCapacitySchema>

/** `restricted` : l'appelant n'a pas `finance:read`. `unknown` : coût non renseigné. */
export const benchCostSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('known'), dailyCostCents: z.number().int(), monthCostCents: z.number().int() }),
  z.object({ state: z.literal('unknown') }),
  z.object({ state: z.literal('restricted') }),
])
export type BenchCost = z.infer<typeof benchCostSchema>

export const benchConsultantSchema = z.object({
  consultantId: z.string(),
  fullName: z.string(),
  /** Fin de la dernière mission, `null` = aucune mission connue. */
  freeSince: z.string().nullable(),
  /** Jours ouvrés d'intercontrat cumulés dans le mois en cours (jusqu'à aujourd'hui). */
  benchDaysThisMonth: z.number().min(0),
  mainSkills: z.array(z.string()),
  cost: benchCostSchema,
})
export type BenchConsultant = z.infer<typeof benchConsultantSchema>

export const staffingBenchSchema = z.object({
  /** Mois couvert, `AAAA-MM`, et dernier jour compté. */
  month: z.string(),
  countedUntil: z.string(),
  consultants: z.array(benchConsultantSchema),
  /** Somme des coûts connus ; `null` si aucun coût n'est connu. */
  knownCostCents: z.number().int().nullable(),
  /** Consultants en intercontrat dont le coût n'est pas renseigné. */
  withoutCost: z.number().int().min(0),
})
export type StaffingBench = z.infer<typeof staffingBenchSchema>

export const missionRenewalSchema = z.enum(['known', 'in_discussion', 'unknown'])
export type MissionRenewal = z.infer<typeof missionRenewalSchema>

export const endingMissionSchema = z.object({
  missionId: z.string(),
  consultantName: z.string().nullable(),
  accountName: z.string().nullable(),
  endsOn: z.string(),
  daysLeft: z.number().int().min(0),
  renewal: missionRenewalSchema,
})
export type EndingMission = z.infer<typeof endingMissionSchema>

export const staffingEndingsSchema = z.object({
  within30: z.array(endingMissionSchema),
  within60: z.array(endingMissionSchema),
  within90: z.array(endingMissionSchema),
})
export type StaffingEndings = z.infer<typeof staffingEndingsSchema>

/**
 * Un TACE : jours ÷ jours ouvrés disponibles. `percent` est `null` quand le
 * numérateur n'est pas mesuré (réel) ou le dénominateur nul : jamais 0 %.
 */
export const taceValueSchema = z.object({
  percent: z.number().nullable(),
  days: z.number().nullable(),
  availableDays: z.number().min(0),
})
export type TaceValue = z.infer<typeof taceValueSchema>

export const taceConsultantSchema = z.object({
  consultantId: z.string(),
  fullName: z.string(),
  planned: taceValueSchema,
  actual: taceValueSchema,
})

export const tacePeriodSchema = z.object({
  /** `AAAA-MM`. */
  month: z.string(),
  /** Premier et dernier jour du dénominateur (le mois en cours s'arrête à aujourd'hui). */
  from: z.string(),
  to: z.string(),
  global: z.object({ planned: taceValueSchema, actual: taceValueSchema }),
  consultants: z.array(taceConsultantSchema),
})
export type TacePeriod = z.infer<typeof tacePeriodSchema>

export const staffingTaceSchema = z.object({
  /** `null` : l'ESN n'a rien saisi, donc aucune alerte. */
  thresholdPercent: z.number().nullable(),
  periods: z.array(tacePeriodSchema),
})
export type StaffingTace = z.infer<typeof staffingTaceSchema>

export const staffingOverviewSchema = z.object({
  generatedAt: z.string(),
  bench: staffingBenchSchema,
  endings: staffingEndingsSchema,
  tace: staffingTaceSchema,
})
export type StaffingOverview = z.infer<typeof staffingOverviewSchema>
