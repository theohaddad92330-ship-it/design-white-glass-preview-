import { z } from 'zod'
import { planActionChannelSchema } from './action-plan-items.js'
import { ritualKeySchema } from './ritual.js'

/**
 * Les TÂCHES — ce qu'il reste à faire, avec une date, un propriétaire et un
 * objet.
 *
 * Le produit savait déjà proposer des actions : le plan d'action d'un compte,
 * les rappels de l'action router, les relances des routines. Aucun n'était une
 * TÂCHE au sens où un commercial l'entend — quelque chose qu'il note lui-même,
 * qui l'attend le lendemain, et qu'il coche. Résultat : ces choses-là vivaient
 * dans un carnet, un post-it ou une tête, et disparaissaient avec.
 *
 * Trois règles portent la table, et chacune vient d'une façon connue de rendre
 * une liste de tâches inutile :
 *
 * 1. **L'échéance est REQUISE.** Une tâche sans date ne remonte dans aucune vue,
 *    donc elle n'est jamais faite, donc la liste se remplit de choses mortes et
 *    plus personne ne l'ouvre. Même règle que `POST /crm/tasks` — le CRM
 *    l'appliquait déjà, et deux définitions de « tâche » auraient divergé.
 * 2. **Le propriétaire n'est jamais deviné.** Sans indication, la tâche est à
 *    celui qui la crée. L'attribuer au hasard la met chez quelqu'un qui l'ignore,
 *    puis elle pourrit la vue de quelqu'un qui n'y peut rien.
 * 3. **Une tâche est rattachée à quelque chose.** Compte, contact ou projet — ou
 *    rien, et c'est alors une tâche personnelle assumée. Ce qui est interdit,
 *    c'est de la rattacher à un objet d'un autre espace.
 *
 * Et un refus : **aucune récurrence.** Une tâche qui se recrée toute seule
 * revient indéfiniment même quand le sujet est clos, et la seule façon de
 * l'arrêter est d'aller chercher une règle que personne ne se rappelle avoir
 * posée. Les répétitions légitimes sont des ROUTINES, qui ont leur écran et leur
 * interrupteur.
 */

export const TASK_STATUSES = ['todo', 'done', 'cancelled'] as const
export const taskStatusSchema = z.enum(TASK_STATUSES)
export type TaskStatus = (typeof TASK_STATUSES)[number]

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * « ENCORE À FAIRE » — LA DÉFINITION, ET ELLE EST ICI
 * ─────────────────────────────────────────────────────────────────────────────
 * Le 28/08/2026, la même tâche recevait deux réponses sur deux écrans voisins.
 * L'agenda demandait `status === 'todo'` ; le cockpit de qualité demandait
 * `status <> 'done'`. Une tâche ANNULÉE était donc « une action programmée »
 * pour le contrôle de qualité et « sans panier » pour l'agenda.
 *
 * L'arbitrage : **une tâche annulée est CLOSE.** Elle n'est pas « faite » — et
 * le statut le dit, il ne disparaît pas —, mais elle n'attend plus personne.
 * Ce qui tranche n'est pas le mot, c'est ce que chaque écran PROMET :
 *
 * · L'agenda promet « voici ce sur quoi tu dois agir ». Une tâche qu'on a
 *   décidé de ne pas faire n'a rien à y faire.
 * · Le contrôle de qualité promet « voici les comptes sur lesquels rien n'est
 *   prévu ». La compter comme « prochaine action » fait dire « ce compte est
 *   couvert » alors que rien n'est prévu — un faux négatif, qui CACHE du
 *   travail sur l'écran dont le métier est d'en montrer.
 *
 * Entre les deux erreurs possibles, celle qui montre une ligne de trop se
 * corrige d'un coup d'œil ; celle qui en cache une ne se découvre jamais.
 *
 * ⚠️ Annuler n'efface rien — on archive, on ne supprime pas. La tâche reste en
 * base avec son statut, et reste lisible : `listTasksQuerySchema` la rend dès
 * qu'on demande l'historique (`includeDone`).
 *
 * Le classement est exhaustif PAR LE TYPE : ajouter un statut à `TASK_STATUSES`
 * sans l'inscrire ici ne compile pas. C'est ce qui empêche un statut neuf
 * d'être « ouvert » ou « clos » par accident — l'accident se découvrirait sur
 * un écran, pas en CI.
 */
