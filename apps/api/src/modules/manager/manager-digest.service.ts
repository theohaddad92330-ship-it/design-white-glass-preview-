import { Injectable, Logger } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { can } from '@bellum/contracts'
import { NotificationsService } from '../notifications/notifications.service'
import { TeamNotificationsService } from '../notifications/team/team-notifier.service'
import { WorkspaceContextService } from '../workspace/workspace-context.service'

const DAY_MS = 24 * 60 * 60 * 1000
/** Un digest par (manager, semaine) : un rejeu du cron, un tick manuel ou une course entre réplicas se confondent. */
const DEDUP_WINDOW_MS = 6 * DAY_MS
/** Un espace n'a une « équipe » qu'à partir de deux membres. */
const MIN_TEAM_MEMBERS = 2

/**
 * #4158.28 — ce que la semaine d'un espace a produit, EN AGRÉGÉ.
 *
 * Chaque mesure est `number | null` : `null` = la requête n'a pas abouti (ou n'a pas de sens),
 * JAMAIS « 0 » — un manager lirait « rien à arbitrer » sur une base indisponible (GA-18 / GA-19).
 * Aucune ligne nominative, aucun classement, aucune probabilité : des dénombrements d'espace.
 */
export type TeamWeekFacts = {
  /** Comptes sans responsable — à attribuer. */
  unassignedAccounts: number | null
  /** Interventions de playbook ouvertes — à trancher. */
  openInterventions: number | null
  /** Actions du plan faites cette semaine, toute l'équipe confondue. */
  actionsDone: number | null
  /** Actions du plan en retard, toute l'équipe confondue. */
  actionsOverdue: number | null
  /** Comptes en veille. */
  watchingAccounts: number | null
}

/** Les lignes du digest, dans l'ordre d'importance. Une mesure absente ne fait AUCUNE ligne. */
export function digestLines(facts: TeamWeekFacts): string[] {
  const lines: string[] = []
  const arbitrage: string[] = []
  if (facts.unassignedAccounts) {
    arbitrage.push(
      `${facts.unassignedAccounts} ${facts.unassignedAccounts > 1 ? 'comptes sans responsable' : 'compte sans responsable'}`,
    )
  }
  if (facts.openInterventions) {
    arbitrage.push(
      `${facts.openInterventions} ${facts.openInterventions > 1 ? 'interventions ouvertes' : 'intervention ouverte'}`,
    )
  }
  if (arbitrage.length > 0) lines.push(`À arbitrer : ${arbitrage.join(' · ')}.`)

  const work: string[] = []
  if (facts.actionsDone !== null && facts.actionsDone > 0) {
    work.push(`${facts.actionsDone} ${facts.actionsDone > 1 ? 'actions faites' : 'action faite'} cette semaine`)
  }
  if (facts.actionsOverdue) {
    work.push(`${facts.actionsOverdue} en retard`)
  }
  if (work.length > 0) lines.push(`Équipe : ${work.join(', ')}.`)

  if (facts.watchingAccounts) {
    lines.push(`En veille : ${facts.watchingAccounts} ${facts.watchingAccounts > 1 ? 'comptes' : 'compte'}.`)
  }
  return lines
}

/**
 * #4158.28 — LE DIGEST HEBDOMADAIRE DU MANAGER.
 *
 * Chaque lundi matin, pour chaque membre `team:manage` d'un espace à ≥ 2 membres : une synthèse de
 * la semaine écoulée, rendue DANS L'APPLICATION (une notification de type `manager_digest`, qui est
 * aussi le marqueur de dédoublonnage). Elle dit ce qui demande un arbitrage, ce que l'équipe a fait
 * et laissé en retard EN AGRÉGÉ, et les comptes en veille.
 *
 * Ce qu'elle ne fait JAMAIS : classer des personnes (aucun nom de commercial n'y figure), afficher
 * une probabilité, écrire « 0 » à la place d'une mesure qui a échoué, ni envoyer un e-mail sans que
 * le manager l'ait demandé. L'e-mail est l'exception, pas la règle : il exige l'interrupteur
 * « digest manager » du manager (`notification_preferences.email_on_manager_digest`, créé par L3),
 * DÉSACTIVÉ par défaut. Dépôt dans l'app ET e-mail passent par `TeamNotificationsService`
 * (`notifyManagerDigest`) : un seul chemin, une seule préférence (intégration passe 2).
 *
 * Semaine vide (aucune mesure non nulle) : pas de digest creux. Best-effort : l'échec d'un manager
 * ou d'un espace ne casse jamais le lot.
 */
