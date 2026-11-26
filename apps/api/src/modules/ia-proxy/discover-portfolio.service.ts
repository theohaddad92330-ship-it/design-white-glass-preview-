import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import {
  DISCOVER_KNOWN_NEEDS_MAX,
  NEED_OPEN_STATUSES,
  type DiscoverKnownNeed,
  type DiscoverPortfolioState,
  type SimilarityHeadline,
} from '@bellum/contracts'
import { Repository } from 'typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import { ProjectNeedEntity } from '../../database/entities/project-need.entity'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { workedAccountSql } from '../accounts/account-worked'

/** Analysis status of a soft-deleted account — such a row must NOT keep the
 *  candidate out of Découvrir (mirrors `DELETED_ACCOUNT_STATUS` in
 *  accounts.service.ts, which excludes it from every portfolio read). */
const DELETED_ACCOUNT_STATUS = 'deleted'

type PortfolioMatch = {
  portfolioState: DiscoverPortfolioState
  accountId: string | null
  parkedReason?: string | null
  parkedAt?: string | null
  /** #2166.1 — SEULEMENT quand ce candidat correspond déjà à un compte possédé
   *  de l'espace (même règle que `AccountPartner.logo_url`, #1818.2) : jamais
   *  deviné depuis le nom. `undefined` (clé absente) pour un candidat neuf, ou
   *  un compte possédé sans logo réel — `CompanyAvatar` retombe sur l'initiale. */
  logoUrl?: string | null
  website?: string | null
  /** #2165.24 / #2166.3 / #2165.16 — même règle que `logoUrl` ci-dessus :
   *  SEULEMENT quand ce candidat correspond à un compte possédé qui porte un
   *  lien capitalistique déjà résolu. `undefined` = candidat neuf, `null` =
   *  compte possédé sans lien connu — l'écran écrit « non renseigné », jamais
   *  vide trompeur. */
  groupRole?: 'groupe' | 'filiale' | null
  groupHeadSiren?: string | null
  /** #4294.7 — « Déjà travaillée » : SEULEMENT à `true`, quand le compte de l'espace porte une relation ou une
   *  mission passée (calculé à la lecture, jamais écrit). Clé absente = pas travaillé, ou lecture indisponible. */
  workedBefore?: true
}

const UNOWNED: PortfolioMatch = { portfolioState: 'new', accountId: null }

/**
 * Croise les candidats Découvrir avec le portefeuille de l'appelant.
 *
 * C'est le champ qui empêche l'écran de reproposer un compte que le commercial
 * possède déjà — la façon la plus visible dont Découvrir lui faisait perdre son
 * temps. L'IA ne peut pas le calculer : elle ne connaît pas le portefeuille.
 *
 * Deux règles de fond :
 *
 * - **Périmètre workspace**, comme toutes les lectures de comptes : le compte
 *   d'un coéquipier compte, celui d'un autre tenant jamais. `workspace_id` est
 *   la portée de lecture (`user_id` n'est qu'une attribution de création).
 * - **Un compte existant n'est JAMAIS rendu `new`**, quel que soit son statut
 *   d'analyse : le posséder est précisément le sujet. Un compte en erreur ou en
 *   cours reste donc `analyzed` et porte son `accountId`, pour que l'UI pointe
 *   dessus au lieu d'en proposer un doublon. Seule la suppression douce libère
 *   le candidat.
 */
@Injectable()
export class DiscoverPortfolioService {
  private readonly logger = new Logger(DiscoverPortfolioService.name)

