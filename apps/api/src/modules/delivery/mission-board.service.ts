import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  columnForMission,
  columnForProject,
  consultantsExpected,
  missionMargin,
  MISSION_BOARD_COLUMNS,
  MISSION_BOARD_STALE_DAYS,
  redactFinance,
  summarizeColumn,
  worstAlert,
  type DeliveryMode,
  type MissionBoard,
  type MissionBoardAlert,
  type MissionBoardCard,
  type MissionBoardFilters,
  type MissionStatus,
  type ProjectStage,
} from '@bellum/contracts'
import { MissionEntity } from '../../database/entities/mission.entity'
import { ProjectEntity } from '../../database/entities/project.entity'

/**
 * Le board Missions à douze colonnes (décision D2, PDF 5 §2).
 *
 * Il reste une PROJECTION : aucun état ne lui appartient, chaque carte est
 * possédée par son objet d'origine. Ce que ce chantier ajoute, c'est ce qui
 * manquait pour qu'il serve à quelque chose — le rôle, le consultant, la fin,
 * le TJM, l'alerte, et les agrégats d'en-tête.
 *
 * Deux règles portent l'honnêteté de l'écran :
 *
 *  - **les missions sans date de fin sont comptées à part et EXCLUES du CA
 *    restant.** Leur estimer une durée ferait apparaître un revenu que personne
 *    n'a signé — et c'est le chiffre qu'un dirigeant lit comme acquis.
 *  - **une carte porte AU PLUS UNE alerte**, la plus grave. Trois
 *    avertissements sur une carte n'en font lire aucun.
 */
@Injectable()
export class MissionBoardService {
  private readonly logger = new Logger(MissionBoardService.name)

  /** Bornes de volume. Au-delà, ce n'est plus un board qu'on lit. */
  private static readonly MAX_MISSIONS = 500
  private static readonly MAX_PROJECTS = 500

  constructor(
    @InjectRepository(MissionEntity) private readonly missions: Repository<MissionEntity>,
    @InjectRepository(ProjectEntity) private readonly projects: Repository<ProjectEntity>,
  ) {}

