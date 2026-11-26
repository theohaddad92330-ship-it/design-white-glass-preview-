import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, IsNull, MoreThan, Repository } from 'typeorm'
import type { AccountKnownMovements, ContactApolloDetails, SinceLastVisitLine } from '@bellum/contracts'
import { ActivityEntity } from '../../database/entities/activity.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { InterventionEntity } from '../../database/entities/intervention.entity'
import { MissionEntity } from '../../database/entities/mission.entity'
// Deux dérivations PARTAGÉES, réutilisées telles quelles (GA-26) plutôt que
// recopiées : `contactSourceTag` décide « son employeur courant n'est plus ce
// compte », `RENEWAL_AT_RISK`/`measuredLine`/`unmeasuredLine` sont la forme
// déjà typée d'une ligne « ce qui a bougé ». Aucun des deux fichiers importés
// n'est un service — importer une fonction pure ne fait pas monter le
// cliquet GA-07 (`apps/api/src/architecture/module-boundaries.spec.ts`).
import { contactSourceTag } from '../analysis/contact-score'
import { RENEWAL_AT_RISK, measuredLine, unmeasuredLine } from '../briefing/since-last-visit'
import { isAccountKnownFromTraces, KNOWN_ACCOUNT_ACTIVITY_KINDS } from './account-known'

/**
 * Combien de contacts RÉENRICHIS dans la fenêtre on examine pour la ligne
 * « changements de poste » d'UN compte. La même garde que
 * `briefing.service.ts` (`JOB_CHANGE_SCAN_LIMIT`), à une échelle différente :
 * un compte n'a normalement pas des centaines de contacts, donc cette borne
 * ne coupe presque jamais ici — mais « presque jamais » n'est pas « jamais »,
 * et une borne muette qui coupe sans le dire produirait un total faux.
 */
const JOB_CHANGE_SCAN_LIMIT = 200

/**
 * Sans `previous_analysis_at` sur le compte (aucune ré-analyse encore
 * enregistrée), la fenêtre retombe sur ces trente derniers jours. Ce n'est
 * PAS « depuis ta dernière visite » — ce repère par utilisateur n'existe pas
 * (#2556.1) — et l'écran ne doit jamais le prétendre : `since` est renvoyé
 * explicitement pour que la page affiche la date réelle, jamais une formule
 * qu'elle ne peut pas prouver.
 */
const DEFAULT_LOOKBACK_DAYS = 30

/**
 * #2556 — UN COMPTE CONNU DOIT VALOIR MIEUX QU'UN ANNUAIRE.
 *
 * `known()` porte SEUL la décision de #2556.1 : ni contacts, ni fiche, ni
 * aucune trace passive n'y entrent — seulement des missions (tout statut) et
 * des activités D'ACTIVITÉ ({@link KNOWN_ACCOUNT_ACTIVITY_KINDS}). Voir
 * `account-known.ts` pour le prédicat pur et sa raison.
 *
 * `movements()` répond à #2556.2 : sur un compte NON connu, elle ne pose même
 * pas la question (`{ known: false, since: null, lines: [] }`, sans lire ni
 * contacts ni interventions) — produire un panneau vide sur un compte qu'on ne
 * sait pas dire « connu » serait déjà une affirmation qu'on ne peut pas tenir.
 * Sur un compte connu, elle rend deux lignes RÉUTILISÉES de
 * `since-last-visit.ts` (GA-26), filtrées à CE compte au lieu de tout
 * l'espace : `job_changes` et `missions_moving`. `account_signals` reste la
 * responsabilité de l'onglet Veille (déjà par compte) et `replies_received`
 * celle du Brief (une question sur LA messagerie de l'utilisateur, pas sur un
 * compte) — les dupliquer ici dirait deux fois la même chose (GA-26).
 */
@Injectable()
export class AccountKnownService {
  private readonly logger = new Logger(AccountKnownService.name)

  constructor(
    @InjectRepository(MissionEntity) private readonly missions: Repository<MissionEntity>,
    @InjectRepository(ActivityEntity) private readonly activities: Repository<ActivityEntity>,
    @InjectRepository(ContactEntity) private readonly contacts: Repository<ContactEntity>,
    @InjectRepository(InterventionEntity) private readonly interventions: Repository<InterventionEntity>,
  ) {}

  /** #2556.1 — le compte porte-t-il une trace D'ACTIVITÉ ? */
  async known(workspaceId: string, accountId: string): Promise<boolean> {
    const [missionIds, activeActivities] = await Promise.all([
      this.missionIdsForAccount(workspaceId, accountId),
      this.countActiveActivities(workspaceId, accountId),
    ])
    return isAccountKnownFromTraces({ missions: missionIds.length, activeActivities })
  }