@Injectable()
export class ManagerDigestService {
  private readonly logger = new Logger(ManagerDigestService.name)

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly workspaceContext: WorkspaceContextService,
    private readonly notifications: NotificationsService,
    private readonly team: TeamNotificationsService,
  ) {}

  async run(now: Date = new Date()): Promise<{ delivered: number; skipped: number }> {
    let delivered = 0
    let skipped = 0
    const workspaces = await this.dataSource.query<{ workspace_id: string }[]>(
      `SELECT workspace_id FROM workspace_members GROUP BY workspace_id HAVING count(*) >= $1`,
      [MIN_TEAM_MEMBERS],
    )
    for (const { workspace_id: workspaceId } of workspaces) {
      try {
        const result = await this.runForWorkspace(workspaceId, now)
        delivered += result.delivered
        skipped += result.skipped
      } catch (error) {
        skipped += 1
        this.logger.warn(`Manager digest failed for a workspace (non-fatal): ${(error as Error).message}`)
      }
    }
    this.logger.log(`Manager weekly digest: ${delivered} delivered, ${skipped} skipped`)
    return { delivered, skipped }
  }

  private async runForWorkspace(workspaceId: string, now: Date): Promise<{ delivered: number; skipped: number }> {
    const facts = await this.collectFacts(workspaceId, now)
    const lines = digestLines(facts)
    // Semaine vide : pas de digest creux.
    if (lines.length === 0) return { delivered: 0, skipped: 0 }

    const managers = await this.managersOf(workspaceId)
    let delivered = 0
    let skipped = 0
    for (const manager of managers) {
      try {
        const sent = await this.deliverTo(workspaceId, manager, lines, now)
        if (sent) delivered += 1
        else skipped += 1
      } catch (error) {
        skipped += 1
        this.logger.warn(`Manager digest failed for a manager (non-fatal): ${(error as Error).message}`)
      }
    }
    return { delivered, skipped }
  }

  /** Les membres qui encadrent l'équipe : `team:manage`, rôle ET accords nominatifs (`can()`). */
  private async managersOf(workspaceId: string): Promise<{ userId: string }[]> {
    const rows = await this.dataSource.query<{ user_id: string; role: string }[]>(
      `SELECT wm.user_id, wm.role FROM workspace_members wm WHERE wm.workspace_id = $1`,
      [workspaceId],
    )
    const managers: { userId: string }[] = []
    for (const row of rows) {
      const extra = await this.workspaceContext.extraPermissionsOf(workspaceId, row.user_id)
      if (can(row.role as Parameters<typeof can>[0], extra, 'team:manage')) {
        managers.push({ userId: row.user_id })
      }
    }
    return managers
  }

  private async deliverTo(
    workspaceId: string,
    manager: { userId: string },
    lines: string[],
    now: Date,
  ): Promise<boolean> {
    const already = await this.notifications.countSince(
      manager.userId,
      'manager_digest',
      new Date(now.getTime() - DEDUP_WINDOW_MS),
    )
    if (already > 0) return false

    // Le marqueur de dédoublonnage (la ligne dans l'app) est posé par le service d'équipe AVANT l'e-mail.
    return this.team.notifyManagerDigest({
      workspaceId,
      recipientUserId: manager.userId,
      title: 'La semaine de ton équipe',
      lines,
    })
  }

  private async collectFacts(workspaceId: string, now: Date): Promise<TeamWeekFacts> {
    const since = new Date(now.getTime() - 7 * DAY_MS)
    const today = now.toISOString().slice(0, 10)
    return {
      unassignedAccounts: await this.count(
        `SELECT count(*)::int AS n FROM accounts
         WHERE workspace_id = $1 AND assigned_to IS NULL AND commercial_status <> 'archived'`,
        [workspaceId],
      ),
      openInterventions: await this.count(
        `SELECT count(*)::int AS n FROM interventions WHERE workspace_id = $1 AND state = 'open'`,
        [workspaceId],
      ),
      actionsDone: await this.count(
        `SELECT count(*)::int AS n FROM action_plan_items i
         JOIN accounts a ON a.id = i.account_id
         WHERE a.workspace_id = $1 AND i.execution_status = 'done' AND i.completed_at >= $2`,
        [workspaceId, since],
      ),
      actionsOverdue: await this.count(
        `SELECT count(*)::int AS n FROM action_plan_items i
         JOIN accounts a ON a.id = i.account_id
         WHERE a.workspace_id = $1 AND i.done = false
           AND i.execution_status NOT IN ('done', 'obsolete')
           AND i.due_date IS NOT NULL AND i.due_date < $2::date`,
        [workspaceId, today],
      ),
      watchingAccounts: await this.count(
        `SELECT count(*)::int AS n FROM accounts WHERE workspace_id = $1 AND commercial_status = 'watching'`,
        [workspaceId],
      ),
    }
  }

  /** Un dénombrement, ou `null` si la requête a échoué — jamais « 0 » à la place d'une mesure ratée. */
  private async count(sql: string, params: unknown[]): Promise<number | null> {
    try {
      const rows = await this.dataSource.query<{ n: number | string }[]>(sql, params)
      const n = Number(rows[0]?.n)
      return Number.isFinite(n) ? n : null
    } catch (error) {
      this.logger.warn(`Manager digest measure failed: ${(error as Error).message}`)
      return null
    }
  }
}
