import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  INTAKE_STAGES,
  UNDECIDED_STAGES,
  needStaffableRefusedSql,
  needStillOpenSql,
  projectStageInSql,
  projectStageNotInSql,
} from '@bellum/contracts'
import { AccountEntity } from '../../database/entities/account.entity'
import { computeCrmKpis, type CrmKpi, type CrmKpiInput } from './crm-kpis'
import { computeMatchingKpis, type MatchingKpi, type MatchingKpiInput } from './matching-kpis'

/** Les stades d'ADMISSION — ceux que personne n'a encore regardés — en
 *  littéraux SQL. Les valeurs viennent de l'énumération du contrat, jamais
 *  d'une saisie : aucune interpolation d'entrée utilisateur ici. */

/** Les stades dont l'ISSUE n'est pas connue, `dormant` compris. Même règle. */

/**
 * Les lectures qui alimentent les neuf KPI CRM (PDF 2 §16).
 *
 * Le calcul vit à côté, PUR et testé. Ce service ne fait que lire — et il lit
 * tout en TOLÉRANT : chaque bloc est enveloppé, parce qu'un indicateur qui
 * échoue ne doit pas emporter les huit autres. C'est la leçon de l'écran
 * Catalogues, dont un `Promise.all` de six requêtes faisait tomber la réponse
 * entière dès que l'une jetait.
 *
 * Un bloc en échec rend ses zéros, donc `null` en sortie — « non mesuré », ce
 * qui est exactement ce qui s'est passé.
 */
@Injectable()
export class CrmKpisService {
  private readonly logger = new Logger(CrmKpisService.name)

  constructor(
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
  ) {}

