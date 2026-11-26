import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, IsNull, Not, Repository } from 'typeorm'
import {
  deriveWeakestLinkDiagnosis,
  explainDiagnosisChange,
  kpiTarget,
  RUNNING_MISSION_STATUSES,
  TRIAGED_STAGES,
  type RenewalStatus,
  type WeakestLinkAccountSignal,
  type WeakestLinkDiagnosis,
} from '@bellum/contracts'
import { ShortTtlCache } from '../../common/short-ttl-cache'
import { AccountEntity } from '../../database/entities/account.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { ActionPlanItemEntity } from '../../database/entities/action-plan-item.entity'
import { ProjectEntity } from '../../database/entities/project.entity'
import { ConsultantEntity } from '../../database/entities/consultant.entity'
import { MissionEntity } from '../../database/entities/mission.entity'
import { WeakestLinkDiagnosisEntity } from '../../database/entities/weakest-link-diagnosis.entity'

/** Comptes ACTIFS au sens du ticket — un compte `inbox` n'a pas encore été
 *  ouvert par un commercial, un compte `customer`/`archived` n'est plus en
 *  conquête. `watching` + `opportunity` sont les deux statuts qu'on travaille
 *  réellement. */
const OPEN_COMMERCIAL_STATUSES = ['watching', 'opportunity'] as const
/** #4009.1 — une fiche supprimée (soft delete) ou archivée n'est JAMAIS citée dans le diagnostic
 *  (« ALTRAN TECHNOLOGIES : aucune prochaine action… » sortait encore en recette prod 11/10). */
const UNCITED_ACCOUNT_STATUSES = ['deleted', 'archived'] as const

/** Un contact « sponsor » au sens MEDDIC du produit — `economic` (budget) ou
 *  `champion` (relais interne), plus la valeur legacy `sponsor` encore
 *  présente en base (voir `decisionRoleSchema`, doctrine « on archive, on ne
 *  supprime pas »). */
const SPONSOR_DECISION_ROLES: readonly string[] = ['economic', 'champion', 'sponsor']

/** X64 / #3294 — l'horizon au-delà duquel une fin de mission ne rend pas le talent « non sécurisé ». */
const TALENT_SECURITY_HORIZON_DAYS = 60

/** X64 / #3294 — une mission dont la suite est DÉJÀ décidée : reconduite, reconduction annoncée par le
 *  client, ou consultant repositionné. Tout autre état (dont `null`, « personne n'a ouvert la ligne »)
 *  laisse la suite ouverte. */
const SECURED_RENEWAL_STATUSES: readonly RenewalStatus[] = [
  'renouvele',
  'reconduction_annoncee',
  'repositionnement_lance',
]

/** Les étapes du pipe qui comptent comme « qualifié » — `TRIAGED_STAGES`
 *  (« un humain s'en occupe-t-il ? ») plus `won` : un projet déjà gagné est la
 *  meilleure preuve possible que la qualification a fonctionné, et l'exclure
 *  ferait dire « pas de pipeline qualifié » à un espace qui vient de signer
 *  tout ce qu'il suivait (GA-57, `opportunity-ontology.ts`). */
const QUALIFIED_PROJECT_STAGES: readonly string[] = [...TRIAGED_STAGES, 'won']

/**
 * BEL-SC-224 (#3253, P0) — LA MAISON CANONIQUE du diagnostic du maillon
 * faible commercial.
 *
 * LECTURE des maisons canoniques existantes (Compte, Action, Opportunité,
 * Talent) + ÉCRITURE d'un historique de diagnostics (jamais un UPDATE en
 * place — doctrine « historique des diagnostics »). Le calcul lui-même
 * (`deriveWeakestLinkDiagnosis`) est une fonction pure dans `@bellum/contracts` ;
 * ce service se limite à rassembler les signaux réels et à persister.
 */
/** Perf 29/09/2026 — le diagnostic dérive de comptes/projets/consultants qui
 *  changent peu ; 60 s, clé = l'ESPACE (le diagnostic est celui de l'espace,
 *  `@WorkspaceRead` : aucun contenu ne dépend de l'appelant). */
const DIAGNOSIS_TTL_MS = 60_000

@Injectable()
export class WeakestLinkDiagnosisService {
  private readonly logger = new Logger(WeakestLinkDiagnosisService.name)
  private readonly cache = new ShortTtlCache<WeakestLinkDiagnosis>(DIAGNOSIS_TTL_MS)

