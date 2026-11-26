/**
 * #4055.8 (Louis 15/10/2026) — LES TROIS ÉTATS D'EMPLOI D'UN CONTACT CRM.
 *
 * - `unverified` : « Pas encore vérifié » — aucune relecture, aucune vérification (fournisseur ou main) ;
 * - `not_found`  : « Non retrouvé » — la dernière relecture n'a pas retrouvé la personne (datée) ;
 * - `left`       : « A quitté l'entreprise » — SEULEMENT avec une preuve datée : un AUTRE employeur observé à la
 *                  relecture (`raw_data.employmentCheck`, posé par la routine `contact_job_change`) ;
 * - `seen`       : un employeur confirmé ou vu à une date — l'ancien « Employeur vu le », jamais « vérifié » (c67).
 *
 * L'état est ÉCRIT par le serveur au moment de la relecture (`employmentCheckState`) : l'écran ne compare aucun nom
 * d'entreprise lui-même. Une relecture sans date lisible ne prouve rien.
 */
type ContactEmploymentStatus =
  | { state: 'unverified' }
  | { state: 'not_found'; at: string }
  | { state: 'left'; at: string; organization: string }
  | { state: 'seen'; at?: string }

function readableDate(value: unknown): string | null {
  return typeof value === 'string' && !Number.isNaN(new Date(value).getTime()) ? value : null
}

export function contactEmploymentStatus(input: {
  rawData: Record<string, unknown> | null | undefined
  employmentVerifiedAt: string | null | undefined
}): ContactEmploymentStatus {
  const check = input.rawData?.['employmentCheck']
  const record = typeof check === 'object' && check !== null ? (check as Record<string, unknown>) : null
  const at = readableDate(record?.['at'])
  const organization = typeof record?.['organization'] === 'string' ? record['organization'].trim() : ''
  if (record && at) {
    if (record['state'] === 'not_found') return { state: 'not_found', at }
    if (record['state'] === 'left' && organization) return { state: 'left', at, organization }
    // `confirmed`, `seen` ou un état d'avant ce lot : le fait daté, sans conclure plus.
    return { state: 'seen', at }
  }
  if (input.employmentVerifiedAt) return { state: 'seen' }
  return { state: 'unverified' }
}
