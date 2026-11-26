import type { MailThread } from '@bellum/contracts'

/**
 * Théo B m1.R2 / m1.N1 — « À traiter » et « Historique » se lisent sur l'état du fil.
 *
 * L'état « traité » / « non pertinent » est posé par le commercial et tenu côté serveur (l'archivage y est déjà
 * rangé sous « traité »). Un fil sans état, lu, non lu ou en attente de réponse reste à traiter : rien n'est copié
 * côté écran, un fil change d'onglet quand le serveur change son état.
 */
export function threadIsDone(thread: MailThread): boolean {
  return thread.state === 'treated' || thread.state === 'irrelevant'
}

function isSnoozed(thread: MailThread, now: Date): boolean {
  return Boolean(thread.snoozeUntil && new Date(thread.snoozeUntil).getTime() > now.getTime())
}

/**
 * Chaque fil dans UN seul onglet — la somme des trois est la liste d'origine. Théo B M2.N3 : un fil reporté à une date
 * future vit dans « À venir » ; son report échu, il revient dans « À traiter ».
 */
export function splitThreadsByTab(
  threads: MailThread[],
  now: Date = new Date(),
): { todo: MailThread[]; upcoming: MailThread[]; history: MailThread[] } {
  return {
    todo: threads.filter(thread => !threadIsDone(thread) && !isSnoozed(thread, now)),
    upcoming: threads.filter(thread => !threadIsDone(thread) && isSnoozed(thread, now)),
    history: threads.filter(threadIsDone),
  }
}