  constructor(
    @InjectRepository(AccountEntity) private readonly accounts: Repository<AccountEntity>,
    @InjectRepository(ContactEntity) private readonly contacts: Repository<ContactEntity>,
    @InjectRepository(ActionPlanItemEntity) private readonly actionPlanItems: Repository<ActionPlanItemEntity>,
    @InjectRepository(ProjectEntity) private readonly projects: Repository<ProjectEntity>,
    @InjectRepository(ConsultantEntity) private readonly consultants: Repository<ConsultantEntity>,
    @InjectRepository(WeakestLinkDiagnosisEntity) private readonly diagnoses: Repository<WeakestLinkDiagnosisEntity>,
    @InjectRepository(MissionEntity) private readonly missions: Repository<MissionEntity>,
  ) {}

  diagnoseFor(workspaceId: string): Promise<WeakestLinkDiagnosis> {
    return this.cache.getOrLoad(`ws:${workspaceId}`, () => this.compute(workspaceId))
  }

  /**
   * R35 (16/10/2026) — le diagnostic du SEMIS d'une salle démo : jamais servi du cache, écriture ATTENDUE.
   *
   * `diagnoseFor` mémorise 60 s et persiste en fond. Appelé en dernier par le semis, il laissait la salle sans sa
   * ligne `weakest_link_diagnoses` dans deux cas : un calcul encore chaud (la purge vide la table, pas le cache de
   * ce process — le semis ne réécrivait donc rien) et l'INSERT pas encore validé quand la salle se relit. Or
   * `weakest_link_diagnoses` est dans `DEMO_SEEDED_TABLES` : une table vide = salle « incomplète » = la prochaine
   * lecture de bail (`repairIfIncomplete`) la purge et la re-sème, sous les yeux du visiteur, en boucle.
   */
  async seedDiagnosisFor(workspaceId: string): Promise<WeakestLinkDiagnosis> {
    const key = `ws:${workspaceId}`
    this.cache.invalidate(key)
    return this.cache.getOrLoad(key, () => this.compute(workspaceId, { awaitPersist: true }))
  }