const TASK_STATUS_OPENNESS: Record<TaskStatus, 'open' | 'closed'> = {
  todo: 'open',
  done: 'closed',
  /** Décidée non faite. Close : elle n'attend plus personne. */
  cancelled: 'closed',
}

/** Les statuts d'une tâche qui attend encore quelqu'un. */
export const TASK_OPEN_STATUSES: readonly TaskStatus[] = TASK_STATUSES.filter(
  status => TASK_STATUS_OPENNESS[status] === 'open',
)

/** Les statuts d'une tâche qui n'attend plus personne — faite OU annulée. */
export const TASK_CLOSED_STATUSES: readonly TaskStatus[] = TASK_STATUSES.filter(
  status => TASK_STATUS_OPENNESS[status] === 'closed',
)

/** La question, posée une fois. Tout le reste en dérive. */
export function isTaskOpen(status: TaskStatus): boolean {
  return TASK_STATUS_OPENNESS[status] === 'open'
}

/**
 * Le MÊME test, écrit en SQL, pour les requêtes qui ne peuvent pas charger une
 * tâche en mémoire pour la demander.
 *
 * La liste des statuts est ENGENDRÉE depuis l'énumération, jamais recopiée :
 * une liste recopiée est une seconde vérité, et c'est précisément la seconde
 * vérité qu'on vient de retirer du dépôt. Un statut ajouté à `TASK_STATUSES` et
 * classé « ouvert » entre dans toutes les requêtes sans qu'on en touche une.
 *
 * ⚠️ Les valeurs sont interpolées en littéraux et non en paramètres liés : ces
 * fragments sont assemblés dans des requêtes dont la numérotation des
 * paramètres appartient à l'appelant, et un fragment qui consommerait un `$n`
 * décalerait tout ce qui suit. C'est sûr parce que les valeurs viennent d'une
 * énumération FIGÉE — aucune n'a d'origine utilisateur. L'ALIAS, lui, est
 * vérifié : c'est le seul morceau que l'appelant choisit.
 *
 * ⚠️ Un seul statut ouvert donne `= 'todo'` et non `IN ('todo')`. La raison est
 * l'index PARTIEL `tasks_open_by_owner_idx`, déclaré `WHERE status = 'todo'` :
 * l'égalité est la forme dont l'implication avec le prédicat de l'index est
 * évidente pour le planificateur, quelle que soit sa version. Une liste à
 * plusieurs valeurs rend un `IN`, qui est alors la seule forme possible.
 */
export function taskStillOpenSql(alias: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(alias)) {
    throw new Error(`Alias SQL invalide : ${JSON.stringify(alias)}`)
  }
  const [only] = TASK_OPEN_STATUSES
  if (TASK_OPEN_STATUSES.length === 1 && only !== undefined) return `${alias}.status = '${only}'`
  const values = TASK_OPEN_STATUSES.map(status => `'${status}'`).join(', ')
  return `${alias}.status IN (${values})`
}

/**
 * Deux niveaux, pas cinq. Une échelle à cinq crans se remplit de « moyen », et
 * la distinction qui compte réellement est « ça peut attendre » / « non ».
 */
export const TASK_PRIORITIES = ['normal', 'high'] as const
export const taskPrioritySchema = z.enum(TASK_PRIORITIES)
export type TaskPriority = (typeof TASK_PRIORITIES)[number]

/**
 * #2105.7 — D'OÙ VIENT CETTE TÂCHE.
 *
 * Trois appelants à ce jour : le composeur manuel (`POST /tasks`,
 * `TaskComposer.tsx`), la conversion d'un lead en opportunité
 * (`ProjectsController.convert`, qui pose la « prochaine action »), et depuis
 * #2946/#2105.9 le pont Action OS (`WorkflowRunnerService.requestApproval` —
 * une demande d'approbation pose AUSSI une tâche `relatedActionRunId`, pour
 * qu'elle apparaisse dans le brief du jour et pas seulement dans le centre
 * d'approbation). Un champ qui listerait des sources qu'aucun appelant ne pose
 * serait du code juste que personne n'appelle — le défaut n°1 du dépôt. La
 * `plan_callback` (#3416) : la relance posée quand une action du plan est close
 * « À rappeler » avec une date — elle n'est pas « manual », personne ne l'a tapée.
 * La valeur n'est JAMAIS fournie par le client : elle est posée par le SERVICE
 * selon l'appelant, jamais devinée depuis le contenu de la tâche.
 */
