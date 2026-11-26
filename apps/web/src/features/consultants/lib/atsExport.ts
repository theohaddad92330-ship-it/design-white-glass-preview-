import type { AtsExportRow } from '@bellum/contracts'
import { toCsv } from '@/lib/csv'

/**
 * #2326.8 (épopée #2794) — export du vivier ENTIER au format CSV « ATS »,
 * colonnes standard.
 *
 * Distinct de `talentExport.ts` (#2662.3, la sélection du tableau, en-têtes
 * de l'écran, traduites) : un ATS externe attend des en-têtes STABLES, pas
 * traduites — même précédent que la colonne « LinkedIn » de
 * `lib/export-csv.ts` (#2297), fixe quelle que soit la locale.
 *
 * Une valeur absente reste une case VIDE, jamais un « 0 » (gardes
 * GA-18/GA-19, même règle que `talentExport.ts`).
 */
const ATS_HEADERS = [
  'First Name',
  'Last Name',
  'Email',
  'Phone',
  'Title',
  'Seniority',
  'Availability',
  'Available From',
  'Daily Rate (EUR)',
  'Employment Type',
  'Source',
] as const

export function generateAtsCSV(rows: readonly AtsExportRow[]): string {
  const dataRows = rows.map(row => [
    row.firstName ?? '',
    row.lastName ?? '',
    row.email ?? '',
    row.phone ?? '',
    row.title ?? '',
    row.seniority === 'inconnu' ? '' : row.seniority,
    row.availability === 'inconnu' ? '' : row.availability,
    row.availableFrom ?? '',
    row.tjm != null ? String(row.tjm) : '',
    row.engagementKind === 'inconnu' ? '' : row.engagementKind,
    row.source ?? '',
  ])
  return toCsv([[...ATS_HEADERS], ...dataRows])
}