  async board(
    workspaceId: string,
    options: { canReadFinance: boolean; filters?: MissionBoardFilters; now?: Date } = { canReadFinance: false },
  ): Promise<MissionBoard> {
    const now = options.now ?? new Date()
    const today = now.toISOString().slice(0, 10)
    const filters = options.filters ?? {}

    const [missions, projects] = await Promise.all([
      this.missions.find({
        where: { workspace_id: workspaceId },
        order: { updated_at: 'DESC' },
        take: MissionBoardService.MAX_MISSIONS,
      }),
      this.projects.find({
        where: { workspace_id: workspaceId },
        order: { updated_at: 'DESC' },
        take: MissionBoardService.MAX_PROJECTS,
      }),
    ])

    const context = await this.contextFor(
      workspaceId,
      missions.map(mission => mission.id),
      projects.map(project => project.id),
      options.canReadFinance,
    )

    const cards: MissionBoardCard[] = []
    let intakeCount = 0

    for (const project of projects) {
      const column = columnForProject(project.stage as ProjectStage)
      // Détecté / potentiel : l'entonnoir, pas une affaire suivie. Compté à
      // part plutôt que masqué — « 287 non affichés » est une information.
      if (!column) {
        intakeCount += 1
        continue
      }
      // Un projet GAGNÉ que rien ne porte encore appartient à « À créer » : la
      // colonne 1 du document, celle qui n'était alimentée par rien.
      const effective = column === 'gagnee' && !context.missionsByProject.has(project.id) ? 'a_creer' : column
      cards.push({
        id: `project:${project.id}`,
        source: 'project',
        column: effective,
        label: project.label ?? 'Projet',
        accountName: context.accountNames.get(project.account_id) ?? null,
        originState: project.stage,
        role: null,
        consultantName: null,
        endsOn: null,
        dailyRateCents: null,
        // Un PROJET n'a pas de marge — il n'a pas encore de mission dessous.
        // `null` et non l'absence de clé : les cartes des deux sources ont la
        // même forme, sinon l'écran doit deviner laquelle il tient.
        marginPercent: null,
        daysInColumn: daysBetween(project.stage_entered_at ?? project.updated_at, now),
        alert: null,
      })
    }

    for (const mission of missions) {
      const column = columnForMission(mission.status as MissionStatus)
      const assignment = context.assignments.get(mission.id) ?? null
      const rateCents = mission.daily_rate === null ? null : Math.round(Number(mission.daily_rate) * 100)
      // Le coût CHARGÉ des conditions commerciales (D43) — jamais
      // `missions.daily_cost`, que rien dans l'application n'écrit. Le board
      // affichait donc « pas de marge » sur des missions dont la fiche en
      // montrait une.
      const costCents = context.loadedCosts.get(mission.id) ?? null
      const daysInColumn = daysBetween(mission.stage_entered_at ?? mission.updated_at, now)
      // La rédaction financière passe par `redactFinance` et par lui seul (D45).
      // ⚠️ `dailyRateCents` reste HORS de la rédaction : le TJM facturé est
      // visible par design — c'est le coût et la marge qui se gardent.
      cards.push(
        redactFinance(
          {
            id: `mission:${mission.id}`,
            source: 'mission' as const,
            // Un seul noyau de calcul (GA-26, D43) : la fiche, la liste et le board
            // rendent le même nombre pour la même mission, et le coût vient des
            // conditions commerciales — jamais de `missions.daily_cost`.
            column,
            label: mission.label ?? 'Mission',
            accountName: context.accountNames.get(mission.account_id) ?? null,
            originState: mission.status,
            role: mission.role_title,
            consultantName: assignment?.name ?? null,
            endsOn: mission.ends_on,
            dailyRateCents: rateCents,
            marginPercent:
              missionMargin({ dailyRateCents: rateCents, loadedDailyCostCents: costCents })?.percent ?? null,
            daysInColumn,
            alert: worstAlert(
              alertsFor({
                column,
                endsOn: mission.ends_on,
                // #3547 — un forfait encadré n'attend pas de consultant : « sans
                // consultant » y serait une alerte que personne ne peut résoudre.
                hasConsultant: assignment !== null || !consultantsExpected(mission.delivery_mode as DeliveryMode),
                blockedInvoicing: context.blockedMissions.has(mission.id),
                missingTimesheet: context.missingTimesheet.has(mission.id),
                daysInColumn,
              }),
            ),
          },
          options.canReadFinance,
        ),
      )
    }

    const kept = cards.filter(card => matchesFilters(card, filters, context, today))
    return {
      cards: kept,
      columns: MISSION_BOARD_COLUMNS.map(column => summarizeColumn(kept, column, today)),
      intakeCount,
      // Le DROIT voyage avec la réponse : depuis D45, `marginPercent: null` ne
      // dit plus à lui seul si c'est « pas le droit » ou « pas mesuré ».
      canReadFinance: options.canReadFinance,
    }
  }

