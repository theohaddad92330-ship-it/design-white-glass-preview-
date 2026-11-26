import { z } from 'zod'
import { briefingBlockStateSchema } from './daily-briefing.js'
import { mailThreadSchema } from './mailbox.js'
import { isTaskOpen, taskPrioritySchema } from './task.js'
import type { Task } from './task.js'

/**
 * #2392 (LAU-FINAL-106) — LA CLÔTURE DE FIN DE JOURNÉE.
 *
 * Le pendant du brief du matin : « qu'est-ce qui a avancé, qu'est-ce qui reste
 * ouvert, qui attend quelque chose, qu'est-ce qui reprend demain, quelles
 * données valider ». Elle se COMPILE depuis des données réelles — les tâches de
 * la personne, ses fils sortants restés sans réponse, ses cartes encore à
 * valider — et n'en invente aucune.
 *
 * Trois règles tenues ici, pas à l'écran :
 *
 * 1. **Aucun compteur** (#2392.7). Chaque section est une LISTE d'objets
 *    nommés ; « 12 actions faites » est précisément la vanity metric que
 *    l'issue refuse. Une section vide ne fait aucune ligne (doctrine « on
 *    n'affiche pas ce qu'on n'a pas »), une source non lue le DIT (`state`).
 * 2. **« Fait » est un geste déclaratif** : une tâche cochée, jamais une preuve
 *    d'envoi. `resultNote` est ce que la personne a écrit en cochant.
 * 3. **Rien ne se reporte d'office** (#2392.9) : `toDecide` porte les tâches
 *    ouvertes dues aujourd'hui ou en retard, et CHACUNE attend une décision
 *    (`DAY_CLOSURE_DECISIONS`) — il n'existe pas de décision « tout reporter »,
 *    ni de suppression (on archive : « abandonner » = `cancelled`).
 */

/** Ce qu'une ligne de la clôture montre d'une tâche — jamais son corps complet. */
export const dayClosureTaskSchema = z
  .object({
    id: z.string().min(1),
    title: z.string(),
    dueOn: z.string(),
    priority: taskPrioritySchema,
    ownerId: z.string().nullable(),
    ownerName: z.string().nullable(),
    accountName: z.string().nullable(),
    contactName: z.string().nullable(),
    /** Ce que la personne a noté en cochant ou en abandonnant. `null` = rien noté, jamais une raison devinée. */
    resultNote: z.string().nullable(),
  })
  .strict()
export type DayClosureTask = z.infer<typeof dayClosureTaskSchema>

/**
 * Les décisions qu'on peut prendre sur une tâche restée ouverte (#2392.5).
 *
 * « Supprimer » de l'issue devient `drop` (abandonner, statut `cancelled`) :
 * on archive, on ne supprime pas. « Mettre en veille » est un `postpone` plus
 * loin ; « remplacer » est un `requalify`. Aucune n'est présélectionnée.
 */
export const DAY_CLOSURE_DECISIONS = ['postpone', 'delegate', 'requalify', 'drop', 'done'] as const
export type DayClosureDecision = (typeof DAY_CLOSURE_DECISIONS)[number]

const dayClosureTaskListSchema = z.array(dayClosureTaskSchema)

export const dayClosureSchema = z
  .object({
    /** Le jour clôturé, `YYYY-MM-DD` dans le fuseau de la personne. */
    date: z.string(),
    timeZone: z.string(),
    /** L'état de la lecture des tâches : `unavailable` = on n'a PAS lu, pas « rien à clôturer ». */
    tasksState: z.enum(['ready', 'unavailable']),
    tasksReason: z.string().nullable(),
    /** 1. Résultats — tâches cochées aujourd'hui. */
    results: dayClosureTaskListSchema,
    /** 2. Engagements pris — tâches créées aujourd'hui, encore ouvertes, pour plus tard. */
    commitments: dayClosureTaskListSchema,
    /** 3. Attentes externes — fils sortants restés sans réponse. */
    waitingOn: z
      .object({ state: briefingBlockStateSchema, reason: z.string().nullable(), threads: z.array(mailThreadSchema) })
      .strict(),
    /** 4. Échecs ou blocages — tâches abandonnées aujourd'hui, avec la raison notée (ou aucune). */
    blocked: dayClosureTaskListSchema,
    /** 5. À décider — ouvertes, dues aujourd'hui ou en retard : une décision par tâche. */
    toDecide: dayClosureTaskListSchema,
    /** 6. Données à valider — les cartes de Laura encore en attente d'un clic. */
    toValidate: z
      .object({
        state: z.enum(['ready', 'unavailable']),
        reason: z.string().nullable(),
        cards: z.array(z.object({ id: z.string().min(1), label: z.string().min(1) }).strict()),
      })
      .strict(),
    /** 7. Première action de demain — UNE tâche due demain, ou aucune. */
    firstTomorrow: dayClosureTaskSchema.nullable(),
  })
  .strict()
export type DayClosure = z.infer<typeof dayClosureSchema>

type DayClosureTaskSections = Pick<DayClosure, 'results' | 'commitments' | 'blocked' | 'toDecide' | 'firstTomorrow'>

function toLine(task: Task): DayClosureTask {
  return {
    id: task.id,
    title: task.title,
    dueOn: task.dueOn,
    priority: task.priority,
    ownerId: task.ownerId,
    ownerName: task.ownerName,
    accountName: task.accountName,
    contactName: task.contactName,
    resultNote: task.resultNote,
  }
}

const PRIORITY_RANK = { high: 0, normal: 1 } as const

/**
 * Range des tâches RÉELLES dans les cinq sections qui en viennent.
 *
 * `dayOf` convertit un horodatage en `YYYY-MM-DD` dans le fuseau de la
 * personne : « aujourd'hui » se décide là, jamais sur l'heure du serveur.
 */
export function compileDayClosureTasks(input: {
  tasks: readonly Task[]
  today: string
  tomorrow: string
  dayOf: (iso: string) => string
}): DayClosureTaskSections {
  const { tasks, today, tomorrow, dayOf } = input
  const closedToday = (task: Task) =>
    !isTaskOpen(task.status) && !!task.completedAt && dayOf(task.completedAt) === today
  const open = tasks.filter(task => isTaskOpen(task.status))

  const results = tasks.filter(task => task.status === 'done' && closedToday(task))
  const blocked = tasks.filter(task => task.status === 'cancelled' && closedToday(task))
  const toDecide = open
    .filter(task => task.dueOn <= today)
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn) || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority])
  const commitments = open.filter(task => dayOf(task.createdAt) === today && task.dueOn > today)
  const first = open
    .filter(task => task.dueOn === tomorrow)
    .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.createdAt.localeCompare(b.createdAt))[0]

  return {
    results: results.map(toLine),
    commitments: commitments.map(toLine),
    blocked: blocked.map(toLine),
    toDecide: toDecide.map(toLine),
    firstTomorrow: first ? toLine(first) : null,
  }
}
