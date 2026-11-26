import type { CrmFirstImportState } from '@bellum/contracts'
import { DEMO_ANALYSED_ACCOUNTS, DEMO_CRM_DEALS } from '../demo/demo-dataset'

/**
 * B.6 — en démonstration, le panneau montre une reprise TERMINÉE, aux chiffres de ce que la salle sème
 * réellement (comptes analysés, leurs contacts, les affaires du compte phare). Les activités et les
 * propriétaires ne sont pas semés : ils n'ont PAS de ligne (on n'affiche pas ce qu'on n'a pas).
 */
export function demoCrmFirstImport(now: Date): CrmFirstImportState {
  const finished = new Date(now.getTime() - 2 * 60 * 60 * 1000)
  const done = (object: 'accounts' | 'contacts' | 'deals', count: number) => ({
    object,
    status: 'done' as const,
    count,
    conflicts: object === 'contacts' ? 1 : 0,
    truncated: false,
    error: null,
    // #4290.19 — créées / reconnues pour les fiches (le miroir ne les distingue pas) : le contact à l'écart
    // (modifié des deux côtés) était forcément déjà dans Bellum, il est RECONNU.
    ...(object === 'deals'
      ? {}
      : { created: object === 'contacts' ? count - 1 : count, recognized: object === 'contacts' ? 1 : 0 }),
  })
  return {
    provider: 'hubspot',
    state: 'done',
    startedAt: new Date(finished.getTime() - 3 * 60 * 1000).toISOString(),
    finishedAt: finished.toISOString(),
    message: null,
    reconnectNeeded: false,
    objects: [
      done('accounts', DEMO_ANALYSED_ACCOUNTS.length),
      done(
        'contacts',
        DEMO_ANALYSED_ACCOUNTS.reduce((sum, account) => sum + account.contacts.length, 0),
      ),
      done('deals', DEMO_CRM_DEALS.deals.length),
    ],
    demo: true,
  }
}