  private async compute(workspaceId: string, opts: { awaitPersist?: boolean } = {}): Promise<WeakestLinkDiagnosis> {
    // Perf 29/09/2026 — (mesuré 3,9 s en prod) : projets, consultants et
    // historique ne dépendent PAS des comptes ouverts, ils partent avec eux ;
    // et chaque lecture est PROJETÉE (`accounts` porte `raw_analysis`, un gros
    // JSONB que ce calcul n'a jamais lu).
    const projectsRead = this.projects.find({ where: { workspace_id: workspaceId }, select: ['id', 'stage'] })
    const consultantsRead = this.consultants.find({
      where: { workspace_id: workspaceId },
      select: ['id', 'availability'],
    })
    // #3294 — la marge des missions actives : tarif ET coût ; X64 — la date de fin et l'état du
    // renouvellement (sécurité des talents), projetés (aucune autre colonne).
    const missionsRead = this.missions.find({
      where: { workspace_id: workspaceId, status: In([...RUNNING_MISSION_STATUSES]) },
      select: ['id', 'daily_rate', 'daily_cost', 'ends_on', 'renewal_status'],
    })
    // #3294 — les rituels marqués « tenus » : une lecture SQL, constante, aucune autre colonne.
    const ritualsRead = this.diagnoses.manager
      .query<{ ritual_key: string; held_at: Date }[]>(
        `SELECT ritual_key, held_at FROM workspace_ritual_last_held WHERE workspace_id = $1::uuid`,
        [workspaceId],
      )
      .then(rows => rows ?? [])
      .catch((error: unknown) => {
        // Illisible = NON MESURÉ, jamais « aucun rituel » : la famille reste hors du dénominateur.
        this.logger.warn(`weakest-link: rituels illisibles (${(error as Error).message})`)
        return null
      })
    // #3294 — le temps disponible : les heures commerciales par semaine DÉCLARÉES par l'espace
    // (réglage `weekly_available_hours`, #3245). NULL ou illisible = non renseigné, jamais 0 heure.
    const availableHoursRead = this.diagnoses.manager
      .query<{ weekly_available_hours: number | null }[]>(
        `SELECT weekly_available_hours FROM workspace_commercial_load_settings WHERE workspace_id = $1::uuid`,
        [workspaceId],
      )
      .then(rows => rows?.[0]?.weekly_available_hours ?? null)
      .catch((error: unknown) => {
        this.logger.warn(`weakest-link: heures disponibles illisibles (${(error as Error).message})`)
        return null
      })
    const historyRead = this.diagnoses.find({
      where: { workspace_id: workspaceId },
      order: { computed_at: 'DESC' },
      take: 1,
    })
    const openAccounts = await this.accounts.find({
      where: {
        workspace_id: workspaceId,
        commercial_status: In([...OPEN_COMMERCIAL_STATUSES]),
        // #4009.1 — la borne que #4010 n'avait posée que dans briefing.service.ts.
        status: Not(In([...UNCITED_ACCOUNT_STATUSES])),
      },
      select: ['id', 'company_name', 'assigned_to'],
    })
    const accountIds = openAccounts.map(a => a.id)

    const [activeItems, accountContacts, projects, consultants, history, runningMissions, ritualRows, availableHours] =
      await Promise.all([
        accountIds.length
          ? this.actionPlanItems.find({
              where: { account_id: In(accountIds), execution_status: 'todo' },
              select: ['id', 'account_id'],
            })
          : Promise.resolve([]),
        accountIds.length
          ? // Une seule lecture des contacts des comptes ouverts : le sponsor (suivi) ET « a au moins un
            // contact » (voie d'accès, X64) en sortent — jamais deux lectures qui pourraient diverger.
            this.contacts.find({
              where: { account_id: In(accountIds), deleted_at: IsNull() },
              select: ['id', 'account_id', 'decision_role'],
            })
          : Promise.resolve([]),
        projectsRead,
        consultantsRead,
        historyRead,
        missionsRead,
        ritualsRead,
        availableHoursRead,
      ])

    const accountsWithNextAction = new Set(activeItems.map(item => item.account_id))
    const accountsWithSponsor = new Set(
      accountContacts
        .filter(contact => contact.decision_role !== null && SPONSOR_DECISION_ROLES.includes(contact.decision_role))
        .map(contact => contact.account_id),
    )
    const accountsWithContact = new Set(accountContacts.map(contact => contact.account_id))

    const accountSignals: WeakestLinkAccountSignal[] = openAccounts.map(account => ({
      account_id: account.id,
      name: account.company_name,
      is_open: true,
      has_next_action: accountsWithNextAction.has(account.id),
      has_identified_sponsor: accountsWithSponsor.has(account.id),
    }))

    const qualifiedCount = projects.filter(p => QUALIFIED_PROJECT_STAGES.includes(p.stage)).length
    const availableConsultants = consultants.filter(c => c.availability === 'immediate').length

    // Le plancher vient de la CIBLE `gross_margin` (une seule place, GA-26). Une mission sans
    // tarif ou sans coût est NOMMÉE hors du dénominateur, jamais comptée « sous le plancher ».
    const marginFloor = kpiTarget('gross_margin')?.bound ?? null
    const priced = runningMissions.filter(
      mission => mission.daily_rate !== null && mission.daily_rate > 0 && mission.daily_cost !== null,
    )
    const belowFloor = priced.filter(
      mission => ((mission.daily_rate! - mission.daily_cost!) / mission.daily_rate!) * 100 < (marginFloor ?? 0),
    )

    // #3294 — rituels : aucune marque (ou lecture en échec) = non mesuré. Le jour du dernier
    // point hebdomadaire se compte contre l'horloge du calcul.
    const weeklyHeld = ritualRows?.find(row => row.ritual_key === 'weekly')?.held_at ?? null
    const rituals =
      ritualRows && ritualRows.length > 0
        ? {
            marked_count: ritualRows.length,
            weekly_days_since: weeklyHeld
              ? Math.floor((Date.now() - new Date(weeklyHeld).getTime()) / (24 * 60 * 60 * 1000))
              : null,
          }
        : null

    // #3294 — répartition des comptes ouverts entre porteurs : que des comptes, jamais un nom.
    const countByOwner = new Map<string, number>()
    for (const account of openAccounts) {
      if (account.assigned_to) countByOwner.set(account.assigned_to, (countByOwner.get(account.assigned_to) ?? 0) + 1)
    }
    const assignedOpen = [...countByOwner.values()].reduce((sum, n) => sum + n, 0)
    const ownership =
      openAccounts.length === 0
        ? null
        : {
            assigned_open_count: assignedOpen,
            unassigned_open_count: openAccounts.length - assignedOpen,
            owners_count: countByOwner.size,
            top_owner_count: Math.max(0, ...countByOwner.values()),
          }

    // X64 / #3294 — la voie d'accès : des comptes, jamais un nom.
    const accessPath =
      openAccounts.length === 0
        ? null
        : {
            measured_count: openAccounts.length,
            without_contact_count: openAccounts.filter(account => !accountsWithContact.has(account.id)).length,
          }

    // #3294 — l'extension : parmi les comptes ouverts joignables, ceux qui ne tiennent que sur UN contact.
    const contactsPerAccount = new Map<string, number>()
    for (const contact of accountContacts) {
      if (!contact.account_id) continue
      contactsPerAccount.set(contact.account_id, (contactsPerAccount.get(contact.account_id) ?? 0) + 1)
    }
    const extension =
      contactsPerAccount.size === 0
        ? null
        : {
            measured_count: contactsPerAccount.size,
            single_contact_count: [...contactsPerAccount.values()].filter(n => n === 1).length,
          }

    // X64 / #3294 — la sécurité des talents : les missions actives DATÉES qui finissent dans
    // l'horizon sans suite décidée. Sans date de fin, hors du dénominateur (nommée à part).
    const horizonEnd = new Date(Date.now() + TALENT_SECURITY_HORIZON_DAYS * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10)
    const dated = runningMissions.filter(mission => mission.ends_on !== null)
    const talentSecurity =
      runningMissions.length === 0
        ? null
        : {
            measured_count: dated.length,
            unsecured_count: dated.filter(
              mission =>
                String(mission.ends_on) <= horizonEnd &&
                (mission.renewal_status === null || !SECURED_RENEWAL_STATUSES.includes(mission.renewal_status)),
            ).length,
            unmeasured_count: runningMissions.length - dated.length,
            horizon_days: TALENT_SECURITY_HORIZON_DAYS,
          }

    const diagnosis = deriveWeakestLinkDiagnosis({
      accounts: accountSignals,
      pipeline: projects.length ? { qualified_count: qualifiedCount, total_count: projects.length } : null,
      bench: consultants.length ? { available_count: availableConsultants, total_count: consultants.length } : null,
      // Le temps disponible par semaine vient du réglage d'espace (#3245) ; non déclaré, la famille
      // sort du dénominateur — jamais un temps deviné.
      commercialCapacity:
        availableHours === null
          ? null
          : { available_hours_per_week: availableHours, open_account_count: openAccounts.length },
      rituals,
      ownership,
      accessPath,
      talentSecurity,
      extension,
      margin:
        marginFloor === null || runningMissions.length === 0
          ? null
          : {
              measured_count: priced.length,
              below_floor_count: belowFloor.length,
              unmeasured_count: runningMissions.length - priced.length,
              floor_percent: marginFloor,
            },
    })

    const previous = history[0] ?? null
    const changeExplanation = previous
      ? explainDiagnosisChange(
          {
            computed_at: previous.computed_at.toISOString(),
            primary_bottleneck: previous.primary_bottleneck,
            secondary_bottlenecks: previous.secondary_bottlenecks,
            not_evaluable_families: previous.not_evaluable_families,
            confidence: previous.confidence,
            change_explanation: previous.change_explanation,
          },
          diagnosis,
        )
      : null
    const finalDiagnosis: WeakestLinkDiagnosis = { ...diagnosis, change_explanation: changeExplanation }

    // Perf 29/09/2026 — l'historique se persiste EN FOND : la réponse n'attend
    // pas un INSERT, et une base qui refuse l'écriture ne fait plus échouer une
    // LECTURE (l'échec est journalisé, l'historique garde son dernier état).
    const persisted = Promise.resolve(
      this.diagnoses.save({
        workspace_id: workspaceId,
        computed_at: new Date(finalDiagnosis.computed_at),
        primary_bottleneck: finalDiagnosis.primary_bottleneck,
        secondary_bottlenecks: finalDiagnosis.secondary_bottlenecks,
        not_evaluable_families: finalDiagnosis.not_evaluable_families,
        confidence: finalDiagnosis.confidence,
        change_explanation: finalDiagnosis.change_explanation,
      }),
    ).catch((error: unknown) => {
      this.logger.warn(`weakest-link: historique non écrit (${(error as Error).message})`)
    })
    if (opts.awaitPersist) await persisted

    return finalDiagnosis
  }
}