// #2074.16 — `audit_move` : un mouvement d'audit VALIDÉ par l'utilisateur
// (`ProfileContextService.recordAuditMoveDecision`), une seule fois par mouvement.
export const TASK_SOURCES = ['manual', 'lead_conversion', 'action_os_approval', 'plan_callback', 'audit_move'] as const
export const taskSourceSchema = z.enum(TASK_SOURCES)
export type TaskSource = (typeof TASK_SOURCES)[number]

/**
 * #2105.16 — LES QUATRE TYPES, ET ILS NE SE CONFONDENT PAS.
 *
 * Une tâche PERSONNELLE n'a pas d'objet ; une tâche LIÉE en a un (compte,
 * contact ou projet) ; une VALIDATION et une ACTION EXTERNE naissent toutes
 * les deux d'un run Action OS (`relatedActionRunId`) — la première demande de
 * relire un résultat déjà produit, la seconde demande d'agir HORS de
 * BellumAI (le copilote n'envoie jamais seul, cf. doctrine).
 *
 * #2946/#2105.9 — `WorkflowRunnerService.requestApproval` pose désormais
 * `relatedActionRunId` sur la tâche de décision qu'elle crée : le pont existe.
 * `external_action` reste déclaré mais non produit — aucun appelant ne
 * distingue encore « à valider » d'« à exécuter hors BellumAI » (voir
 * `resolveTaskType`, qui classe toute tâche liée à un run en `validation`) ;
 * ce n'est pas du code mort, c'est un discriminant EXHAUSTIF posé une fois
 * pour que personne n'ait à choisir entre les deux au moment d'écrire ce
 * second pont — même raison que `TASK_STATUS_OPENNESS`.
 */
export const TASK_TYPES = ['personal', 'linked', 'validation', 'external_action'] as const
export const taskTypeSchema = z.enum(TASK_TYPES)
export type TaskType = (typeof TASK_TYPES)[number]

/**
 * Le type se DÉRIVE, il ne se stocke pas : il ne dépend que de champs déjà en
 * base (le rattachement, le run associé), et un champ calculé qui vivrait
 * AUSSI en colonne serait une seconde vérité — le jour où l'un des deux
 * champs source change sans qu'on pense à ce troisième, ils se contredisent
 * (GA-26).
 */
export function resolveTaskType(input: {
  relatedActionRunId: string | null
  accountId: string | null
  contactId: string | null
  projectId: string | null
}): TaskType {
  // #2105.16 — un run Action OS distingue lui-même « à valider » de « à
  // exécuter dehors » ; tant qu'aucun appelant ne pose ce distinguo, une
  // tâche liée à un run est classée VALIDATION (le cas le plus fréquent :
  // relire un résultat déjà produit).
  if (input.relatedActionRunId) return 'validation'
  if (input.accountId || input.contactId || input.projectId) return 'linked'
  return 'personal'
}

