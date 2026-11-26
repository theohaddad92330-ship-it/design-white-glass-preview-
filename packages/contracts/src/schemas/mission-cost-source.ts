import { z } from 'zod'

/**
 * #2420 — LES SOURCES DE COÛT d'une mission (LAU-FINAL-134, 17/09/2026).
 *
 * Fichier à part du moteur (`mission-margin-engine.ts`) pour une raison de
 * graphe, pas de goût : `staffing.ts` porte le contrat des conditions
 * commerciales, qui stocke ces champs, et le moteur importe `missionMargin`
 * de `staffing.ts`. Les schémas vivant ici, aucun des deux n'importe l'autre
 * en boucle.
 */

/** La SOURCE du coût direct. `null` en base = non déclarée : le noyau historique. */
export const MISSION_COST_SOURCES = ['freelance', 'employee', 'partner', 'fixed_price'] as const
export const missionCostSourceSchema = z.enum(MISSION_COST_SOURCES)
export type MissionCostSource = (typeof MISSION_COST_SOURCES)[number]

/** D'où vient le coût chargé d'un salarié. Aucune valeur « reconstruit ». */
export const EMPLOYEE_COST_ORIGINS = ['provided', 'imported', 'validated_standard'] as const
export type EmployeeCostOrigin = (typeof EMPLOYEE_COST_ORIGINS)[number]

const dailyCents = z.number().int().min(0).max(1_000_000)
const totalCents = z.number().int().min(0).max(100_000_000_000)

/**
 * La décomposition du coût — stockée en `jsonb` sur
 * `mission_commercial_terms.cost_breakdown` (migration `1795340000001`).
 *
 * Chaque champ est optionnel et `null` vaut « non renseigné » — jamais 0 : `0`
 * est une RÉPONSE (« aucune commission »), et c'est exactement ce que
 * {@link computeMissionMargin} distingue. `.strict()` : un champ inconnu est
 * refusé — en particulier tout ce qui ressemblerait à un salaire (#2420.8).
 */
export const missionCostBreakdownSchema = z
  .object({
    // FREELANCE (#2420.6)
    supplierDailyRateCents: dailyCents.nullable().optional(),
    supplierCommissionDailyCents: dailyCents.nullable().optional(),
    supplierTaxesDailyCents: dailyCents.nullable().optional(),
    // SALARIÉ (#2420.7)
    employeeCostOrigin: z.enum(EMPLOYEE_COST_ORIGINS).nullable().optional(),
    standardDailyCostCents: dailyCents.nullable().optional(),
    standardCostValidatedOn: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format attendu : AAAA-MM-JJ')
      .nullable()
      .optional(),
    periodCostCents: totalCents.nullable().optional(),
    periodWorkedDays: z.number().positive().max(366).nullable().optional(),
    hourlyCostCents: z.number().int().min(0).max(200_000).nullable().optional(),
    hoursPerDay: z.number().positive().max(24).nullable().optional(),
    // PARTENAIRE (#2420.9) — le fee est `partner_commission_daily_cents`, déjà en base.
    partnerPurchaseDailyCents: dailyCents.nullable().optional(),
    partnerSaleDailyCents: dailyCents.nullable().optional(),
    /** La part de la marge commerciale qui revient au partenaire, en %. */
    partnerSplitPercent: z.number().min(0).max(100).nullable().optional(),
    // FORFAIT (#2420.10) — des montants TOTAUX, pas journaliers.
    fixedPriceTeamTimeCostCents: totalCents.nullable().optional(),
    fixedPriceSubcontractingCostCents: totalCents.nullable().optional(),
    fixedPriceBudgetConsumedCents: totalCents.nullable().optional(),
    fixedPriceRemainingWorkCents: totalCents.nullable().optional(),
    // COÛTS DIRECTS CONFIGURÉS (#2420.3)
    specificDailyCostCents: dailyCents.nullable().optional(),
    otherValidatedDailyCostCents: dailyCents.nullable().optional(),
    // CONTRIBUTION, selon la politique de l'espace (#2420.4)
    internalAllocationDailyCents: dailyCents.nullable().optional(),
  })
  .strict()
export type MissionCostBreakdown = z.infer<typeof missionCostBreakdownSchema>

/** Code ISO 4217 — trois lettres capitales. */
export const currencyCodeSchema = z.string().regex(/^[A-Z]{3}$/, 'Code devise ISO 4217 attendu (ex. EUR)')
