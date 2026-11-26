import type { JobsOptions } from 'bullmq'

/**
 * Le contrat BullMQ de la première synchronisation (épopée #2980).
 *
 * Pourquoi une file, et pas l'appel `void this.run(...)` que #3014 avait posé
 * en attendant : ce dernier répondait vite mais ne survivait à RIEN — un
 * redémarrage de l'API en plein `crmSync.syncWorkspace` perdait le job sans
 * que la ligne `integration_sync_runs` ne le sache jamais (elle restait
 * `running` pour toujours). Un job réel, dans Redis, est ce que #2110.21
 * demande explicitement.
 */
export const INTEGRATION_SYNC_QUEUE = 'integration-sync'

export type IntegrationSyncJobData = {
  runId: string
  workspaceId: string
  userId: string
  provider: string
}

/**
 * Une synchronisation à la fois par (espace, connecteur) — la garde
 * anti-double-lancement (#2110.81) vit en base : `getActiveRun` puis l'index
 * unique partiel de la migration `1796321364100`, qui referme la fenêtre de
 * deux requêtes lisant toutes les deux « rien d'actif » avant que l'une n'écrive.
 *
 * ⚠️ #4591 — la clé du job PORTE LE RUN. Elle était (espace + connecteur) seuls, et
 * BullMQ ignore sans bruit un `add` dont le jobId existe déjà, même terminé
 * (`removeOnComplete` garde 24 h, `removeOnFail` 7 j) : la deuxième synchro d'un
 * connecteur n'était jamais enfilée, son run restait « En attente… » pour toujours.
 *
 * ⚠️ AUCUN `:` — BullMQ l'utilise comme séparateur de clés Redis et rejette
 * tout jobId qui en contient (même leçon que `org-rebuild.queue.ts`).
 */
export function integrationSyncJobId(workspaceId: string, provider: string, runId: string): string {
  return `integration-sync-${workspaceId}-${provider}-${runId}`
}

export const INTEGRATION_SYNC_JOB_OPTIONS: JobsOptions = {
  // JAMAIS de retry automatique : une tentative peut avoir déjà écrit une
  // partie du résultat (comptes rapprochés, contacts touchés) — un deuxième
  // passage ne serait pas idempotent au sens strict (il recompterait une
  // fenêtre déjà comptée). Un échec se voit dans le statut du run ; relancer
  // est un GESTE de l'utilisateur, jamais une dépense décidée à sa place.
  attempts: 1,
  removeOnComplete: { age: 86_400, count: 1_000 },
  removeOnFail: { age: 604_800 },
}