  async overview(workspaceId: string, days = 30): Promise<{ days: number; kpis: CrmKpi[] }> {
    const window = Math.max(1, Math.trunc(days))
    const input: CrmKpiInput = {
      prioritisedInWindow: await this.count(
        `SELECT count(*)::int AS n FROM accounts
          WHERE workspace_id = $1 AND priority_gate = 'prioritised'
            AND gate_decided_at > now() - ($2 || ' days')::interval`,
        [workspaceId, window],
      ),
      trackedAccounts: await this.count(
        `SELECT count(*)::int AS n FROM accounts
          WHERE workspace_id = $1 AND commercial_status IN ('watching', 'opportunity', 'opening')`,
        [workspaceId],
      ),
      accountsWithoutNextAction: await this.count(
        // « Sans prochaine action » se mesure sur ce qui a été FAIT : aucune
        // colonne « prochaine action » n'existe, et en inventer une la
        // laisserait vide partout. Le dire ainsi est plus honnête.
        `SELECT count(*)::int AS n FROM accounts a
          WHERE a.workspace_id = $1 AND a.commercial_status IN ('watching', 'opportunity', 'opening')
            AND NOT EXISTS (
              SELECT 1 FROM user_actions ua
               WHERE ua.account_id = a.id AND ua.created_at > now() - interval '30 days'
            )`,
        [workspaceId],
      ),
      signalToActionDays: await this.numbers(
        // Le délai entre la mise à jour d'un dossier (qui porte ses signaux) et
        // la première action journalisée après elle. Approximation assumée et
        // DITE : aucun horodatage de signal individuel n'existe.
        `SELECT EXTRACT(EPOCH FROM (MIN(ua.created_at) - a.updated_at)) / 86400 AS v
           FROM accounts a
           JOIN user_actions ua ON ua.account_id = a.id AND ua.created_at >= a.updated_at
          WHERE a.workspace_id = $1 AND jsonb_array_length(COALESCE(a.recent_signals, '[]'::jsonb)) > 0
          GROUP BY a.id, a.updated_at`,
        [workspaceId],
      ),
      detectedProjects: await this.count(`SELECT count(*)::int AS n FROM opportunities WHERE workspace_id = $1`, [
        workspaceId,
      ]),
      // « Qualifié » = tout ce qui n'est plus à l'ADMISSION, projets clos
      // compris : un projet signé a bien été qualifié un jour, et l'exclure
      // ferait baisser le compteur à chaque signature.
      //
      // ⚠️ La liste écrite à la main portait `to_qualify`, qui n'est PAS un
      // stade de projet : c'est un statut de BESOIN (`project_needs.status`),
      // reste du cycle FR d'avant le pivot Projet du 17/08. La contrainte
      // `opportunities_stage_check` n'admet que les neuf `PROJECT_STAGES`, donc
      // ce terme n'a jamais rien exclu — le retirer ne déplace aucun compteur.
      qualifiedProjects: await this.count(
        `SELECT count(*)::int AS n FROM opportunities
          WHERE workspace_id = $1 AND ${projectStageNotInSql('stage', INTAKE_STAGES)}`,
        [workspaceId],
      ),
      // L'âge d'étape regarde tout ce dont l'issue n'est pas connue, `dormant`
      // COMPRIS : un projet qui dort depuis six mois est exactement ce que cet
      // indicateur doit rendre visible.
      stageAges: await this.numbers(
        `SELECT EXTRACT(EPOCH FROM (now() - stage_entered_at)) / 86400 AS v
           FROM opportunities
          WHERE workspace_id = $1 AND stage_entered_at IS NOT NULL
            AND ${projectStageInSql('stage', UNDECIDED_STAGES)}`,
        [workspaceId],
      ),
      // ⚠️ Les trois lectures ci-dessous portaient la MÊME liste recopiée que la
      // routine « besoins sans shortlist » : `NOT IN ('closed', 'cancelled',
      // 'filled')`. Ni `closed` ni `filled` n'existent dans
      // `PROJECT_NEED_STATUSES` — un besoin gagné, perdu ou pourvu comptait donc
      // comme OUVERT dans les deux compteurs. La liste se demande au contrat.
      openNeeds: await this.count(
        `SELECT count(*)::int AS n FROM project_needs
          WHERE workspace_id = $1 AND ${needStillOpenSql('status')}`,
        [workspaceId],
      ),
      needsWithoutShortlist: await this.count(
        `SELECT count(*)::int AS n FROM project_needs n
          WHERE n.workspace_id = $1 AND ${needStillOpenSql('n.status')}
            AND NOT EXISTS (SELECT 1 FROM shortlists s WHERE s.need_id = n.id)`,
        [workspaceId],
      ),
      // ⚠️ CE KPI N'A JAMAIS RENDU UNE SEULE LIGNE (corrigé le 28/08/2026), et
      // pour DEUX raisons dans la même requête : `unstaffable_reason` n'est pas
      // le nom de la colonne (c'est `staffable_reason`), et `staffable = false`
      // compare du `text` à un `boolean`, ce que Postgres refuse. L'enveloppe
      // tolérante de `breakdown` avalait l'erreur en `{}` — le taux de besoins
      // refusés PAR CAUSE, que le §7.6 appelle un indicateur stratégique,
      // s'affichait donc « non mesuré » depuis sa mise en service.
      unstaffableByReason: await this.breakdown(
        `SELECT COALESCE(staffable_reason, 'non_precise') AS k, count(*)::int AS n
           FROM project_needs
          WHERE workspace_id = $1 AND ${needStaffableRefusedSql('staffable')}
          GROUP BY 1`,
        [workspaceId],
      ),
      planAges: await this.numbers(
        `SELECT EXTRACT(EPOCH FROM (now() - updated_at)) / 86400 AS v
           FROM action_plans WHERE workspace_id = $1`,
        [workspaceId],
      ),
      totalContacts: await this.count(
        `SELECT count(*)::int AS n FROM contacts WHERE workspace_id = $1 AND deleted_at IS NULL`,
        [workspaceId],
      ),
      contactsInDuplicatePairs: await this.count(
        `SELECT count(DISTINCT c.id)::int AS n
           FROM contacts c
           JOIN duplicate_pairs d ON d.left_id = c.id OR d.right_id = c.id
          WHERE c.workspace_id = $1 AND c.deleted_at IS NULL`,
        [workspaceId],
      ),
      totalActivities: await this.count(`SELECT count(*)::int AS n FROM activities WHERE workspace_id = $1`, [
        workspaceId,
      ]),
      autoCapturedActivities: await this.count(
        `SELECT count(*)::int AS n FROM activities WHERE workspace_id = $1 AND source <> 'manual'`,
        [workspaceId],
      ),
    }
    return { days: window, kpis: computeCrmKpis(input) }
  }