  /**
   * Ce qu'il faut lire À CÔTÉ des deux tables principales.
   *
   * Quatre requêtes groupées et non une par carte : sur cinq cents missions,
   * une requête par ligne rendrait l'écran inutilisable, et un board lent est
   * un board qu'on n'ouvre pas.
   *
   * Chaque lecture est isolée : une table indisponible retire une décoration,
   * elle ne fait pas tomber le board.
   */
  private async contextFor(
    workspaceId: string,
    missionIds: string[],
    projectIds: string[],
    canReadFinance: boolean,
  ): Promise<BoardContext> {
    const empty: BoardContext = {
      accountNames: new Map(),
      assignments: new Map(),
      missionsByProject: new Set(),
      blockedMissions: new Set(),
      missingTimesheet: new Set(),
      consultantByMission: new Map(),
      loadedCosts: new Map(),
    }
    const manager = this.missions.manager

    try {
      const accounts = await manager.query<{ id: string; company_name: string }[]>(
        `SELECT id, company_name FROM accounts WHERE workspace_id = $1`,
        [workspaceId],
      )
      empty.accountNames = new Map(accounts.map(row => [row.id, row.company_name]))
    } catch (error) {
      this.logger.error('Noms de comptes illisibles pour le board', { error })
    }

    if (missionIds.length > 0) {
      try {
        const rows = await manager.query<{ mission_id: string; consultant_id: string; full_name: string }[]>(
          `SELECT ma.mission_id, ma.consultant_id, c.full_name
             FROM mission_assignments ma
             JOIN consultants c ON c.id = ma.consultant_id
            WHERE ma.mission_id = ANY($1::uuid[])
              AND (ma.ends_on IS NULL OR ma.ends_on >= CURRENT_DATE)`,
          [missionIds],
        )
        for (const row of rows) {
          // Le PREMIER trouvé : une mission à deux consultants existe, et la
          // carte n'a la place que d'un nom. Le board dit qui est dessus, la
          // fiche dit combien ils sont.
          if (!empty.assignments.has(row.mission_id)) {
            empty.assignments.set(row.mission_id, { id: row.consultant_id, name: row.full_name })
          }
          empty.consultantByMission.set(row.mission_id, row.consultant_id)
        }
      } catch (error) {
        this.logger.error('Affectations illisibles pour le board', { error })
      }

      // Le coût chargé — SEULEMENT pour qui a le droit d'en voir la marge.
      // Charger une donnée financière pour la jeter ensuite serait une fuite en
      // attente du premier journal de débogage.
      if (canReadFinance) {
        try {
          const rows = await manager.query<{ mission_id: string; loaded_daily_cost_cents: string | null }[]>(
            `SELECT mission_id, loaded_daily_cost_cents
               FROM mission_commercial_terms
              WHERE mission_id = ANY($1::uuid[]) AND loaded_daily_cost_cents IS NOT NULL`,
            [missionIds],
          )
          for (const row of rows) {
            // `bigint` revient en CHAÎNE, et `Number('')` vaut 0 — soit
            // « 100 % de marge ». Un coût illisible reste inconnu.
            const cents = Number(row.loaded_daily_cost_cents)
            if (row.loaded_daily_cost_cents === '' || !Number.isFinite(cents) || cents < 0) continue
            empty.loadedCosts.set(row.mission_id, cents)
          }
        } catch (error) {
          this.logger.error('Conditions commerciales illisibles pour le board', { error })
        }
      }

      try {
        const rows = await manager.query<{ mission_id: string }[]>(
          `SELECT DISTINCT mission_id FROM invoice_readiness
            WHERE mission_id = ANY($1::uuid[]) AND state = 'blocked'`,
          [missionIds],
        )
        for (const row of rows) empty.blockedMissions.add(row.mission_id)
      } catch (error) {
        this.logger.error('États de facturation illisibles pour le board', { error })
      }

      try {
        const rows = await manager.query<{ mission_id: string }[]>(
          `SELECT m.id AS mission_id
             FROM missions m
            WHERE m.id = ANY($1::uuid[])
              AND m.contract_kind <> 'forfait'
              AND m.started_on IS NOT NULL
              AND m.started_on < date_trunc('month', CURRENT_DATE)
              AND NOT EXISTS (
                SELECT 1 FROM mission_timesheets t
                 WHERE t.mission_id = m.id
                   AND t.period_month = (date_trunc('month', CURRENT_DATE) - interval '1 month')::date)`,
          [missionIds],
        )
        for (const row of rows) empty.missingTimesheet.add(row.mission_id)
      } catch (error) {
        this.logger.error('Relevés manquants illisibles pour le board', { error })
      }
    }

    if (projectIds.length > 0) {
      try {
        const rows = await manager.query<{ opportunity_id: string }[]>(
          `SELECT DISTINCT opportunity_id FROM missions
            WHERE opportunity_id = ANY($1::uuid[]) AND opportunity_id IS NOT NULL`,
          [projectIds],
        )
        for (const row of rows) empty.missionsByProject.add(row.opportunity_id)
      } catch (error) {
        this.logger.error('Rattachement projet → mission illisible', { error })
      }
    }

    return empty
  }
}