  /**
   * #2556.2 — les mouvements d'un compte DÉJÀ connu, ou l'aveu honnête qu'il
   * n'y en a pas / qu'il n'est pas connu.
   *
   * @param companyName Le nom du compte — nécessaire à `contactSourceTag`
   *   pour décider si un contact a quitté CE compte. Le contrôleur le passe
   *   depuis le compte déjà lu (`findOneForWorkspace`) : une seconde lecture
   *   ici dupliquerait une requête que l'appelant a déjà faite.
   * @param previousAnalysisAt `accounts.previous_analysis_at` — `null` si le
   *   dossier n'a jamais été ré-analysé. Sert d'ancre à `since` : voir
   *   {@link DEFAULT_LOOKBACK_DAYS}.
   */
  async movements(
    workspaceId: string,
    accountId: string,
    companyName: string,
    previousAnalysisAt: Date | null,
    now: Date = new Date(),
  ): Promise<AccountKnownMovements> {
    const [missionIds, activeActivities] = await Promise.all([
      this.missionIdsForAccount(workspaceId, accountId),
      this.countActiveActivities(workspaceId, accountId),
    ])
    if (!isAccountKnownFromTraces({ missions: missionIds.length, activeActivities })) {
      return { known: false, since: null, lines: [] }
    }

    const since = previousAnalysisAt ?? new Date(now.getTime() - DEFAULT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000)
    const [jobChanges, missionsMoving] = await Promise.all([
      this.jobChangesLine(workspaceId, accountId, companyName, since),
      this.missionsMovingLine(workspaceId, missionIds, since),
    ])
    return { known: true, since: since.toISOString(), lines: [jobChanges, missionsMoving] }
  }

  private async missionIdsForAccount(workspaceId: string, accountId: string): Promise<string[]> {
    const rows = await this.missions.find({
      where: { workspace_id: workspaceId, account_id: accountId },
      select: ['id'],
    })
    return rows.map(row => row.id)
  }

  private countActiveActivities(workspaceId: string, accountId: string): Promise<number> {
    return this.activities.count({
      where: { workspace_id: workspaceId, account_id: accountId, kind: In([...KNOWN_ACCOUNT_ACTIVITY_KINDS]) },
    })
  }

  /**
   * « un contact a changé d'entreprise — porte neuve », scopée à UN compte.
   * Même règle que `briefing.service.ts#jobChangesLine` (`contactSourceTag`,
   * fenêtre sur `last_enrichment_at`), jamais recopiée : voir l'en-tête.
   */
  private async jobChangesLine(
    workspaceId: string,
    accountId: string,
    companyName: string,
    since: Date,
  ): Promise<SinceLastVisitLine> {
    // Sans nom de compte lisible, comparer rendrait « a changé d'entreprise »
    // pour tout le monde — même prudence que `briefing.service.ts`.
    if (!companyName.trim()) return measuredLine('job_changes', 0)
    try {
      const rows = await this.contacts.find({
        where: {
          workspace_id: workspaceId,
          account_id: accountId,
          deleted_at: IsNull(),
          excluded_at: IsNull(),
          last_enrichment_at: MoreThan(since),
        },
        select: ['source', 'entity', 'raw_data'],
        take: JOB_CHANGE_SCAN_LIMIT,
      })
      if (rows.length >= JOB_CHANGE_SCAN_LIMIT) {
        return unmeasuredLine('job_changes', 'partial', 'account_job_changes_truncated')
      }
      let moved = 0
      for (const row of rows) {
        const apolloDetails = (row.raw_data as { apolloDetails?: ContactApolloDetails } | null)?.apolloDetails
        if (contactSourceTag(row.source ?? null, apolloDetails, companyName, row.entity ?? null) === 'RISQUE') {
          moved += 1
        }
      }
      return measuredLine('job_changes', moved)
    } catch (error) {
      this.logger.warn(`Account known movements: job changes unavailable — ${(error as Error).message}`)
      return unmeasuredLine('job_changes', 'unavailable', 'account_job_changes_unavailable')
    }
  }

  /**
   * « une mission passe sous le seuil de fin » (#2556.2), scopée à UN compte.
   *
   * Les interventions `renewal_at_risk` posent leur sujet sur la MISSION
   * (`subjectType: 'mission'`, `intervention-rules.ts`), jamais sur le
   * compte : filtrer par `subject_id IN (missions de ce compte)` est donc la
   * seule façon correcte de scoper — comparer `subject_id` à `accountId`
   * ne trouverait jamais rien.
   */
  private async missionsMovingLine(
    workspaceId: string,
    missionIds: readonly string[],
    since: Date,
  ): Promise<SinceLastVisitLine> {
    if (missionIds.length === 0) return measuredLine('missions_moving', 0)
    try {
      const count = await this.interventions.count({
        where: {
          workspace_id: workspaceId,
          kind: RENEWAL_AT_RISK,
          subject_type: 'mission',
          subject_id: In([...missionIds]),
          opened_at: MoreThan(since),
        },
      })
      return measuredLine('missions_moving', count)
    } catch (error) {
      this.logger.warn(`Account known movements: missions unavailable — ${(error as Error).message}`)
      return unmeasuredLine('missions_moving', 'unavailable', 'account_missions_unavailable')
    }
  }
}
