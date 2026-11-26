import type { SyncRunStatus } from '@bellum/contracts'

/**
 * #2110.22 à .31 — recette du 26/09/2026 sur #2980 : l'API renvoie déjà l'état
 * COURANT du job (`matching_accounts`…), l'écran affichait un texte générique
 * fixe (« Synchronisation en cours… ») quel que soit l'état réel. Une clé i18n
 * par état de l'énumération du contrat, jamais le code brut affiché — et
 * jamais un gabarit recomposé ici à partir du statut (même règle que
 * `SyncSummary` pour les lignes de résumé).
 */
export function syncRunStateLabelKey(status: SyncRunStatus): string {
  return `syncSummary.states.${status}`
}

/**
 * Les étapes intermédiaires, dans l'ordre où `IntegrationSyncWorker.process`
 * les traverse réellement (docblock `integration-sync.worker.ts`) — jamais
 * `running` (historique, plus jamais écrit par un job neuf, #2980) ni un état
 * terminal (sa propre bannière existe déjà : titre, résumé, ou erreur).
 */
export const SYNC_RUN_STEPS = [
  'pending',
  'reading_sources',
  'matching_accounts',
  'matching_contacts',
  'detecting_events',
  'preparing_summary',
] as const satisfies readonly SyncRunStatus[]
