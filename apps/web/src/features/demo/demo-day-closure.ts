import type { DayClosure, DayClosureTask, PendingChatAction } from '@bellum/contracts'

/**
 * #2392 — LA CLÔTURE DE FIN DE JOURNÉE EN SALLE DE DÉMONSTRATION (craft rule n°9).
 *
 * Le moteur de démonstration ne fait AUCUN appel (`demo-turn.ts`) : la carte se
 * remplit donc ici, sur les MÊMES tâches que `DEMO_TASKS`
 * (`apps/api/src/modules/demo/demo-dataset.ts`) — même titre, même compte, même
 * échéance relative — pour que ce qu'un prospect lit corresponde à ce qu'il
 * retrouve dans l'écran des tâches de la salle. Les dates sont calculées au
 * moment du tour : une date en dur vieillirait.
 *
 * Les identifiants ne sont PAS ceux de la base : la carte le sait
 * (`useIsDemo`) et n'écrit rien en salle — elle montre le diff, pas plus.
 */
function dayOffset(now: Date, days: number): string {
  return new Date(now.getTime() + days * 86_400_000).toISOString().slice(0, 10)
}

function line(id: string, title: string, dueOn: string, overrides: Partial<DayClosureTask> = {}): DayClosureTask {
  return {
    id: `demo-task-${id}`,
    title,
    dueOn,
    priority: 'normal',
    ownerId: null,
    ownerName: null,
    accountName: null,
    contactName: null,
    resultNote: null,
    ...overrides,
  }
}

export function demoDayClosure(now: Date = new Date()): DayClosure {
  const today = dayOffset(now, 0)
  return {
    date: today,
    timeZone: 'Europe/Paris',
    tasksState: 'ready',
    tasksReason: null,
    results: [
      line('sncf-cr', 'Envoyer le compte rendu du point', today, {
        accountName: 'SNCF',
        resultNote: 'Compte rendu transmis à l’équipe programme, prochain point jeudi.',
      }),
    ],
    commitments: [
      line('sg-profils', 'Envoyer deux profils cloud promis en réunion', dayOffset(now, 3), {
        priority: 'high',
        accountName: 'Société Générale',
      }),
    ],
    // Aucune messagerie n'est branchée sur la salle : on le DIT, comme en production.
    waitingOn: { state: 'not_connected', reason: 'mailbox_not_connected', threads: [] },
    blocked: [
      line('bpce-dej', 'Caler un déjeuner avec un responsable technique du groupe', today, {
        accountName: 'Groupe BPCE',
        resultNote: 'Le responsable part en congé trois semaines — à reprendre à son retour.',
      }),
    ],
    toDecide: [
      line('sg-relance', 'Relancer sur les deux profils conformité', dayOffset(now, -2), {
        priority: 'high',
        accountName: 'Société Générale',
      }),
      line('sncf-acheteur', 'Obtenir le nom de l’acheteur référent', today, { accountName: 'SNCF' }),
    ],
    toValidate: { state: 'ready', reason: null, cards: [] },
    firstTomorrow: line('bpce-angle', 'Préparer l’angle renfort sur les domaines ouverts', dayOffset(now, 1), {
      accountName: 'Groupe BPCE',
    }),
  }
}

export function demoDayClosureAction(now: Date = new Date()): PendingChatAction {
  return { action: 'day_closure', cost_credits: 0, closure: demoDayClosure(now) }
}
