import type { TalentRow } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { toCsv } from '@/lib/csv'
import { talentNameText } from './talentName'

/**
 * #2662.3 — EXPORTER LA SÉLECTION (« en faire un export ou quoi proprement »,
 * Louis 20/09/2026). Aucun export CSV n'existait pour les consultants avant
 * ce lot (mesuré : zéro occurrence).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER GARANTIT
 * ─────────────────────────────────────────────────────────────────────────
 *  - les en-têtes sont les MÊMES que celles du tableau (`table.header*`,
 *    `consultants.json` FR/EN) — un réglage vit à un seul endroit (GA-26),
 *    jamais un second jeu d'intitulés qui pourrait diverger ;
 *  - une valeur ABSENTE reste une case VIDE, jamais un « 0 » ni un tiret de
 *    remplissage (gardes GA-18/GA-19, même règle que `VivierTableRow.tsx`) ;
 *  - aucun critère protégé (âge, genre, origine, photo, adresse) — les
 *    colonnes exportées sont exactement celles déjà visibles à l'écran ;
 *  - `toCsv` (lib/csv.ts) porte déjà le BOM UTF-8 et l'échappement anti-
 *    injection de formule (Excel/Sheets) : ce fichier ne les réinvente pas.
 */
export function generateTalentCSV(rows: readonly TalentRow[]): string {
  const t = i18n.t.bind(i18n)
  const headers = [
    t('consultants:table.headerName'),
    t('consultants:table.headerTitle'),
    t('consultants:table.headerSkills'),
    t('consultants:table.headerSeniority'),
    t('consultants:table.headerLocation'),
    t('consultants:table.headerStatus'),
    t('consultants:table.headerAvailability'),
    t('consultants:table.headerTjm'),
    t('consultants:table.headerRemote'),
    t('consultants:table.headerEngagement'),
    t('consultants:table.headerLastContact'),
  ]

  const dataRows = rows.map(row => [
    talentNameText(row.fullName, t('consultants:name.unnamed')),
    row.title ?? '',
    row.topSkills.map(skill => skill.label).join('; '),
    row.seniority === 'inconnu' ? '' : t(`consultants:seniority.${row.seniority}`),
    row.zones.length > 0 ? row.zones.join(' · ') : '',
    t(`consultants:kind.${row.kind}`),
    // La disponibilité DÉRIVÉE (§6.2) — jamais le champ déclaratif seul,
    // même règle que `TalentAvailabilityBadge.tsx`.
    t(`consultants:staffing.${row.staffing.availability}`),
    row.tjm != null ? String(row.tjm) : '',
    row.workMode ? t(`consultants:workMode.${row.workMode}`) : '',
    row.engagementKind === 'inconnu' ? '' : t(`consultants:engagement.${row.engagementKind}`),
    // Format ISO (`YYYY-MM-DD`) plutôt que localisé : une date lisible par
    // Excel dans n'importe quelle locale, sans ambiguïté jour/mois.
    row.lastContactAt ? row.lastContactAt.slice(0, 10) : '',
  ])

  return toCsv([headers, ...dataRows])
}
