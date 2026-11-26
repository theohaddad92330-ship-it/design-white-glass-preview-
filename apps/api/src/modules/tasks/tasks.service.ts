import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { hasPermission, isTaskOpen, localDayKey, resolveTaskType, taskStillOpenSql } from '@bellum/contracts'
import type { CreateTaskInput, ListTasksQuery, Task, TaskSource, TaskStatus, UpdateTaskInput } from '@bellum/contracts'
import { TaskEntity } from '../../database/entities/task.entity'
import { ActivitiesService } from '../activities/activities.service'
import { WorkspaceContextService } from '../workspace/workspace-context.service'

type TaskRow = {
  id: string
  title: string
  details: string | null
  status: string
  priority: string
  due_on: string | Date
  source: string
  expected_result: string | null
  related_action_run_id: string | null
  source_label_key: string | null
  owner_id: string | null
  owner_first: string | null
  owner_last: string | null
  owner_email: string | null
  created_by: string | null
  created_by_first: string | null
  created_by_last: string | null
  created_by_email: string | null
  account_id: string | null
  account_name: string | null
  contact_id: string | null
  contact_name: string | null
  project_id: string | null
  project_label: string | null
  completed_at: Date | string | null
  completed_by: string | null
  completed_by_first: string | null
  completed_by_last: string | null
  completed_by_email: string | null
  result_note: string | null
  channel: string | null
  objective: string | null
  created_at: Date | string
  updated_at: Date | string
}

/** Les colonnes + jointures communes aux trois lectures — une seule liste, jamais recopiée à trois endroits. */
const TASK_SELECT = `t.id, t.title, t.details, t.status, t.priority, t.due_on, t.source, t.expected_result,
              t.related_action_run_id, t.source_label_key,
              t.owner_id, p.first_name AS owner_first, p.last_name AS owner_last, p.email AS owner_email,
              t.created_by, cr.first_name AS created_by_first, cr.last_name AS created_by_last, cr.email AS created_by_email,
              t.account_id, a.company_name AS account_name,
              t.contact_id, c.full_name AS contact_name,
              t.project_id, o.label AS project_label,
              t.completed_at, t.completed_by,
              cb.first_name AS completed_by_first, cb.last_name AS completed_by_last, cb.email AS completed_by_email,
              t.result_note, t.channel, t.objective, t.created_at, t.updated_at
         FROM tasks t
         LEFT JOIN profiles p ON p.user_id = t.owner_id
         LEFT JOIN profiles cr ON cr.user_id = t.created_by
         LEFT JOIN profiles cb ON cb.user_id = t.completed_by
         LEFT JOIN accounts a ON a.id = t.account_id
         LEFT JOIN contacts c ON c.id = t.contact_id
         LEFT JOIN opportunities o ON o.id = t.project_id`

/**
 * Les TÂCHES.
 *
 * Trois décisions du service, chacune contre une manière connue de rendre une
 * liste de tâches inutile :
 *
 * 1. **Le propriétaire par défaut est le créateur.** Une tâche attribuée au
 *    hasard atterrit chez quelqu'un qui l'ignore, puis pourrit la vue de
 *    quelqu'un qui n'y peut rien.
 * 2. **Cocher une tâche écrit une ACTIVITÉ.** Sans ça, l'historique d'un compte
 *    montrerait les e-mails et les appels mais pas le travail fait autour — et
 *    « qu'est-ce qui s'est passé ici ? » aurait une réponse partielle. Le lien
 *    est best-effort : rater la trace ne doit pas empêcher de cocher.
 * 3. **Rouvrir une tâche efface sa date d'achèvement.** Une tâche « à faire »
 *    qui garde « terminée le 3 août » est un état impossible, et c'est celui
 *    qu'on obtient quand on ne remet pas les champs à zéro.
 */
