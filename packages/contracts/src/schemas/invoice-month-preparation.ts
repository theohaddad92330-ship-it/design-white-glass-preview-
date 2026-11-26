import { z } from 'zod'
import { invoiceReadinessStateSchema } from './invoice-readiness.js'

/**
 * #2566 / #2563 / #2557 / #2558 / #2560 / #2567 — « Préparer la facture de <mois> »
 * pour une mission longue : la même facture chaque mois, seuls les JOURS et
 * parfois le N° de bon de commande changent.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROIS MOTS DISTINCTS (doctrine, `invoice-connector-write.ts`)
 * ─────────────────────────────────────────────────────────────────────────────
 * « préparée » ≠ « créée » ≠ « envoyée ». Ce fichier ne couvre QUE le premier :
 * le mois est PRÉPARÉ (jours, bon de commande figés pour ce mois). La création
 * du brouillon dans l'outil branché reste le geste existant
 * (`POST /delivery/invoice-connector/send`), et « facturé » ne s'écrit que sur
 * preuve du connecteur.
 */

/**
 * Ce que le contrôle du bon de commande peut DIRE avant de préparer. Une alerte
 * se voit, elle n'empêche JAMAIS de préparer (décision Louis 07/10/2026, lot G2).
 */
export const PO_MONTH_ALERTS = [
  'po_missing',
  'po_expired',
  'po_ends_mid_period',
  'po_not_started',
  'po_volume_exceeded',
] as const
export const poMonthAlertSchema = z.enum(PO_MONTH_ALERTS)
export type PoMonthAlert = (typeof PO_MONTH_ALERTS)[number]

export interface PoMonthInput {
  /** L'espace exige-t-il un bon de commande sur cette mission ? */
  requiresPo: boolean
  poNumber: string | null
  /** Début de validité (date du bon de commande). `null` = inconnu. */
  validFrom: string | null
  /** Fin de validité. `null` = inconnue — jamais présumée expirée. */
  validUntil: string | null
  volumeDays: number | null
  /** Jours déjà consommés AVANT ce mois. `null` = non mesuré. */
  consumedBeforeDays: number | null
  /** Jours à facturer ce mois. `null` = pas encore connus. */
  monthDays: number | null
  /** Premier jour du mois facturé, `YYYY-MM-DD`. */
  periodMonth: string
}

export interface PoMonthAssessment {
  alerts: PoMonthAlert[]
  /** Reste à consommer AVANT ce mois (volume − cumul). `null` si un terme manque. */
  remainingDays: number | null
  /** Reste APRÈS ce mois ; négatif = dépassement, montré tel quel. `null` si un terme manque. */
  remainingAfterDays: number | null
}

function lastDayOfMonth(periodMonth: string): string {
  const year = Number(periodMonth.slice(0, 4))
  const month = Number(periodMonth.slice(5, 7))
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)
}

const round1 = (value: number): number => Math.round(value * 10) / 10

/**
 * Le contrôle du bon de commande pour UN mois : période hors validité, bon
 * absent, ou jours cumulés au-delà du volume. Fonction pure, jamais bloquante.
 *
 * Une donnée inconnue ne produit JAMAIS d'alerte ni de zéro : échéance absente
 * ≠ expirée, volume absent ≠ « 0 jour restant ».
 */
export function assessPoForMonth(input: PoMonthInput): PoMonthAssessment {
  const alerts: PoMonthAlert[] = []
  const first = input.periodMonth
  const last = lastDayOfMonth(first)

  if (input.requiresPo && !input.poNumber) alerts.push('po_missing')
  if (input.validUntil && input.validUntil < first) alerts.push('po_expired')
  else if (input.validUntil && input.validUntil < last) alerts.push('po_ends_mid_period')
  if (input.validFrom && input.validFrom > last) alerts.push('po_not_started')

  const volumeKnown = input.volumeDays !== null && input.volumeDays > 0
  const remainingDays =
    volumeKnown && input.consumedBeforeDays !== null
      ? round1((input.volumeDays as number) - input.consumedBeforeDays)
      : null
  const remainingAfterDays =
    remainingDays !== null && input.monthDays !== null ? round1(remainingDays - input.monthDays) : null
  if (remainingAfterDays !== null && remainingAfterDays < 0) alerts.push('po_volume_exceeded')

  return { alerts, remainingDays, remainingAfterDays }
}

/** D'où viennent les jours du mois : le CRA, ou une saisie SANS CRA (nommée à l'écran). */
export const PREPARATION_DAYS_SOURCES = ['cra', 'manual'] as const
export const preparationDaysSourceSchema = z.enum(PREPARATION_DAYS_SOURCES)
export type PreparationDaysSource = (typeof PREPARATION_DAYS_SOURCES)[number]

const dayString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

/** Ce que l'utilisateur peut modifier : les jours, et le N° de bon de commande. Rien d'autre. */
export const saveMonthPreparationSchema = z
  .object({
    /** Jours saisis SANS CRA. `null` = effacer la saisie. Absent = inchangé. */
    days: z.number().min(0).max(31).nullable().optional(),
    /** N° de bon de commande de CE mois. `null` = reprendre celui de la mission. Absent = inchangé. */
    poNumber: z.string().trim().min(1).max(120).nullable().optional(),
  })
  .strict()
export type SaveMonthPreparationInput = z.infer<typeof saveMonthPreparationSchema>

export const invoiceMonthPreparationSchema = z.object({
  missionId: z.string().guid(),
  missionLabel: z.string().nullable(),
  accountId: z.string().guid().nullable(),
  accountName: z.string().nullable(),
  /** La société de l'ESN qui émettrait, pour la prévisualisation du brouillon. */
  legalEntityName: z.string().nullable(),
  /** L'état du mois tel que l'écran de facturation le lit (`prête` / `bloquée`…). */
  readinessState: invoiceReadinessStateSchema,
  /** `YYYY-MM-01`. */
  periodMonth: dayString,
  /** Le mois précédent sert de modèle ; `null` = aucune facture antérieure connue. */
  previous: z
    .object({
      periodMonth: dayString,
      days: z.number().nullable(),
      invoiceReference: z.string().nullable(),
    })
    .nullable(),
  dailyRateCents: z.number().int().nullable(),
  days: z.number().nullable(),
  daysSource: preparationDaysSourceSchema.nullable(),
  amountCents: z.number().int().nullable(),
  poNumber: z.string().nullable(),
  /** Le N° saisi pour ce mois diffère de celui de la mission. */
  poNumberOverridden: z.boolean(),
  poCheck: z.object({
    alerts: z.array(poMonthAlertSchema),
    remainingDays: z.number().nullable(),
    remainingAfterDays: z.number().nullable(),
    validFrom: dayString.nullable(),
    validUntil: dayString.nullable(),
  }),
  /** « Préparée » : les jours et le bon de commande du mois ont été validés par un humain. */
  prepared: z.boolean(),
  preparedAt: z.string().nullable(),
  /** Le mois est déjà déclaré facturé : plus rien à préparer. */
  invoiced: z.boolean(),
  /** Le mois est une automatique « préparer chaque mois » (la mission est suivie). */
  autoPrepare: z.boolean(),
})
export type InvoiceMonthPreparation = z.infer<typeof invoiceMonthPreparationSchema>