  /**
   * Les cinq KPI de matching (PDF 4 §16.3).
   *
   * Ils vivent ici et non dans un service à part : ce sont les mêmes lectures
   * tolérantes sur les mêmes tables, et un second service ferait un second
   * endroit où corriger une requête.
   */
  async matchingOverview(workspaceId: string): Promise<{ kpis: MatchingKpi[] }> {
    const input: MatchingKpiInput = {
      submissions: await this.count(
        `SELECT count(*)::int AS n FROM submissions s
           JOIN opportunities o ON o.id = s.project_id
          WHERE o.workspace_id = $1 AND s.stage <> 'shortlisted'`,
        [workspaceId],
      ),
      submissionsWon: await this.count(
        `SELECT count(*)::int AS n FROM submissions s
           JOIN opportunities o ON o.id = s.project_id
          WHERE o.workspace_id = $1 AND s.stage = 'accepted'`,
        [workspaceId],
      ),
      needToShortlistDays: await this.numbers(
        `SELECT EXTRACT(EPOCH FROM (MIN(sh.created_at) - n.created_at)) / 86400 AS v
           FROM project_needs n
           JOIN shortlists sh ON sh.need_id = n.id
          WHERE n.workspace_id = $1
          GROUP BY n.id, n.created_at`,
        [workspaceId],
      ),
      shortlistToSubmissionDays: await this.numbers(
        `SELECT EXTRACT(EPOCH FROM (MIN(s.created_at) - MIN(sh.created_at))) / 86400 AS v
           FROM project_needs n
           JOIN shortlists sh ON sh.need_id = n.id
           JOIN submissions s ON s.need_id = n.id AND s.stage <> 'shortlisted'
          WHERE n.workspace_id = $1
          GROUP BY n.id`,
        [workspaceId],
      ),
      profilesPerNeed: await this.numbers(
        `SELECT count(*)::int AS v
           FROM submissions s
           JOIN project_needs n ON n.id = s.need_id
          WHERE n.workspace_id = $1
          GROUP BY n.id`,
        [workspaceId],
      ),
      rejectedProfiles: await this.count(
        `SELECT count(DISTINCT s.consultant_id)::int AS n
           FROM submissions s
           JOIN opportunities o ON o.id = s.project_id
          WHERE o.workspace_id = $1 AND s.stage = 'rejected'`,
        [workspaceId],
      ),
      rejectedProfilesRepositioned: await this.count(
        // Repositionné AILLEURS : le même profil, sur un AUTRE besoin, après le
        // refus. Compter un repositionnement sur le même besoin ferait passer
        // une correction pour une réussite commerciale.
        `SELECT count(DISTINCT s.consultant_id)::int AS n
           FROM submissions s
           JOIN opportunities o ON o.id = s.project_id
          WHERE o.workspace_id = $1 AND s.stage = 'rejected'
            AND EXISTS (
              SELECT 1 FROM submissions later
               WHERE later.consultant_id = s.consultant_id
                 -- Écrit avec COALESCE plutôt qu'avec la comparaison
                 -- NULL-safe de Postgres : la forme de celle-ci fait lire un
                 -- alias comme un nom de table à la garde du dépôt. Même
                 -- sémantique, NULL compris.
                 AND COALESCE(later.need_id::text, '') <> COALESCE(s.need_id::text, '')
                 AND later.created_at > s.created_at
            )`,
        [workspaceId],
      ),
    }
    return { kpis: computeMatchingKpis(input) }
  }

  /** Un décompte, ou `0` quand la lecture échoue — donc « non mesuré » en sortie. */
  private async count(sql: string, params: unknown[]): Promise<number> {
    try {
      const rows = await this.accounts.manager.query<{ n: number }[]>(sql, params)
      return Number(rows[0]?.n ?? 0)
    } catch (error) {
      this.logger.warn(`KPI CRM illisible: ${String(error)}`)
      return 0
    }
  }

  private async numbers(sql: string, params: unknown[]): Promise<number[]> {
    try {
      const rows = await this.accounts.manager.query<{ v: string | number }[]>(sql, params)
      return rows
        .map(row => Number(row.v))
        .filter(value => Number.isFinite(value) && value >= 0)
        .map(value => Math.round(value))
    } catch (error) {
      this.logger.warn(`KPI CRM illisible: ${String(error)}`)
      return []
    }
  }

  private async breakdown(sql: string, params: unknown[]): Promise<Record<string, number>> {
    try {
      const rows = await this.accounts.manager.query<{ k: string; n: number }[]>(sql, params)
      return Object.fromEntries(rows.map(row => [row.k, Number(row.n)]))
    } catch (error) {
      this.logger.warn(`KPI CRM illisible: ${String(error)}`)
      return {}
    }
  }
}