@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name)

  constructor(
    @InjectRepository(TaskEntity) private readonly tasks: Repository<TaskEntity>,
    private readonly workspaceContext: WorkspaceContextService,
    // Optionnel : le module des tâches doit pouvoir se retirer, et se monter,
    // sans que celui des activités soit là (règle #7).
    @Optional() private readonly activities?: ActivitiesService,
  ) {}

  async list(userId: string, query: ListTasksQuery): Promise<{ items: Task[] }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)

    const where: string[] = ['t.workspace_id = $1']
    const params: unknown[] = [workspaceId]

    if (query.scope === 'mine') {
      params.push(userId)
      where.push(`t.owner_id = $${params.length}`)
    } else if (query.scope !== 'workspace') {
      params.push(query.id)
      where.push(`t.${query.scope}_id = $${params.length}`)
    }
    // « Ce qui reste à faire » se demande au contrat : l'agenda, le cockpit de
    // qualité et cette liste répondaient autrefois chacun de leur côté.
    if (!query.includeDone) where.push(taskStillOpenSql('t'))

    params.push(query.limit)
    const rows = await this.tasks.manager.query<TaskRow[]>(
      `SELECT ${TASK_SELECT}
        WHERE ${where.join(' AND ')}
        ORDER BY t.due_on ASC, t.created_at ASC
        LIMIT $${params.length}`,
      params,
    )
    return { items: rows.map(toWire) }
  }

  /**
   * #2105.7 — `source` n'est JAMAIS un champ client : c'est l'APPELANT qui la
   * connaît (le composeur manuel, une conversion de lead, ou depuis #2946 une
   * demande d'approbation Action OS), jamais la tâche elle-même. Défaut
   * `'manual'` — le seul appelant HTTP public.
   *
   * #2105.9 — même discipline pour `relatedActionRunId` : jamais dans
   * `CreateTaskInput` (un client ne peut pas s'inventer une tâche de
   * validation), posé UNIQUEMENT par `WorkflowRunnerService.requestApproval`.
   */
  async create(
    userId: string,
    input: CreateTaskInput,
    source: TaskSource = 'manual',
    relatedActionRunId: string | null = null,
  ): Promise<Task> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    await this.assertTargets(workspaceId, input)

    const saved = await this.tasks.save(
      this.tasks.create({
        workspace_id: workspaceId,
        // Absent = à celui qui crée. Jamais deviné autrement.
        owner_id: input.ownerId ?? userId,
        created_by: userId,
        title: input.title,
        details: input.details ?? null,
        status: 'todo',
        priority: input.priority,
        due_on: input.dueOn,
        source,
        // #2105.2 — « à quoi ressemble fait », distinct de `details`.
        expected_result: input.expectedResult ?? null,
        // #2105.53 (correctif) — posée UNIQUEMENT par le CTA de transformation
        // d'une carte ; `null` pour tout autre appelant.
        source_label_key: input.sourceLabelKey ?? null,
        account_id: input.accountId ?? null,
        contact_id: input.contactId ?? null,
        project_id: input.projectId ?? null,
        related_action_run_id: relatedActionRunId,
        // #2395.4/#2395.9 (épopée #2901) — jamais deviné, posé tel quel.
        channel: input.channel ?? null,
        // #2395.8 (épopée #2871) — requis par `createTaskSchema` : jamais deviné.
        objective: input.objective,
        // #3271.8 reste (épopée #3298) — posé par « Créer une action » des rituels.
        ritual_key: input.ritualKey ?? null,
      }),
    )
    return this.readOne(saved.id, workspaceId)
  }

  /**
   * #2074.16 — « Valider » un mouvement d'audit pose UNE tâche `audit_move`,
   * dans l'espace ACTIF de l'appelant et à son nom (geste utilisateur =
   * auto-approuvé). L'idempotence est en BASE : l'index unique partiel
   * `tasks_audit_move_once_idx` (migration 1796900103000), visé par l'ON
   * CONFLICT — re-valider ne double pas la tâche, même sous deux clics
   * concurrents. Échéance = le jour du geste : une tâche sans date ne remonte
   * dans aucune vue (`due_on` NOT NULL), et l'audit n'en propose aucune.
   */
  async createOnceFromAuditMove(
    userId: string,
    move: { sourceKey: string; title: string; objective: string | null; expectedResult: string | null },
  ): Promise<{ created: boolean }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const rows: unknown[] = await this.tasks.manager.query(
      `INSERT INTO tasks (workspace_id, owner_id, created_by, title, objective, expected_result,
                          status, priority, due_on, source, source_label_key)
       VALUES ($1, $2, $2, $3, $4, $5, 'todo', 'normal', $6, 'audit_move', $7)
       ON CONFLICT (workspace_id, owner_id, source, source_label_key)
         WHERE source = 'audit_move'
         DO NOTHING
       RETURNING id`,
      [workspaceId, userId, move.title, move.objective, move.expectedResult, localDayKey(new Date()), move.sourceKey],
    )
    return { created: Array.isArray(rows) && rows.length > 0 }
  }

  /**
   * #2128.13 (épopée #2788) — « Permettre de demander validation manager » sur
   * un compte (ACC-V4-027, collaboration). Réutilise l'objet TÂCHE (GA-26) :
   * pose une tâche « Validation demandée » sur CHAQUE membre habilité
   * (`team:manage`, hors le demandeur), plutôt que d'inventer un second
   * mécanisme de notification.
   *
   * « Manager » n'a pas de rôle nommé à part dans ce dépôt (voir `workspace.ts`
   * — la matrice ne connaît que `owner`/`admin`/`sales_ops`/`sales`/
   * `tech_admin`/`member`/`viewer`/`recruiter`/`finance`) : le proxy le plus
   * sûr est le droit qui gouverne déjà l'équipe, `team:manage`. Un espace où
   * PERSONNE d'autre ne le détient (solo, ou le demandeur est le seul à
   * l'avoir) rend une liste VIDE — jamais une tâche inventée pour soi-même.
   */
  async requestManagerValidation(userId: string, accountId: string, note?: string): Promise<Task[]> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    await this.assertTargets(workspaceId, { accountId })
    const [account] = await this.tasks.manager.query<{ company_name: string }[]>(
      `SELECT company_name FROM accounts WHERE id = $1 AND workspace_id = $2`,
      [accountId, workspaceId],
    )
    const members = await this.workspaceContext.listMembers(userId)
    const managers = members.filter(member => member.userId !== userId && hasPermission(member.role, 'team:manage'))

    const created: Task[] = []
    for (const manager of managers) {
      created.push(
        await this.create(
          userId,
          {
            title: `Validation demandée : ${account?.company_name ?? 'compte'}`,
            details: note,
            dueOn: localDayKey(new Date()),
            priority: 'normal',
            ownerId: manager.userId,
            accountId,
            // #2395.8 (épopée #2871) — le seul appelant de ce chemin : décider
            // si le compte peut avancer, jamais deviné du contenu de `note`.
            objective: 'Décider si ce compte peut avancer.',
            expectedResult: 'Le compte avance, ou la raison pour laquelle il n’avance pas est connue.',
          },
          'manual',
        ),
      )
    }
    return created
  }

  async update(userId: string, taskId: string, input: UpdateTaskInput): Promise<Task> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const task = await this.tasks.findOne({ where: { id: taskId, workspace_id: workspaceId } })
    if (!task) throw new NotFoundException('Tâche introuvable')

    // L'entité déclare `status` en `text` ; c'est `tasks_status_check` qui le
    // borne aux trois valeurs de l'énumération — même conversion que `toWire`.
    const wasOpen = isTaskOpen(task.status as TaskStatus)

    if (input.title !== undefined) task.title = input.title
    if (input.details !== undefined) task.details = input.details
    if (input.dueOn !== undefined) task.due_on = input.dueOn
    if (input.priority !== undefined) task.priority = input.priority
    if (input.ownerId !== undefined) task.owner_id = input.ownerId
    if (input.status !== undefined) {
      task.status = input.status
      if (isTaskOpen(input.status)) {
        // Rouvrir efface la clôture : une tâche ouverte qui garde
        // « close le 3 août » est un état impossible. #2105.54 — le résultat
        // noté n'y survit pas non plus : un résultat sur une tâche rouverte
        // parlerait d'une clôture qui n'a plus eu lieu.
        task.completed_at = null
        task.completed_by = null
        task.result_note = null
      } else {
        task.completed_at = task.completed_at ?? new Date()
        task.completed_by = task.completed_by ?? userId
      }
    }
    // #2105.54 — « quel résultat », posé au moment de clore (ou plus tard) ;
    // `null` explicite l'efface, `undefined` la laisse intacte.
    if (input.resultNote !== undefined) task.result_note = input.resultNote
    // #2105.2 — même règle que `resultNote`.
    if (input.expectedResult !== undefined) task.expected_result = input.expectedResult
    // #2395.8 — se corrige, ne s'efface pas (`updateTaskSchema` refuse `null`).
    if (input.objective !== undefined) task.objective = input.objective

    await this.tasks.save(task)

    if (wasOpen && input.status === 'done') await this.recordCompletion(workspaceId, userId, task)

    return this.readOne(taskId, workspaceId)
  }

  /**
   * #2406.23 — on archive, on ne supprime pas (c67, #2297 : « un fait périmé
   * redevient inconnu, il ne disparaît pas »). Le geste « supprimer » referme
   * la tâche — même mécanique que `update({ status: 'cancelled' })`, déjà
   * exclue des vues « ouvertes » par `isTaskOpen`/`taskStillOpenSql` et déjà
   * lisible par l'historique (`list({ includeDone: true })`) — plutôt que
   * d'effacer la ligne. Aucune activité journalisée : `recordCompletion` ne
   * s'attache qu'à `done` (voir `update`), jamais à `cancelled` — annuler
   * n'est pas accomplir.
   */
  async remove(userId: string, taskId: string): Promise<void> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const task = await this.tasks.findOne({ where: { id: taskId, workspace_id: workspaceId } })
    if (!task) throw new NotFoundException('Tâche introuvable')
    task.status = 'cancelled'
    task.completed_at = task.completed_at ?? new Date()
    task.completed_by = task.completed_by ?? userId
    await this.tasks.save(task)
  }

  /**
   * Les tâches OUVERTES de l'utilisateur, pour le brief du jour.
   *
   * Sans borne de date : c'est l'écran qui range en paniers (retard, aujourd'hui,
   * demain…), et couper ici à « aujourd'hui » ferait disparaître le retard —
   * précisément ce qu'on veut voir grossir.
   */
  async openForUser(userId: string, workspaceId: string, limit = 100): Promise<Task[]> {
    const rows = await this.tasks.manager.query<TaskRow[]>(
      `SELECT ${TASK_SELECT}
        WHERE t.workspace_id = $1 AND t.owner_id = $2 AND ${taskStillOpenSql('t')}
        ORDER BY t.due_on ASC
        LIMIT $3`,
      [workspaceId, userId, limit],
    )
    return rows.map(toWire)
  }

  /**
   * #2392 — les tâches de l'utilisateur CLOSES ou CRÉÉES depuis `since`, pour la
   * clôture de fin de journée (résultats, blocages, engagements pris).
   *
   * La fenêtre est large exprès (l'appelant passe ~36 h) : « aujourd'hui » se
   * décide ensuite dans le FUSEAU de la personne (`compileDayClosureTasks`),
   * jamais sur l'heure du serveur.
   */
  async closedOrCreatedSince(userId: string, workspaceId: string, since: Date, limit = 100): Promise<Task[]> {
    const rows = await this.tasks.manager.query<TaskRow[]>(
      `SELECT ${TASK_SELECT}
        WHERE t.workspace_id = $1 AND t.owner_id = $2
          AND (t.completed_at >= $3 OR t.created_at >= $3)
        ORDER BY COALESCE(t.completed_at, t.created_at) ASC
        LIMIT $4`,
      [workspaceId, userId, since.toISOString(), limit],
    )
    return rows.map(toWire)
  }

  private async readOne(taskId: string, workspaceId: string): Promise<Task> {
    const rows = await this.tasks.manager.query<TaskRow[]>(
      `SELECT ${TASK_SELECT}
        WHERE t.id = $1 AND t.workspace_id = $2`,
      [taskId, workspaceId],
    )
    const row = rows[0]
    if (!row) throw new NotFoundException('Tâche introuvable')
    return toWire(row)
  }

  /**
   * Vérifie que compte, contact et projet appartiennent bien à l'espace.
   *
   * Un id inconnu est un 404, jamais un rattachement silencieux : une tâche
   * attachée à l'objet d'un autre espace s'afficherait chez son propriétaire
   * légitime. Aucune cible du tout est légitime — c'est une tâche personnelle.
   */
  private async assertTargets(
    workspaceId: string,
    input: { accountId?: string; contactId?: string; projectId?: string },
  ): Promise<void> {
    if (input.accountId) {
      const rows = await this.tasks.manager.query<{ id: string }[]>(
        `SELECT id FROM accounts WHERE id = $1 AND workspace_id = $2 LIMIT 1`,
        [input.accountId, workspaceId],
      )
      if (rows.length === 0) throw new NotFoundException('Compte introuvable')
    }
    if (input.contactId) {
      const rows = await this.tasks.manager.query<{ id: string }[]>(
        // #1473 — la portée venait du COMPTE du contact. Un contact à
        // qualifier n'en a pas : en INNER, la tâche rendait « Contact
        // introuvable ». On garde la vérification d'espace exactement aussi
        // stricte — quand le compte existe c'est LUI qui fait foi, sinon c'est
        // le `workspace_id` du contact. Aucun contact d'un autre espace ne
        // passe : les deux branches comparent à $2.
        `SELECT c.id FROM contacts c LEFT JOIN accounts a ON a.id = c.account_id
          WHERE c.id = $1
            AND (a.workspace_id = $2 OR (c.account_id IS NULL AND c.workspace_id = $2))
          LIMIT 1`,
        [input.contactId, workspaceId],
      )
      if (rows.length === 0) throw new NotFoundException('Contact introuvable')
    }
    if (input.projectId) {
      const rows = await this.tasks.manager.query<{ id: string }[]>(
        `SELECT id FROM opportunities WHERE id = $1 AND workspace_id = $2 LIMIT 1`,
        [input.projectId, workspaceId],
      )
      if (rows.length === 0) throw new NotFoundException('Projet introuvable')
    }
  }

  /**
   * Une tâche cochée devient une ligne d'historique.
   *
   * Best-effort : rater la trace ne doit pas empêcher de cocher. Une erreur ici
   * ferait échouer un geste qui a déjà réussi en base.
   */
  private async recordCompletion(workspaceId: string, userId: string, task: TaskEntity): Promise<void> {
    if (!this.activities) return
    if (!task.account_id && !task.contact_id && !task.project_id) return
    try {
      await this.activities.ingest(workspaceId, userId, [
        {
          kind: 'task',
          source: 'system',
          direction: 'internal',
          subject: task.title,
          body: task.details,
          occurredAt: new Date().toISOString(),
          durationSeconds: null,
          accountId: task.account_id,
          contactId: task.contact_id,
          projectId: task.project_id,
          linkReason: 'manual',
          // Une clé stable : rejouer la même complétion ne produit pas deux
          // lignes d'historique.
          externalId: `task:${task.id}`,
          externalUrl: null,
          participants: [],
        },
      ])
    } catch (error) {
      this.logger.warn(`Task completion not recorded in the timeline: ${(error as Error).message}`)
    }
  }
}