  constructor(
    @InjectRepository(AccountEntity) private readonly accounts: Repository<AccountEntity>,
    @InjectRepository(ProjectNeedEntity) private readonly needs: Repository<ProjectNeedEntity>,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  /**
   * État portefeuille de chaque candidat, dans l'ordre reçu. Une SEULE requête
   * pour toute la page (jamais une par candidat).
   *
   * Ne jette jamais : Découvrir est un écran gratuit et en lecture seule, un
   * incident de base dégrade l'enrichissement en `new` plutôt que de faire
   * échouer la découverte entière.
   */
  async resolve(userId: string, candidates: ReadonlyArray<{ siren: string; name: string }>): Promise<PortfolioMatch[]> {
    if (candidates.length === 0) return []
    try {
      const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
      const sirens = [...new Set(candidates.map(candidate => candidate.siren).filter(Boolean))]
      const names = [...new Set(candidates.map(candidate => this.normalize(candidate.name)).filter(Boolean))]

      const qb = this.accounts
        .createQueryBuilder('account')
        .select([
          'account.id',
          'account.siren',
          'account.company_name',
          'account.status',
          'account.commercial_status',
          // La porte G1 : un compte écarté ne se repropose pas comme neuf.
          'account.priority_gate',
          'account.gate_reason',
          'account.gate_decided_at',
          // #2166.1 — le logo/site du compte, SEULEMENT quand il est déjà possédé.
          'account.logo_url',
          'account.website',
          // #2165.24 / #2166.3 / #2165.16 — idem pour le lien capitalistique.
          'account.group_role',
          'account.group_head_siren',
        ])
        .where('account.workspace_id = :workspaceId', { workspaceId })
      // Même clause de rapprochement que les lookups un-à-un d'AccountsService
      // (`accounts.service.ts`) : le SIREN, sinon le nom — les comptes créés
      // avant que `accounts.siren` soit alimenté n'ont que leur raison sociale.
      // Les listes vides sont exclues : TypeORM jette sur un `IN (:...x)` vide.
      const clauses: string[] = []
      if (sirens.length > 0) clauses.push('account.siren IN (:...sirens)')
      if (names.length > 0) clauses.push('LOWER(TRIM(account.company_name)) IN (:...names)')
      if (clauses.length === 0) return candidates.map(() => UNOWNED)
      qb.andWhere(`(${clauses.join(' OR ')})`, { sirens, names })

      const rows = (await qb.getMany()).filter(row => row.status !== DELETED_ACCOUNT_STATUS)
      const bySiren = new Map(rows.filter(row => row.siren).map(row => [row.siren as string, row]))
      const byName = new Map(rows.map(row => [this.normalize(row.company_name), row]))

      const worked = await this.workedAccountIds(
        workspaceId,
        rows.map(row => row.id),
      )
      return candidates.map(candidate => {
        // Le SIREN prime sur le nom : deux entreprises distinctes peuvent
        // partager une enseigne, l'identifiant registre tranche.
        const row = bySiren.get(candidate.siren) ?? byName.get(this.normalize(candidate.name))
        if (!row) return UNOWNED
        // L'écartement PRIME sur le cycle de vente : un compte refusé à la porte
        // G1 doit se lire « écarté », pas « analysé ». C'est exactement ce que
        // l'écran reproposait en boucle jusqu'ici.
        if (row.priority_gate === 'parked') {
          return {
            portfolioState: 'parked',
            accountId: row.id,
            parkedReason: row.gate_reason ?? null,
            parkedAt: row.gate_decided_at ? row.gate_decided_at.toISOString() : null,
            logoUrl: row.logo_url ?? undefined,
            website: row.website ?? undefined,
            groupRole: row.group_role ?? undefined,
            groupHeadSiren: row.group_head_siren ?? undefined,
            ...(worked.has(row.id) ? { workedBefore: true as const } : {}),
          }
        }
        return {
          portfolioState: this.stateOf(row),
          accountId: row.id,
          logoUrl: row.logo_url ?? undefined,
          website: row.website ?? undefined,
          groupRole: row.group_role ?? undefined,
          groupHeadSiren: row.group_head_siren ?? undefined,
          ...(worked.has(row.id) ? { workedBefore: true as const } : {}),
        }
      })
    } catch (error) {
      this.logger.error('Discover portfolio resolution failed', { error, tags: { feature: 'discover' } })
      return candidates.map(() => UNOWNED)
    }
  }

  /**
   * #4294.7 — parmi ces comptes de l'espace, ceux qui sont « déjà travaillés » (prédicat partagé avec le cadrage
   * d'analyse). UNE requête pour la page. Une panne dégrade en ensemble vide : on n'invente jamais un « travaillé »,
   * et l'état portefeuille déjà résolu ne tombe pas avec elle.
   */
  private async workedAccountIds(workspaceId: string, accountIds: readonly string[]): Promise<Set<string>> {
    if (accountIds.length === 0) return new Set()
    try {
      const found: Array<{ id: string }> = await this.accounts.manager.query(
        `SELECT account.id AS id
           FROM accounts account
          WHERE account.workspace_id = $1
            AND account.id = ANY($2)
            AND ${workedAccountSql('account', '$1')}`,
        [workspaceId, [...accountIds]],
      )
      return new Set((Array.isArray(found) ? found : []).map(row => row.id))
    } catch (error) {
      this.logger.warn('Discover worked-accounts lookup failed', { error, tags: { feature: 'discover' } })
      return new Set()
    }
  }

  /**
   * #2166.11 (épopée #2806) — LA RÉFÉRENCE COMPARABLE d'un candidat DÉCOUVERT.
   *
   * Extension de la même famille que `resolve()` ci-dessus : ne regarde QUE les
   * candidats `portfolioState: 'new'` (un compte déjà possédé n'a rien à
   * apprendre de lui-même — `resolve()` a déjà tranché son état), et apparie
   * sur le NAF **exact** — jamais un texte de secteur en clair. C'est la même
   * précision que `listSimilarCompaniesToExplore` (`accounts.service.ts`), qui
   * a remplacé un texte flou par le NAF précisément parce qu'un texte libre
   * fait remonter des entreprises hors secteur.
   *
   * Seul `kind: 'sector'` sort d'ici : `twin` (mission signée) et `tech` (pile
   * commune) restent le panneau « Similaires » d'`AccountsController` — les
   * réutiliser ici demanderait d'injecter `AccountMissionsService` et
   * `MarketMemoryService` dans un service de ce module, ce que GA-07
   * (`module-boundaries.spec.ts`, ratchet à zéro marge au 25/09/2026) ne laisse
   * pas passer sans relèvement délibéré.
   *
   * Plusieurs comptes du portefeuille peuvent partager le même NAF : le plus
   * RÉCENT gagne, même ordre que l'amorçage de `listSimilarCompaniesToExplore`.
   *
   * Ne jette jamais, même règle que `resolve()` : Découvrir est un écran
   * gratuit et en lecture seule.
   */
  async resolveSimilarityHeadlines(
    userId: string,
    candidates: ReadonlyArray<{ nafCode: string | null; portfolioState: DiscoverPortfolioState; name?: string }>,
  ): Promise<(SimilarityHeadline | undefined)[]> {
    if (candidates.length === 0) return []

    const nafCodes = [
      ...new Set(
        candidates
          .filter(candidate => candidate.portfolioState === 'new')
          .map(candidate => candidate.nafCode)
          .filter((code): code is string => Boolean(code)),
      ),
    ]
    if (nafCodes.length === 0) return candidates.map(() => undefined)

    try {
      const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
      const rows = await this.accounts
        .createQueryBuilder('account')
        .select(['account.company_name', 'account.naf_code', 'account.status', 'account.created_at'])
        .where('account.workspace_id = :workspaceId', { workspaceId })
        .andWhere('account.naf_code IN (:...nafCodes)', { nafCodes })
        .orderBy('account.created_at', 'DESC')
        .getMany()

      // Le PREMIER compte rencontré (le plus récent, grâce au tri ci-dessus)
      // gagne le libellé pour son NAF — un seul repère par secteur, jamais une
      // liste de comptes qui se disputent la même phrase. #3238 : un candidat
      // ne se recommande jamais lui-même — un compte du même NOM (le rapprochement
      // par SIREN a pu échouer) est sauté au profit du suivant.
      const referencesByNaf = new Map<string, string[]>()
      for (const row of rows) {
        if (row.status === DELETED_ACCOUNT_STATUS || !row.naf_code) continue
        referencesByNaf.set(row.naf_code, [...(referencesByNaf.get(row.naf_code) ?? []), row.company_name])
      }

      return candidates.map(candidate => {
        if (candidate.portfolioState !== 'new' || !candidate.nafCode) return undefined
        const own = candidate.name ? this.comparableName(candidate.name) : null
        const referenceAccount = (referencesByNaf.get(candidate.nafCode) ?? []).find(
          name => own === null || this.comparableName(name) !== own,
        )
        return referenceAccount ? { kind: 'sector' as const, referenceAccount } : undefined
      })
    } catch (error) {
      this.logger.error('Discover similarity headline resolution failed', { error, tags: { feature: 'discover' } })
      return candidates.map(() => undefined)
    }
  }

  /** `commercial_status` (cycle de vente) prime sur `status` (état d'analyse) :
   *  c'est le tri du commercial, et il n'est jamais écrasé automatiquement. */
  private stateOf(row: Pick<AccountEntity, 'status' | 'commercial_status'>): DiscoverPortfolioState {
    switch (row.commercial_status ?? 'inbox') {
      case 'customer':
        return 'customer'
      case 'watching':
      case 'opportunity':
        return 'watched'
      default:
        return 'analyzed'
    }
  }

  /** Nom comparable : sans la marque « (démo) », sans accents, casse et espaces repliés. */
  private comparableName(value: string): string {
    return value
      .replace(/\(démo\)/gi, '')
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()
  }

  private normalize(value: string | null | undefined): string {
    return value?.trim().toLowerCase() ?? ''
  }

  /**
   * #3819.1 — « besoins connus », SEULEMENT pour un compte déjà possédé.
   *
   * Extension de la même famille que `resolve()`/`resolveSimilarityHeadlines`
   * ci-dessus : APRÈS que `resolve()` a tranché `accountId` (jamais deviné),
   * compte les besoins OUVERTS (`NEED_OPEN_STATUSES`) de chaque compte, en UNE
   * requête GROUPÉE pour toute la page — jamais un appel par carte.
   *
   * `undefined` pour un candidat sans compte (rien à connaître) ET pour un
   * compte dont la requête a échoué — « non cherché », jamais un `0` deviné
   * (GA-18/19). `0` est le seul zéro légitime : un compte dont le décompte a
   * RÉUSSI et ne porte aucun besoin ouvert.
   */
  async resolveKnownNeeds(candidates: ReadonlyArray<{ accountId: string | null }>): Promise<(number | undefined)[]> {
    const counts = await this.resolveKnownNeedsCounts(candidates.map(candidate => candidate.accountId))
    if (counts === null) return candidates.map(() => undefined)
    return candidates.map(candidate => (candidate.accountId ? (counts.get(candidate.accountId) ?? 0) : undefined))
  }

  /**
   * #4068 (lot DECOUVRIR-CARTE, Louis 13/10) — LES besoins connus eux-mêmes,
   * pas seulement leur nombre : « 13 besoins connus » s'affichait sans qu'aucun
   * ne figure sur la carte, à côté d'un « 0 recrutement ». Mêmes deux lectures
   * que le décompte (besoins de staffing ouverts, besoins produits par
   * l'analyse), les trois plus récents par compte. Un besoin tiré de l'analyse
   * est daté par l'analyse qui l'a produit (`dateIsDetection`), jamais par une
   * date devinée. `undefined` = candidat neuf, ou lecture en panne.
   */
  async resolveKnownNeedFacts(
    candidates: ReadonlyArray<{ accountId: string | null }>,
  ): Promise<(DiscoverKnownNeed[] | undefined)[]> {
    const ids = [...new Set(candidates.map(c => c.accountId).filter((id): id is string => id !== null))]
    if (ids.length === 0) return candidates.map(() => undefined)
    let rows: Array<{ accountId: string; label: string | null; at: Date | string | null; isDetection: boolean }>
    try {
      rows =
        (await this.accounts.manager.query(
          `SELECT n.account_id AS "accountId", n.title AS label,
                  COALESCE(n.detected_at, n.created_at) AS at, false AS "isDetection"
             FROM project_needs n
            WHERE n.account_id = ANY($1::uuid[]) AND n.status = ANY($2::text[])
           UNION ALL
           SELECT a.id AS "accountId",
                  CASE WHEN jsonb_typeof(item) = 'string' THEN item #>> '{}'
                       ELSE COALESCE(item ->> 'pain', item ->> 'title', item ->> 'challenge', item ->> 'name') END AS label,
                  COALESCE(a.previous_analysis_at, a.created_at) AS at, true AS "isDetection"
             FROM accounts a
            CROSS JOIN LATERAL jsonb_array_elements(
                    (CASE WHEN jsonb_typeof(a.raw_analysis -> 'pains') = 'array' THEN a.raw_analysis -> 'pains' ELSE '[]'::jsonb END)
                 || (CASE WHEN jsonb_typeof(a.it_challenges) = 'array' THEN a.it_challenges ELSE '[]'::jsonb END)
                 || (CASE WHEN jsonb_typeof(a.raw_analysis -> 'program_names') = 'array' THEN a.raw_analysis -> 'program_names' ELSE '[]'::jsonb END)
                  ) AS item
            WHERE a.id = ANY($1::uuid[]) AND a.status <> $3`,
          [ids, [...NEED_OPEN_STATUSES], DELETED_ACCOUNT_STATUS],
        )) ?? []
    } catch (error) {
      this.logger.error('Discover known-need facts resolution failed', { error, tags: { feature: 'discover' } })
      return candidates.map(() => undefined)
    }
    const byAccount = new Map<string, DiscoverKnownNeed[]>()
    for (const row of rows) {
      const label = row.label?.trim()
      const date = row.at ? new Date(row.at).toISOString().slice(0, 10) : null
      if (!label || !date) continue
      const list = byAccount.get(row.accountId) ?? []
      list.push({ label, date, ...(row.isDetection ? { dateIsDetection: true } : {}) })
      byAccount.set(row.accountId, list)
    }
    return candidates.map(candidate => {
      if (!candidate.accountId) return undefined
      const list = byAccount.get(candidate.accountId) ?? []
      // Tri stable : à date égale, l'ordre de lecture (staffing puis analysis) tient.
      return [...list]
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
        .slice(0, DISCOVER_KNOWN_NEEDS_MAX)
    })
  }

  /** `null` = la requête a échoué (le compte reste à FAIRE, pas à zéro). */
  private async resolveKnownNeedsCounts(accountIds: ReadonlyArray<string | null>): Promise<Map<string, number> | null> {
    const ids = [...new Set(accountIds.filter((id): id is string => id !== null))]
    if (ids.length === 0) return new Map()
    try {
      const rows = await this.needs
        .createQueryBuilder('need')
        .select('need.account_id', 'accountId')
        .addSelect('COUNT(*)', 'count')
        .where('need.account_id IN (:...ids)', { ids })
        .andWhere('need.status IN (:...statuses)', { statuses: NEED_OPEN_STATUSES })
        .groupBy('need.account_id')
        .getRawMany<{ accountId: string; count: string }>()
      // #3819.1 (recette 11/10, BLOCKED) — `project_needs` ne porte que les demandes
      // de staffing d'un CLIENT : sur un compte seulement analysé, « N besoins
      // connus » restait invisible en production. Les besoins que l'ANALYSE a
      // produits (les mêmes sources EVIDENCÉES que l'écran Besoins : douleurs,
      // chantiers IT, programmes — jamais l'« implication », une déduction) s'y
      // ajoutent. Un échec de l'une des deux lectures = « non cherché » (null).
      const analysisRows = await this.accounts.manager.query<Array<{ accountId: string; count: string }>>(
        `SELECT a.id AS "accountId",
                (CASE WHEN jsonb_typeof(a.raw_analysis -> 'pains') = 'array'
                      THEN jsonb_array_length(a.raw_analysis -> 'pains') ELSE 0 END
               + CASE WHEN jsonb_typeof(a.it_challenges) = 'array'
                      THEN jsonb_array_length(a.it_challenges) ELSE 0 END
               + CASE WHEN jsonb_typeof(a.raw_analysis -> 'program_names') = 'array'
                      THEN jsonb_array_length(a.raw_analysis -> 'program_names') ELSE 0 END) AS count
           FROM accounts a
          WHERE a.id = ANY($1::uuid[])
            AND a.status <> $2`,
        [ids, DELETED_ACCOUNT_STATUS],
      )
      const counts = new Map<string, number>()
      for (const row of [...rows, ...(analysisRows ?? [])]) {
        const count = Number(row.count)
        if (count > 0) counts.set(row.accountId, (counts.get(row.accountId) ?? 0) + count)
      }
      return counts
    } catch (error) {
      this.logger.error('Discover known-needs resolution failed', { error, tags: { feature: 'discover' } })
      return null
    }
  }
}