export const taskSchema = z.object({
  id: z.string().guid(),
  title: z.string(),
  details: z.string().nullable(),
  status: taskStatusSchema,
  priority: taskPrioritySchema,
  /** `YYYY-MM-DD` — un jour, pas un instant. Une tâche n'a pas d'heure. */
  dueOn: z.string(),
  /** #2105.7 — jamais deviné, toujours posé par le service qui crée. */
  source: taskSourceSchema,
  /** #2105.16 — dérivé, jamais fourni par le client (voir `resolveTaskType`). */
  type: taskTypeSchema,
  /**
   * #2105.9 — le run Action OS d'où cette tâche vient, quand elle en vient
   * un (`workflowRunSchema.id`). `null` pour toute tâche manuelle ou de
   * conversion de lead — les deux seuls appelants à ce jour.
   */
  relatedActionRunId: z.string().guid().nullable(),
  /**
   * #2105.53 (correctif) — L'IDENTITÉ DE LA CARTE dont cette tâche vient,
   * quand elle vient d'un « Transformer ce sujet en prochaine action »
   * (`briefingActionSourceKey`, `daily-briefing.ts`). Jamais affichée : c'est
   * une clé technique de dédup, pas un champ métier — le brief du jour la
   * compare à celle de chaque carte candidate pour ne plus la reproposer
   * (`BriefingService.allActions`). `null` pour toute tâche qui ne vient pas
   * de ce geste (composeur manuel, conversion de lead).
   */
  sourceLabelKey: z.string().nullable(),
  ownerId: z.string().guid().nullable(),
  ownerName: z.string().nullable(),
  createdById: z.string().guid().nullable(),
  /** « Qui » a créé — résolu comme `ownerName`, jamais un identifiant nu à l'écran. */
  createdByName: z.string().nullable(),
  /**
   * #2105.2 — ce à quoi « fait » ressemble, écrit à la création. Distinct de
   * `details` (le contexte de la tâche) : `expectedResult` répond à « qu'est-ce
   * qui me dira que c'est fait ? », `details` répond à « de quoi s'agit-il ? ».
   */
  expectedResult: z.string().nullable(),
  /**
   * #2395.8 (épopée #2871) — POURQUOI cette tâche, distinct de `details` (« de
   * quoi s'agit-il ? ») et d'`expectedResult` (« à quoi ressemble fait ? »).
   * Requis à l'écriture pour le seul appelant générique (`POST /tasks`,
   * `createTaskSchema`) — même arbitrage que `action_plan_items.reason`
   * (lot `feat/reste-3-29-09`, 29/09) ; `null` pour les lignes créées avant
   * cette colonne, jamais un objectif deviné après coup.
   */
  objective: z.string().nullable(),
  accountId: z.string().guid().nullable(),
  accountName: z.string().nullable(),
  contactId: z.string().guid().nullable(),
  contactName: z.string().nullable(),
  projectId: z.string().guid().nullable(),
  projectLabel: z.string().nullable(),
  completedAt: z.string().nullable(),
  /**
   * #2105.54 — L'AUDITABILITÉ COUVRE AUSSI LES TÂCHES (qui, quand, quel
   * résultat, relisible), DÉCISION Louis 17/09 matin. Action OS l'avait déjà
   * (`cardResultSchema` : `actorName` + `occurredAt` + `outcome`) ; une Tâche
   * n'avait que le « quand » (`completedAt`) — `completed_by` était déjà
   * ÉCRIT en base (`tasks.service.ts`) et jamais LU : du code juste que
   * personne n'appelait, le défaut n°1 du dépôt.
   */
  completedById: z.string().guid().nullable(),
  /** « Qui » — résolu comme `ownerName`, jamais un identifiant nu à l'écran. */
  completedByName: z.string().nullable(),
  /** « Quel résultat » — l'équivalent de `cardResultSchema.outcome` pour une tâche. */
  resultNote: z.string().nullable(),
  /**
   * #2395.4/#2395.9 (épopée #2901) — le canal choisi À LA CRÉATION, jamais
   * deviné du libellé libre : même énumération fermée que le composeur du
   * plan de Laura (`PLAN_ACTION_CHANNELS`, GA-26). Sert de source à
   * `canonicalActionFromTask` (`action.ts`) pour poser `type`/
   * `expected_outcome` sans qu'aucun texte ne soit relu. `null` = jamais
   * renseigné — jamais confondu avec un canal choisi.
   */
  channel: planActionChannelSchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type Task = z.infer<typeof taskSchema>

/**
 * `YYYY-MM-DD`, vérifié comme une VRAIE date et pas seulement comme un motif.
 *
 * Le contrôle est un aller-retour, parce que `Date.parse('2026-02-31')` ne rend
 * pas `NaN` : il roule au 3 mars. Une échéance saisie au 31 février serait donc
 * acceptée puis affichée à une autre date que celle tapée — le genre d'écart
 * qu'on ne remarque qu'une fois la tâche ratée.
 */
const daySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format attendu : AAAA-MM-JJ')
  .refine(value => {
    const parsed = new Date(`${value}T12:00:00Z`)
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
  }, 'Date invalide')

export const createTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(300),
    details: z.string().trim().max(5000).optional(),
    // REQUISE : voir la règle 1 en tête de fichier.
    dueOn: daySchema,
    priority: taskPrioritySchema.default('normal'),
    // #2395.8 (épopée #2871), seconde moitié — REQUIS : le pendant exact de
    // `objective` (« pourquoi ? ») pour « à quoi ressemble fait ? ». Même
    // arbitrage que `createOutreachCallTaskRequestSchema.expected_outcome`
    // (`outreach-canonical.ts`), jamais appliqué à `tasks` avant ce lot — le
    // formulaire générique (composeur) le demande, chaque appelant interne
    // fournit le sien (jamais deviné).
    expectedResult: z.string().trim().min(1).max(2000),
    // #2395.8 (épopée #2871) — REQUIS : une tâche sans objectif écrit son
    // « quoi » (title) sans jamais dire pourquoi. Même arbitrage que
    // `createPlanActionSchema.reason` : le formulaire générique (composeur)
    // le demande, chaque appelant interne fournit le sien (jamais deviné).
    objective: z.string().trim().min(1).max(2000),
    /** Absent = la tâche est à celui qui la crée. Jamais devinée autrement. */
    ownerId: z.string().guid().optional(),
    accountId: z.string().guid().optional(),
    contactId: z.string().guid().optional(),
    projectId: z.string().guid().optional(),
    /** #2105.53 (correctif) — posée UNIQUEMENT par le CTA « Transformer ce
     *  sujet en prochaine action » (`briefingActionSourceKey`) ; absente pour
     *  toute autre création. Jamais rendue à l'écran. */
    sourceLabelKey: z.string().trim().min(1).max(300).optional(),
    /** #2395.4/#2395.9 (épopée #2901) — le canal, optionnel, jamais deviné. */
    channel: planActionChannelSchema.optional(),
    /** #3271.8 reste (épopée #3298) — le rituel d'où vient cette action,
     *  posé UNIQUEMENT par « Créer une action » de l'écran des rituels. Sert
     *  au compte « actions créées » de `ritualActionsCreatedSchema`. */
    ritualKey: ritualKeySchema.optional(),
  })
  .strict()
