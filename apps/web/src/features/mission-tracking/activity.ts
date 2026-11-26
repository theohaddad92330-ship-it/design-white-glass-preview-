import type { InvoiceReadiness } from '@bellum/contracts'
import type { TimesheetLine } from '@/features/missions/api'

/**
 * L'ACTIVITÉ RÉCENTE — quatre natures d'événement, chacune lue sur un
 * horodatage déjà écrit ailleurs. Ce fichier n'invente ni acteur ni action :
 * aucun des deux objets sources ne porte de nom d'auteur, donc aucune ligne
 * n'en affiche un fabriqué.
 *
 * ⚠️ Portée volontairement bornée : `cra_validated` ne couvre que le mois de
 * CRA ouvert (celui que `useTimesheetMonth()` rend par défaut) — élargir à un
 * an demanderait douze requêtes de plus, pour un bloc qui n'affiche que les
 * cinq événements les plus récents. `invoice_issued` / `payment_received` /
 * `reminder_sent`, eux, couvrent la fenêtre d'encaissement déjà chargée pour
 * la tuile « Paiements en retard » (12 mois) — aucune requête supplémentaire.
 */
export type RecentActivityEvent =
  | { kind: 'cra_validated'; at: string; missionId: string; missionLabel: string | null }
  | { kind: 'invoice_issued'; at: string; missionId: string; missionLabel: string | null; reference: string | null }
  | { kind: 'payment_received'; at: string; missionId: string; missionLabel: string | null }
  | { kind: 'reminder_sent'; at: string; missionId: string; missionLabel: string | null }

function isReadableDate(value: string): boolean {
  return !Number.isNaN(Date.parse(value))
}

/** Les relevés VALIDÉS, du mois de CRA ouvert. */
function craEvents(lines: readonly TimesheetLine[]): RecentActivityEvent[] {
  const events: RecentActivityEvent[] = []
  for (const line of lines) {
    if (line.validatedByClientAt) {
      events.push({
        kind: 'cra_validated',
        at: line.validatedByClientAt,
        missionId: line.missionId,
        missionLabel: line.missionLabel,
      })
    }
  }
  return events
}

/** Les factures émises, les paiements reçus et les relances consignées, sur
 *  la fenêtre d'encaissement. Trois faits distincts sur la MÊME ligne : une
 *  facture qui a une échéance dépassée peut porter les trois à la fois. */
function readinessEvents(rows: readonly InvoiceReadiness[]): RecentActivityEvent[] {
  const events: RecentActivityEvent[] = []
  for (const row of rows) {
    if (row.invoicedAt) {
      events.push({
        kind: 'invoice_issued',
        at: row.invoicedAt,
        missionId: row.missionId,
        missionLabel: row.missionLabel,
        reference: row.invoiceReference,
      })
    }
    if (row.paidAt) {
      events.push({
        kind: 'payment_received',
        at: row.paidAt,
        missionId: row.missionId,
        missionLabel: row.missionLabel,
      })
    }
    if (row.lastReminderAt) {
      events.push({
        kind: 'reminder_sent',
        at: row.lastReminderAt,
        missionId: row.missionId,
        missionLabel: row.missionLabel,
      })
    }
  }
  return events
}

/** Les `limit` événements les plus récents, du plus récent au plus ancien.
 *  Une date illisible n'entre jamais dans le tri — elle disparaîtrait dans un
 *  coin imprévisible plutôt que de faire échouer tout le bloc. */
export function buildRecentActivity(
  timesheetLines: readonly TimesheetLine[],
  readinessRows: readonly InvoiceReadiness[],
  limit: number,
): RecentActivityEvent[] {
  const events = [...craEvents(timesheetLines), ...readinessEvents(readinessRows)].filter(event =>
    isReadableDate(event.at),
  )
  events.sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
  return events.slice(0, limit)
}
