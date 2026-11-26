import { Injectable, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, IsNull, MoreThan, Repository } from 'typeorm'
import { FINISHED_MISSION_STATUSES, KNOWN_CONTACT_SOURCES, RUNNING_MISSION_STATUSES } from '@bellum/contracts'
import { ContactEntity } from '../../database/entities/contact.entity'
import { workspaceScopeWhere } from '../workspace/workspace-scoping'
import { MissionEntity } from '../../database/entities/mission.entity'
import { ActivityEntity } from '../../database/entities/activity.entity'
import { AccountEntity } from '../../database/entities/account.entity'
import { AccountPartnerEntity } from '../../database/entities/account-partner.entity'
import { PartnerRelationEntity } from '../../database/entities/partner-relation.entity'
import {
  readAccumulatedRouteCriteria,
  routeSignalsOf,
  talentAtAccount,
  type AccumulatedRouteCriteria,
  type RouteSignals,
} from '../account-access/route-signals'

/** Ce que `resolveRelationAxis` (`analysis.service.ts`) reçoit — les DEUX
 *  sources FACTUELLES qui ne viennent ni du CRM ni d'une correction humaine.
 *  Non exportée : seule consommatrice, cette méthode, dans ce même fichier
 *  (`pnpm lint:exports:types`, knip). */
interface RelationAxisSignals {
  readonly missionsCount?: number
  readonly lastMeetingAt?: string
  readonly lastEmailAt?: string
  /** #4680 — contacts CONNUS (import / CRM) déjà rattachés au compte : un NOMBRE lu en base, jamais un nom. */
  readonly knownContactsCount?: number
  /** #2273.9-.21 — noms des partenaires DÉCLARÉS en place sur le compte (route « partenaire »). */
  readonly declaredPartners?: string[]
  /** #3278.1 — `present` : une mission en cours ; `former` : missions seulement terminées. */
  readonly consultantHistory?: 'present' | 'former'
  /** #3278.1 — un signal d'achat DÉCLARÉ (saisie ou import, #2634.1) existe sur ce
   *  compte — route « signal entrant », jamais déduit d'une détection automatique. */
  readonly declaredSignalPresent?: boolean
  /** #2371.4 — placements EN COURS déclarés sur la relation partenaire de même SIREN (même espace). */
  readonly partnerPlacementsActive?: number
  /** #3278.1 — veille seule / depuis un talent / événement / inbound : les MÊMES quatre signaux que
   *  le pont `/chat` (`routeSignalsOf`), pour que le plan asynchrone nomme les mêmes routes. */
  readonly routeSignals?: RouteSignals
  /** #3278.a — preuves / historique des canaux (même lecteur que `/chat`). `{}` = lu, rien ; absent = non lu. */
  readonly accumulatedRouteCriteria?: AccumulatedRouteCriteria
}

const SIGNED_MISSION_STATUSES = [...RUNNING_MISSION_STATUSES, ...FINISHED_MISSION_STATUSES]