export type CreateTaskInput = z.infer<typeof createTaskSchema>

/**
 * #2128.13 (épopée #2788) — « Permettre de demander validation manager » sur
 * un compte. Réutilise l'objet TÂCHE existant plutôt que d'inventer un second
 * mécanisme (GA-26) : une tâche « Validation demandée » posée sur CHAQUE
 * membre habilité (`team:manage`) — voir `TasksService.requestManagerValidation`.
 * `note` est libre et optionnelle, comme `details` sur une tâche normale.
 */
export const requestAccountValidationSchema = z.object({ note: z.string().trim().max(2000).optional() }).strict()
export type RequestAccountValidationInput = z.infer<typeof requestAccountValidationSchema>

export const updateTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(300).optional(),
    details: z.string().trim().max(5000).nullable().optional(),
    dueOn: daySchema.optional(),
    priority: taskPrioritySchema.optional(),
    status: taskStatusSchema.optional(),
    ownerId: z.string().guid().nullable().optional(),
    // #2105.54 — saisi au moment de clore, comme le « résultat » d'Action OS.
    // `null` explicite EFFACE une note déjà posée ; absent la laisse intacte.
    resultNote: z.string().trim().max(2000).nullable().optional(),
    // #2105.2 — modifiable après coup, même règle : `null` efface, absent laisse intact.
    expectedResult: z.string().trim().max(2000).nullable().optional(),
    // #2395.8 — modifiable après coup ; `null` refusé (l'objectif, une fois
    // posé, ne se retire pas — seule une correction le remplace).
    objective: z.string().trim().min(1).max(2000).optional(),
  })
  .strict()
  .refine(value => Object.keys(value).length > 0, { message: 'Rien à modifier' })
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>

export const TASK_SCOPES = ['mine', 'account', 'contact', 'project', 'workspace'] as const
export const taskScopeSchema = z.enum(TASK_SCOPES)
export type TaskScope = (typeof TASK_SCOPES)[number]

export const listTasksQuerySchema = z
  .object({
    scope: taskScopeSchema.default('mine'),
    /** Requis pour `account` / `contact` / `project`. */
    id: z.string().guid().optional(),
    /** Par défaut on cache ce qui est fait : une liste de tâches est une liste
     *  de choses À FAIRE, et l'historique se demande explicitement. */
    includeDone: z.coerce.boolean().default(false),
    limit: z.coerce.number().int().min(1).max(200).default(100),
  })
  .strict()
  .refine(value => value.scope === 'mine' || value.scope === 'workspace' || Boolean(value.id), {
    message: 'Un identifiant est requis pour ce périmètre',
  })
export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>

/**
 * Les paniers de l'écran « Aujourd'hui ».
 *
 * `overdue` est SÉPARÉ de `today` volontairement. Les fondre montrerait « 7
 * tâches aujourd'hui » alors que cinq traînent depuis trois semaines : le
 * chiffre serait juste et la lecture fausse, et c'est précisément le retard
 * qu'on veut voir grossir.
 */