function toWire(row: TaskRow): Task {
  const ownerFull = [row.owner_first, row.owner_last].filter(Boolean).join(' ').trim()
  // #2105.54 — même résolution que le propriétaire : un nom si on le connaît,
  // jamais un identifiant nu à l'écran.
  const completedByFull = [row.completed_by_first, row.completed_by_last].filter(Boolean).join(' ').trim()
  // #2105.8 — même résolution, pour le créateur.
  const createdByFull = [row.created_by_first, row.created_by_last].filter(Boolean).join(' ').trim()
  return {
    id: row.id,
    title: row.title,
    details: row.details,
    status: row.status as Task['status'],
    priority: row.priority as Task['priority'],
    // TypeORM rend une colonne `date` comme une chaîne, mais un `Date` traverse
    // certains chemins de test : on normalise, sans jamais reformater dans un
    // fuseau (une date nue n'a pas de fuseau, et lui en donner un la décale).
    dueOn: typeof row.due_on === 'string' ? row.due_on : row.due_on.toISOString().slice(0, 10),
    source: row.source as Task['source'],
    // #2105.16 — dérivé, jamais stocké : une seconde vérité driftrait le
    // jour où l'un des champs source change sans qu'on pense à celui-ci.
    type: resolveTaskType({
      relatedActionRunId: row.related_action_run_id,
      accountId: row.account_id,
      contactId: row.contact_id,
      projectId: row.project_id,
    }),
    relatedActionRunId: row.related_action_run_id,
    sourceLabelKey: row.source_label_key,
    expectedResult: row.expected_result,
    ownerId: row.owner_id,
    ownerName: ownerFull || row.owner_email || null,
    createdById: row.created_by,
    createdByName: createdByFull || row.created_by_email || null,
    accountId: row.account_id,
    accountName: row.account_name,
    contactId: row.contact_id,
    contactName: row.contact_name,
    projectId: row.project_id,
    projectLabel: row.project_label,
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
    completedById: row.completed_by,
    completedByName: completedByFull || row.completed_by_email || null,
    resultNote: row.result_note,
    channel: row.channel as Task['channel'],
    objective: row.objective,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  }
}