/**
 * #2298.4 (décision Louis 19/09/2026) — « la relation se lit à plusieurs
 * sources ». L'axe RELATION de l'adressabilité (`_relation_axis`, IA) ne
 * lisait QUE le CRM connecté (`CrmReadService`, déjà branché dans
 * `AnalysisService.resolveCrmPresence`). Ce service ajoute les DEUX sources
 * qui restent à lire en base — missions signées et activités déjà capturées
 * (agenda, e-mails) — la QUATRIÈME (correction humaine) est lue directement
 * par `AnalysisService.resolveRelationAxis` depuis
 * `account.relationship_memory`, déjà porté sur l'objet compte : aucun
 * service de plus pour ELLE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE SERVICE VIT DANS `analysis`, PAS DANS `delivery` NI `activities`
 * ─────────────────────────────────────────────────────────────────────────────
 * GA-07 (`module-boundaries.spec.ts`) interdit qu'un SERVICE importe le
 * service d'un autre module — mais les ENTITÉS (`../../database/entities/…`)
 * sont un schéma PARTAGÉ, explicitement hors périmètre de cette garde. Ce
 * service n'importe donc AUCUN service voisin : il injecte directement
 * `MissionEntity` / `ActivityEntity`, déclarées ici dans
 * `TypeOrmModule.forFeature` (`analysis.module.ts`) — le même idiome que
 * `AccountEntity` / `ContactEntity`, déjà déclarées là pour la même raison.
 * `AccountMissionsService` (marge, redaction financière) et `ActivitiesService`
 * (idempotence d'ingestion, dédoublonnage) portent une logique métier hors
 * sujet ici : cet axe ne lit qu'un COMPTE et deux DATES.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI NE SORT PAS D'ICI
 * ─────────────────────────────────────────────────────────────────────────────
 * Ni `subject` ni `body` ne sont sélectionnés — doctrine « le corps des
 * messages ne sort jamais vers un humain ni vers le modèle » (stocké au
 * journal, jamais exposé). Seules deux colonnes de `activities` entrent dans
 * la requête : `kind` (pour grouper) et `occurred_at` (pour dater). Un
 * rendez-vous à VENIR n'est pas un rendez-vous PASSÉ (décision du 19/09) :
 * `occurred_at <= now()` filtre les deux natures identiquement.
 */
@Injectable()
export class RelationAxisReaderService {
  constructor(
    @InjectRepository(MissionEntity) private readonly missions: Repository<MissionEntity>,
    @InjectRepository(ActivityEntity) private readonly activities: Repository<ActivityEntity>,
    @InjectRepository(AccountEntity) private readonly accounts: Repository<AccountEntity>,
    @Optional()
    @InjectRepository(AccountPartnerEntity)
    private readonly partners?: Repository<AccountPartnerEntity>,
    @Optional()
    @InjectRepository(PartnerRelationEntity)
    private readonly partnerRelations?: Repository<PartnerRelationEntity>,
    // #4680 — les contacts CONNUS du compte (4e source en base). Absent (specs à constructeur nu) = clé absente.
    @Optional()
    @InjectRepository(ContactEntity)
    private readonly contacts?: Repository<ContactEntity>,
  ) {}