export const TASK_BUCKETS = ['overdue', 'today', 'tomorrow', 'this_week', 'later'] as const
export type TaskBucket = (typeof TASK_BUCKETS)[number]

/** Ce dont le tri a besoin — le calcul ne lit jamais un objet complet. */
type BucketableTask = { dueOn: string; status: TaskStatus; priority: TaskPriority }

/** `YYYY-MM-DD` d'une date, dans le fuseau du lecteur. */
export function dayKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** #4134 — les deux reports d'un geste depuis la liste de tâches. */
const TASK_POSTPONE_OPTIONS = ['tomorrow', 'next_week'] as const
export type TaskPostponeOption = (typeof TASK_POSTPONE_OPTIONS)[number]

/**
 * #4134 — la nouvelle échéance d'une tâche reportée. Même grammaire que le
 * report des cartes Laura (`briefingPostponeUntil`) : le calcul part de
 * AUJOURD'HUI (jamais de l'ancienne échéance — une tâche en retard reportée à
 * « demain » ne retombe pas dans le passé), « demain » = J+1, et « semaine
 * prochaine » = le lundi suivant (jamais aujourd'hui, même un lundi).
 */
export function taskPostponedDueOn(option: TaskPostponeOption, now: Date): string {
  const shift = (days: number) => {
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, 12)
    return dayKey(next)
  }
  if (option === 'tomorrow') return shift(1)
  const isoWeekday = now.getDay() === 0 ? 7 : now.getDay()
  return shift(8 - isoWeekday)
}

/** Nombre de jours calendaires entre deux clés `YYYY-MM-DD`. */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T12:00:00Z`)
  const b = Date.parse(`${to}T12:00:00Z`)
  if (Number.isNaN(a) || Number.isNaN(b)) return 0
  return Math.round((b - a) / 86_400_000)
}

/**
 * Dans quel panier tombe une tâche.
 *
 * `now` est un paramètre : un calcul de « aujourd'hui » qui lit l'horloge
 * lui-même ne se teste pas, et c'est exactement celui qu'on veut tester.
 *
 * Une tâche close n'a plus de panier — faite ou annulée, la date où elle était
 * due n'intéresse plus personne. Ce qui est « clos » se demande à `isTaskOpen`
 * et ne se réécrit PAS ici : le jour où c'était écrit `!== 'todo'` en dur, le
 * cockpit de qualité disait `<> 'done'` et les deux écrans se contredisaient.
 */
export function taskBucket(task: BucketableTask, now: Date): TaskBucket | null {
  if (!isTaskOpen(task.status)) return null
  const today = dayKey(now)
  const delta = daysBetween(today, task.dueOn)
  if (delta < 0) return 'overdue'
  if (delta === 0) return 'today'
  if (delta === 1) return 'tomorrow'
  if (delta <= 7) return 'this_week'
  return 'later'
}

export type TaskAgenda = {
  buckets: { bucket: TaskBucket; tasks: Task[] }[]
  /** Ce qui est en retard, compté à part — le chiffre qu'on regarde en premier. */
  overdueCount: number
  /** Ce qui est dû aujourd'hui, en retard exclu. */
  todayCount: number
}

/**
 * Range les tâches en paniers, dans l'ordre d'urgence, en n'émettant que les
 * paniers NON VIDES.
 *
 * À l'intérieur d'un panier : les prioritaires d'abord, puis la date la plus
 * ancienne. Trier par date seule enterrerait une tâche urgente créée le matin
 * sous des tâches ordinaires plus anciennes.
 */
export function buildTaskAgenda(tasks: readonly Task[], now: Date): TaskAgenda {
  const grouped = new Map<TaskBucket, Task[]>()
  for (const task of tasks) {
    const bucket = taskBucket(task, now)
    if (!bucket) continue
    const list = grouped.get(bucket) ?? []
    list.push(task)
    grouped.set(bucket, list)
  }

  const rank: Record<TaskPriority, number> = { high: 0, normal: 1 }
  const buckets = TASK_BUCKETS.flatMap(bucket => {
    const list = grouped.get(bucket)
    if (!list || list.length === 0) return []
    list.sort((a, b) => rank[a.priority] - rank[b.priority] || a.dueOn.localeCompare(b.dueOn))
    return [{ bucket, tasks: list }]
  })

  return {
    buckets,
    overdueCount: grouped.get('overdue')?.length ?? 0,
    todayCount: grouped.get('today')?.length ?? 0,
  }
}