type BoardContext = {
  accountNames: Map<string, string>
  assignments: Map<string, { id: string; name: string }>
  missionsByProject: Set<string>
  blockedMissions: Set<string>
  missingTimesheet: Set<string>
  consultantByMission: Map<string, string>
  /** Le coût CHARGÉ par mission, en centimes (D43). VIDE sans `finance:read` :
   *  la requête ne part même pas. */
  loadedCosts: Map<string, number>
}

/** Depuis combien de jours. `null` quand la date est illisible — pas 0, qui
 *  se lirait « déposée aujourd'hui ». */
function daysBetween(from: Date | string | null | undefined, now: Date): number | null {
  if (!from) return null
  const start = from instanceof Date ? from.getTime() : Date.parse(from)
  if (Number.isNaN(start)) return null
  return Math.max(0, Math.floor((now.getTime() - start) / (24 * 60 * 60 * 1000)))
}

/** Tout ce qui s'applique à une carte ; `worstAlert` n'en gardera qu'une. */
function alertsFor(input: {
  column: string
  endsOn: string | null
  hasConsultant: boolean
  blockedInvoicing: boolean
  missingTimesheet: boolean
  daysInColumn: number | null
}): MissionBoardAlert[] {
  const alerts: MissionBoardAlert[] = []
  if (input.blockedInvoicing) alerts.push('invoicing_blocked')
  if (input.missingTimesheet) alerts.push('timesheet_missing')
  if (input.column === 'renouvellement') alerts.push('renewal_due')
  if (input.endsOn === null && (input.column === 'en_cours' || input.column === 'gagnee')) alerts.push('no_end_date')
  if (!input.hasConsultant && (input.column === 'en_cours' || input.column === 'gagnee')) alerts.push('unstaffed')
  const limit = MISSION_BOARD_STALE_DAYS[input.column as keyof typeof MISSION_BOARD_STALE_DAYS]
  if (limit !== null && limit !== undefined && input.daysInColumn !== null && input.daysInColumn > limit) {
    alerts.push('stale')
  }
  return alerts
}

/**
 * Les filtres du §2.3.
 *
 * Un filtre absent ne filtre rien : le board s'ouvre entier, et c'est
 * l'utilisateur qui restreint. Un filtre qui s'appliquerait par défaut ferait
 * chercher des cartes qu'il a lui-même cachées.
 */
function matchesFilters(
  card: MissionBoardCard,
  filters: MissionBoardFilters,
  context: BoardContext,
  today: string,
): boolean {
  const missionId = card.id.startsWith('mission:') ? card.id.slice('mission:'.length) : null
  if (filters.source && card.source !== filters.source) return false
  if (filters.withoutEndDate && card.endsOn !== null) return false
  if (filters.endsBefore && (card.endsOn === null || card.endsOn > filters.endsBefore)) return false
  if (filters.consultantId) {
    if (!missionId || context.consultantByMission.get(missionId) !== filters.consultantId) return false
  }
  if (filters.lateTimesheet) {
    if (!missionId || !context.missingTimesheet.has(missionId)) return false
  }
  if (filters.notInvoiceable) {
    if (!missionId || !context.blockedMissions.has(missionId)) return false
  }
  // `today` n'est pas utilisé ici : il l'est par les agrégats. Le passer garde
  // la signature honnête si un filtre temporel s'ajoute.
  void today
  return true
}
