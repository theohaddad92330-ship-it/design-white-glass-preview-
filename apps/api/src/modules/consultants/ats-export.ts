import type { AtsExportRow } from '@bellum/contracts'
import { effectiveDeclaredAvailability } from './declared-availability'

/**
 * #2326.8 (épopée #2794) — une fiche du vivier → une ligne d'export ATS.
 *
 * Fonction PURE, réutilisable côté service sans lever de dépendance TypeORM :
 * même discipline que `talentExport.ts` côté web (les colonnes exportées
 * sont exactement celles du domaine, rien d'inventé). `firstName`/`lastName`
 * sont dérivés de `full_name` (aucune colonne séparée n'existe en base) —
 * une ATS externe qui attend deux colonnes reçoit un meilleur effort, jamais
 * un nom vide.
 */
type AtsExportSource = {
  id: string
  full_name: string | null
  email: string | null
  phone: string | null
  title: string | null
  seniority: string
  availability: string
  availability_checked_at: Date | string | null
  available_from: string | null
  tjm: number | null
  engagement_kind: string
  source: string | null
}

export function splitFullName(fullName: string | null): { firstName: string | null; lastName: string | null } {
  const trimmed = fullName?.trim()
  if (!trimmed) return { firstName: null, lastName: null }
  const parts = trimmed.split(/\s+/)
  if (parts.length === 1) return { firstName: parts[0]!, lastName: null }
  return { firstName: parts[0]!, lastName: parts.slice(1).join(' ') }
}

export function toAtsExportRow(consultant: AtsExportSource, now: Date): AtsExportRow {
  const { firstName, lastName } = splitFullName(consultant.full_name)
  return {
    consultantId: consultant.id,
    firstName,
    lastName,
    email: consultant.email,
    phone: consultant.phone,
    title: consultant.title,
    seniority: consultant.seniority,
    // Disponibilité EFFECTIVE (§6.2, même règle que le vivier écran) : un
    // export qui recopierait `availability` telle quelle mentirait sur une
    // fiche périmée depuis 60 jours et jamais rouverte.
    availability: effectiveDeclaredAvailability(consultant.availability, consultant.availability_checked_at, now),
    availableFrom: consultant.available_from,
    tjm: consultant.tjm,
    engagementKind: consultant.engagement_kind,
    source: consultant.source,
  }
}
