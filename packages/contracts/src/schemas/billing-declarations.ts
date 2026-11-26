import { z } from 'zod'

/**
 * #2417.3 / .4 / .5 — les modèles de facturation FORFAIT (jalon), RETAINER
 * (prorata) et PLACEMENT (fee + garantie).
 *
 * Tranché par Louis 22/09 soir (decisions §8) : DÉCLARATIFS minimaux.
 *  - jalon = libellé + date + montant SAISIS ;
 *  - prorata = jours OUVRÉS de la période (lundi-vendredi ; les jours fériés ne
 *    sont pas retirés — aucun calendrier par pays n'est branché, et en deviner
 *    un serait inventer) ;
 *  - garantie de placement = une durée en jours DÉCLARÉE au contrat.
 * Rien de calculé qui ne vienne d'une saisie ; la source est nommée (`manual`,
 * c80). Aucun de ces montants n'est « facturé » : ils PRÉPARENT un montant, la
 * facture reste émise ailleurs.
 */
export const BILLING_DECLARATION_SOURCES = ['manual'] as const

export const missionMilestoneInputSchema = z
  .object({
    label: z.string().trim().min(1).max(200),
    dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format attendu : AAAA-MM-JJ'),
    /** Un jalon a un montant : `0` voudrait dire « non chiffré », qui n'est pas un jalon. */
    amountCents: z.number().int().positive(),
  })
  .strict()
export type MissionMilestoneInput = z.infer<typeof missionMilestoneInputSchema>

export const missionBillingDeclarationInputSchema = z
  .object({
    /** Montant mensuel du retainer. `null` efface la déclaration. */
    retainerMonthlyCents: z.number().int().positive().nullable().optional(),
    /** Fee de placement. `null` efface la déclaration. */
    placementFeeCents: z.number().int().positive().nullable().optional(),
    /** Durée de garantie du placement, en jours, déclarée au contrat. */
    placementGuaranteeDays: z.number().int().min(1).max(730).nullable().optional(),
  })
  .strict()
export type MissionBillingDeclarationInput = z.infer<typeof missionBillingDeclarationInputSchema>

export const missionMilestoneSchema = z
  .object({
    id: z.string(),
    label: z.string(),
    dueOn: z.string(),
    amountCents: z.number().int(),
    source: z.enum(BILLING_DECLARATION_SOURCES),
  })
  .strict()
export type MissionMilestone = z.infer<typeof missionMilestoneSchema>

/**
 * #2415.9 — ce que `GET /delivery/missions/:id/billing` rend : les jalons
 * DÉCLARÉS d'un forfait, le retainer et le placement s'ils existent.
 *
 * Contrat PARTAGÉ API/web (GA-26) : `MissionBillingService.read` (API)
 * construit une valeur de cette forme, `MissionBillingSection` (web)
 * l'affiche telle quelle — un seul endroit décrit la réponse, jamais deux
 * types qui pourraient diverger en silence.
 */
export const missionBillingReadSchema = z
  .object({
    milestones: z.array(missionMilestoneSchema),
    retainerMonthlyCents: z.number().int().nullable(),
    /** #2417.4 — le retainer du mois courant, au prorata des jours ouvrés couverts. */
    retainerThisMonthCents: z.number().int().nullable(),
    placementFeeCents: z.number().int().nullable(),
    placementGuaranteeDays: z.number().int().nullable(),
    /** #2417.5 — fin de garantie et fee acquis, `null` sans démarrage ou sans durée. */
    placementGuarantee: z.object({ endsOn: z.string(), secured: z.boolean() }).nullable(),
    source: z.enum(BILLING_DECLARATION_SOURCES),
  })
  .strict()
export type MissionBillingRead = z.infer<typeof missionBillingReadSchema>

const DAY_MS = 86_400_000
const toUtc = (day: string): number => Date.parse(`${day}T00:00:00Z`)
const dayOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10)

/** Premier et dernier jour du mois d'un `YYYY-MM-DD`. */
function monthBounds(periodMonth: string): { first: string; last: string } {
  const first = `${periodMonth.slice(0, 7)}-01`
  const date = new Date(toUtc(first))
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0))
  return { first, last: dayOf(last.getTime()) }
}

/** Les jours OUVRÉS (lundi-vendredi) entre deux jours, bornes incluses. */
export function workingDaysBetween(from: string, to: string): number {
  let count = 0
  for (let ms = toUtc(from); ms <= toUtc(to); ms += DAY_MS) {
    const weekday = new Date(ms).getUTCDay()
    if (weekday !== 0 && weekday !== 6) count += 1
  }
  return count
}

/**
 * #2417.3 — ce que les jalons DÉCLARÉS rendent dû sur un mois : la somme des
 * jalons dont la date tombe dans le mois. `null` = aucun jalon ce mois-là —
 * jamais 0, qui annoncerait un mois « dû pour zéro ».
 */
export function milestonesDueInMonthCents(
  milestones: readonly { dueOn: string; amountCents: number }[],
  periodMonth: string,
): number | null {
  const { first, last } = monthBounds(periodMonth)
  const due = milestones.filter(m => m.dueOn >= first && m.dueOn <= last)
  return due.length === 0 ? null : due.reduce((sum, m) => sum + m.amountCents, 0)
}

/**
 * #2417.4 — le retainer DÉCLARÉ, au prorata des jours ouvrés que la mission
 * couvre dans le mois. `null` sans montant déclaré — le prorata ne devine pas
 * un retainer.
 */
export function prorateRetainerCents(
  monthlyCents: number | null,
  periodMonth: string,
  startedOn: string | null,
  endsOn: string | null,
): number | null {
  if (monthlyCents === null) return null
  const { first, last } = monthBounds(periodMonth)
  const from = startedOn && startedOn > first ? startedOn : first
  const to = endsOn && endsOn < last ? endsOn : last
  const monthDays = workingDaysBetween(first, last)
  if (monthDays === 0 || from > to) return null
  return Math.round((monthlyCents * workingDaysBetween(from, to)) / monthDays)
}

/**
 * #2417.5 — la garantie DÉCLARÉE d'un placement : sa fin (démarrage + durée),
 * et si elle est échue — le fee n'est ACQUIS qu'une fois la garantie passée.
 * `null` sans démarrage ou sans durée : aucune garantie devinée.
 */
export function placementGuarantee(
  startedOn: string | null,
  guaranteeDays: number | null,
  today: string,
): { endsOn: string; secured: boolean } | null {
  if (!startedOn || guaranteeDays === null) return null
  const endsOn = dayOf(toUtc(startedOn) + guaranteeDays * DAY_MS)
  return { endsOn, secured: today > endsOn }
}