  async relationSignalsFor(accountId: string): Promise<RelationAxisSignals> {
    const [missionsCount, runningCount, activityRows, account] = await Promise.all([
      this.missions.count({
        where: { account_id: accountId, status: In(SIGNED_MISSION_STATUSES) },
      }),
      this.missions.count({
        where: { account_id: accountId, status: In([...RUNNING_MISSION_STATUSES]) },
      }),
      this.activities.manager.query<Array<{ kind: string; last_occurred_at: Date }>>(
        `SELECT kind, MAX(occurred_at) AS last_occurred_at
         FROM activities
         WHERE account_id = $1 AND kind IN ('meeting', 'email') AND occurred_at <= now()
         GROUP BY kind`,
        [accountId],
      ),
      this.accounts.findOne({
        where: { id: accountId },
        select: {
          id: true,
          declared_signals: true,
          siren: true,
          workspace_id: true,
          sprint: true,
          company_name: true,
          trade_name: true,
          declared_route_event: true,
          declared_route_inbound: true,
        },
      }),
    ])

    const lastOf = (kind: string): string | undefined => {
      const row = activityRows.find(r => r.kind === kind)
      return row?.last_occurred_at ? new Date(row.last_occurred_at).toISOString().slice(0, 10) : undefined
    }
    const lastMeetingAt = lastOf('meeting')
    const lastEmailAt = lastOf('email')
    // #4680 — QUATRIÈME source en base : les contacts connus (import / CRM) du compte. Zéro appel sortant ; le
    // prédicat est celui des contrats (`KNOWN_CONTACT_SOURCES`, GA-26). Aucun contact connu → clé absente, jamais « 0 ».
    const knownContactsCount =
      account?.workspace_id && this.contacts
        ? await this.contacts.count({
            where: {
              account_id: accountId,
              deleted_at: IsNull(),
              hidden: false,
              source: In([...KNOWN_CONTACT_SOURCES]),
              ...workspaceScopeWhere(account.workspace_id),
            },
          })
        : 0

    // #2273.9-.21 — les partenaires que quelqu'un a SAISIS ou confirmés sur ce
    // compte (`source = declared`, `dismissed_at` nul) : jamais une détection
    // du pipeline non confirmée, jamais une ligne écartée.
    const partnerRows = this.partners
      ? await this.partners.find({
          where: { account_id: accountId, relationship: 'partner', source: 'declared', dismissed_at: IsNull() },
          select: { name: true },
        })
      : []
    const declaredPartners = [...new Set(partnerRows.map(row => row.name.trim()).filter(name => name.length > 0))]

    // #3278.1 — « consultant déjà présent » (mission en cours) / « ancien
    // consultant » (missions seulement terminées) : un fait signé, jamais déduit.
    const consultantHistory = runningCount > 0 ? 'present' : missionsCount > 0 ? 'former' : undefined
    // #3278.1 — route « signal entrant » : un signal d'achat DÉCLARÉ (#2634.1,
    // saisie ou import d'un export déjà possédé par le client) existe sur ce
    // compte. Jamais une détection automatique (`recent_signals`, réécrits à
    // chaque analyse) : seul un fait qu'un humain a vu ou importé compte ici.
    const declaredSignalPresent = (account?.declared_signals?.length ?? 0) > 0

    // #2371.4 (#2887) — 10e stade « partenaire actif » : ce compte est une
    // relation PARTENAIRE de l'espace (`partner_relations`, même SIREN) qui
    // porte des placements EN COURS. Rapprochement par SIREN uniquement —
    // jamais par le nom — et dans le MÊME espace (deux espaces sont des
    // concurrents). Aucun placement en cours → clé absente, jamais un « 0 ».
    const partnerPlacementsActive = await this.activePartnerPlacements(account?.siren, account?.workspace_id)

    // #3278.1 — les quatre signaux de route (veille, talent, événement, inbound) : lus comme le pont
    // `/chat` les lit (`routeSignalsOf`), un fait absent ne fait aucune clé.
    const talent = account?.workspace_id
      ? await talentAtAccount(
          (sql, params) => this.accounts.manager.query<Array<{ name: string | null }>>(sql, params),
          account.workspace_id,
          account,
        )
      : false
    const routeSignals = routeSignalsOf(account ?? null, talent)
    // #3278.a — ce que l'espace a accumulé sur ce compte atteint aussi le plan (jusqu'ici `/chat` seul).
    const accumulatedRouteCriteria =
      account?.workspace_id && account.id
        ? await readAccumulatedRouteCriteria(this.accounts.manager, account.workspace_id, account)
        : undefined

    return {
      ...(accumulatedRouteCriteria ? { accumulatedRouteCriteria } : {}),
      ...(Object.keys(routeSignals).length > 0 ? { routeSignals } : {}),
      ...(missionsCount > 0 ? { missionsCount } : {}),
      ...(partnerPlacementsActive > 0 ? { partnerPlacementsActive } : {}),
      ...(consultantHistory ? { consultantHistory } : {}),
      ...(declaredPartners.length > 0 ? { declaredPartners } : {}),
      ...(declaredSignalPresent ? { declaredSignalPresent } : {}),
      ...(lastMeetingAt ? { lastMeetingAt } : {}),
      ...(lastEmailAt ? { lastEmailAt } : {}),
      ...(knownContactsCount > 0 ? { knownContactsCount } : {}),
    }
  }

  private async activePartnerPlacements(siren: string | null | undefined, workspaceId: string | null | undefined) {
    const normalized = (siren ?? '').replace(/\s+/g, '')
    if (!this.partnerRelations || !normalized || !workspaceId) return 0
    const rows = await this.partnerRelations.find({
      where: { workspaceId, siren: normalized, placementsActive: MoreThan(0) },
      select: { id: true, placementsActive: true },
    })
    return rows.reduce((total, row) => total + (row?.placementsActive || 0), 0)
  }
}
