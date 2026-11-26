import type { AtsStatus } from '@bellum/contracts'

/**
 * #4691.3 — ce que BellumAI peut ÉCRIRE dans l'ERP, et le scope OAuth2 que chaque écriture exige.
 * Les scopes demandés vivent côté API (`boond-scopes.ts`, GA-26) ; ici seulement la correspondance capacité → scope.
 */
const ATS_WRITES = [
  { key: 'create_mission', scope: 'deliveries:write' },
  { key: 'fix_tjm', scope: 'deliveries:write' },
  { key: 'need_status', scope: 'opportunities:write' },
] as const

export type AtsWriteKey = (typeof ATS_WRITES)[number]['key']

/**
 * Les écritures proposées. Une connexion OAuth2 ne propose QUE ce que ses scopes accordés couvrent (scopes non rendus =
 * aucun accordé) ; une connexion héritée ou serveur n'a pas de notion de scope : rien à filtrer.
 */
export function availableAtsWrites(status: AtsStatus | undefined): readonly AtsWriteKey[] {
  if (status?.authMode !== 'oauth2') return ATS_WRITES.map(w => w.key)
  const granted = (status.scopes ?? '').split(/[\s,]+/).filter(Boolean)
  return ATS_WRITES.filter(w => granted.includes(w.scope)).map(w => w.key)
}
