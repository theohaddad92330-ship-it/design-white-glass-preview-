/**
 * #2326.8 (épopée #2794) — export du vivier au format CSV « ATS », colonnes
 * standard (nom/prénom, e-mail, téléphone, poste, disponibilité, TJM…).
 *
 * Distinct de `talentExport.ts` (#2662.3, la SÉLECTION du tableau, en-têtes
 * de l'écran) : celui-ci porte les colonnes qu'un ATS externe attend, sur
 * TOUT le vivier de l'espace — même patron que `TalentStats`
 * (« compte sur tout l'espace, jamais sur le filtre courant »).
 *
 * Les valeurs restent BRUTES (enum, pas de traduction) — le client traduit,
 * même règle que `TalentRow` : un seul endroit sait dire un enum (GA-26).
 */
export type AtsExportRow = {
  consultantId: string
  firstName: string | null
  lastName: string | null
  email: string | null
  phone: string | null
  title: string | null
  seniority: string
  availability: string
  availableFrom: string | null
  tjm: number | null
  engagementKind: string
  source: string | null
}

export type AtsExportReport = {
  items: AtsExportRow[]
  truncated: boolean
}

/** Au-delà, ce n'est plus un export, c'est un dump : on le DIT (`truncated`)
 *  plutôt que d'envoyer une réponse non bornée. Même ordre de grandeur que
 *  `CONSULTANT_CSV_MAX_ROWS` (import), pour une raison symétrique. */
export const ATS_EXPORT_MAX_ROWS = 5000
