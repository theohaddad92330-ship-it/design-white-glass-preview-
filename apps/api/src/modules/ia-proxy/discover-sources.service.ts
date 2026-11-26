import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import {
  FINISHED_MISSION_STATUSES,
  SHARED_FACT_STALE_AFTER_DAYS,
  sharedCompanyKey,
  type DiscoverCommonBaseCandidate,
  type DiscoverSourceFacts,
} from '@bellum/contracts'
import { Repository } from 'typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import type { BusinessUnitScopeClause } from '../accounts/business-unit-scope.clause'
import { cityInDepartments } from '@bellum/contracts/geo-communes'
import { DISCOVER_NEED_RECENT_MONTHS, type DiscoverNeedFilters } from '@bellum/contracts'
import { commonBaseCandidatesQuery, placeCodes, placePatterns, termPatterns } from '../base-reader/base-reader.sql'
import { spacePastNeedCandidates } from './discover-space-past-needs'
import { SPACE_PAST_NEEDS_SOURCE, type SpacePastNeedsSource } from './space-past-needs-source'
import { BASE_MATCHES_SOURCE, discoverBaseCriteria, type BaseMatchesSource } from './base-matches-source'

/** Les faits que CE service lit — la mémoire marché passe par
 *  `DiscoverMarketMemoryService`, qui la lit déjà (GA-07 : pas de second import). */
type WorkspaceSourceFacts = Omit<DiscoverSourceFacts, 'marketMemory'> & {
  /** #4067.11 — personnes nommées, en poste et revues, que la base commune connaît chez la société ;
   *  le contrôleur les verse dans l'axe « observé sur le marché ». Absent = aucune, ou non lu. */
  sharedPeople?: number
}

type SourceCandidate = { siren: string; name: string; accountId: string | null }

/** Une affaire ouverte sans activité depuis plus longtemps que ça dort. */
const DORMANT_AFTER_DAYS = 90
const DAY_MS = 86_400_000
/** Un nom plus court ne se cherche pas dans un document : « SNC » ou « AXA »
 *  apparaîtraient au milieu de cent mots sans désigner le compte. */
const MIN_NAME_LENGTH_FOR_TEXT_MATCH = 4
const DELETED_ACCOUNT_STATUS = 'deleted'
/** Lot R — sur un filtre de département la requête sur-lit (le tri par lieu se fait en TypeScript), sous un plafond dur. */
const COMMON_BASE_DEPARTMENT_OVERFETCH = 20
const COMMON_BASE_DEPARTMENT_MAX_ROWS = 2000

/**
 * #4067 (décision Louis 12/10) — CE QUE L'ESPACE SAIT DÉJÀ d'un candidat
 * Découvrir, pour qu'il pèse dans le CLASSEMENT et pas seulement à l'affichage.
 *
 * Une requête PAR SOURCE pour toute la page, jamais une par carte (même patron
 * que `DiscoverPortfolioService`). Chaque lecture est FILTRÉE PAR L'ESPACE
 * (`workspaceId` en paramètre, résolu par le contrôleur) — sauf le référentiel
 * de comptes cibles, base PARTAGÉE du marché (GA-16), lue par SIREN exact.
 * Le corpus partagé `DRIVE_INTERNE` n'est jamais lu : il vit dans une autre
 * table (`dataforge_rag_chunks`) et ne nomme aucun espace.
 *
 * `null` = NON MESURÉ, jamais zéro (GA-18/GA-19) : candidat sans compte pour
 * une source qui ne se lit que par compte, rien de branché dans l'espace, ou
 * lecture en échec. Une source en panne ne fait jamais tomber les autres, ni
 * Découvrir.
 *
 * N'importe que des ENTITÉS (GA-07) : aucune dépendance de service à service — la lecture de la base
 * par critères passe par un PORT (`BASE_MATCHES_SOURCE`), branché par `ia-proxy.module.ts`.
 */
@Injectable()
export class DiscoverSourcesService {
  private readonly logger = new Logger(DiscoverSourcesService.name)

  constructor(
    @InjectRepository(AccountEntity) private readonly accounts: Repository<AccountEntity>,
    @InjectRepository(ContactEntity) private readonly contacts: Repository<ContactEntity>,
    /**
     * #4792 — le lecteur COMMUN de la base, par son port. `@Optional()` et en fin de liste : une
     * dizaine de suites construisent ce service positionnellement, et sans le port Découvrir garde
     * EXACTEMENT la coupe qu'il avait avant ce lot (aucun SIREN de plus protégé, aucun de moins).
     */
    @Optional() @Inject(BASE_MATCHES_SOURCE) private readonly baseMatches?: BaseMatchesSource,
    /** #5203 — les lignes PASSÉES de l'espace (lecteur unique) : source des besoins anciens propres à l'espace. */
    @Optional() @Inject(SPACE_PAST_NEEDS_SOURCE) private readonly signalLines?: SpacePastNeedsSource | null,
  ) {}

  async collect(
    workspaceId: string,
    candidates: ReadonlyArray<SourceCandidate>,
    now: Date = new Date(),
  ): Promise<WorkspaceSourceFacts[]> {
    if (candidates.length === 0) return []
    const accountIds = [...new Set(candidates.map(c => c.accountId).filter((id): id is string => id !== null))]
    const sirens = [...new Set(candidates.map(c => c.siren).filter(Boolean))]

    const [history, crm, dataforge, dataforgeNeeds, drive, missions, sharedPeople] = await Promise.all([
      this.safely('signal_history', () => this.readHistory(workspaceId, accountIds)),
      this.safely('crm', () => this.readCrm(workspaceId, candidates, accountIds, sirens, now)),
      this.safely('dataforge', () => this.readDataforge(sirens)),
      this.safely('dataforge_needs', () => this.readDataforgeNeeds(sirens)),
      this.safely('drive', () => this.readDrive(workspaceId, candidates)),
      this.safely('missions', () => this.readMissions(workspaceId, candidates, accountIds, now)),
      this.safely('shared_base', () => this.readSharedPeople(workspaceId, sirens)),
    ])

    return candidates.map((candidate, index) => ({
      signalHistory: history && candidate.accountId ? { signals: history.get(candidate.accountId) ?? [] } : null,
      crm: crm ? crm[index] : null,
      dataforge: this.referenceFacts(dataforge?.get(candidate.siren) ?? null, dataforgeNeeds?.get(candidate.siren)),
      drive: drive ? drive[index] : null,
      missions: missions ? missions[index] : null,
      ...((sharedPeople?.get(candidate.siren) ?? 0) > 0 ? { sharedPeople: sharedPeople?.get(candidate.siren) } : {}),
    }))
  }

  /**
   * #4067.11 (#4286.15.d, décision Louis 19/10/2026) — ce que la BASE COMMUNE sait de la société : le
   * NOMBRE de personnes nommées (origine Bellum), en poste (`employment_state = 'current'`) et revues
   * depuis le seuil (`SHARED_FACT_STALE_AFTER_DAYS`, #4286.15.b), par SIREN. Un compte, jamais un nom,
   * un poste ni un profil ; jamais l'espace qui les a trouvées (aucune colonne de portée). Le périmètre
   * suit l'espace : la salle de démonstration lit `demo`, le réel `live`.
   */
  private async readSharedPeople(workspaceId: string, sirens: string[]): Promise<Map<string, number>> {
    const bySiren = new Map<string, number>()
    const keys = sirens.map(siren => sharedCompanyKey({ siren })).filter((key): key is string => key !== null)
    if (keys.length === 0) return bySiren
    const rows = await this.accounts.manager.query<Array<{ company_key: string; people: number | string }>>(
      `SELECT p.company_key, COUNT(*)::int AS people
         FROM shared_company_people p
        WHERE p.scope = (SELECT CASE WHEN w.is_demo THEN 'demo' ELSE 'live' END FROM workspaces w WHERE w.id = $1)
          AND p.company_key = ANY($2::text[])
          AND p.origin = 'bellum'
          AND p.employment_state = 'current'
          AND p.last_seen_at >= now() - make_interval(days => $3)
        GROUP BY p.company_key`,
      [workspaceId, keys, SHARED_FACT_STALE_AFTER_DAYS],
    )
    for (const row of rows ?? []) {
      const people = Number(row?.people ?? 0)
      const siren = /^siren_(\d{9})$/.exec(row?.company_key ?? '')?.[1]
      if (siren && Number.isFinite(people) && people > 0) bySiren.set(siren, people)
    }
    return bySiren
  }

  /**
   * #4067 (reste) — les SIREN sur lesquels l'ESPACE détient un fait (historique de signaux ou affaires
   * CRM), en UNE requête. L'IA coupe la liste à `limit` sans connaître l'espace : cette liste lui dit
   * quels candidats ne pas couper avant que `collect` ne les pondère. Filtrée par l'espace ; bornée ;
   * en échec ou sans borne valide : `[]` (non mesuré — la coupe reste celle d'avant), jamais une erreur.
   */
  async spaceFactSirens(workspaceId: string, cap: number): Promise<string[]> {
    if (!Number.isInteger(cap) || cap <= 0) return []
    const rows = await this.safely('space_fact_sirens', () =>
      this.accounts.manager.query<Array<{ siren: string | null }>>(
        `SELECT f.siren
           FROM (
                 SELECT a.siren AS siren
                   FROM signal_history h
                   JOIN accounts a ON a.id = h.account_id
                  WHERE (h.workspace_id = $1 OR a.workspace_id = $1)
                    AND a.status <> $3 AND a.siren IS NOT NULL
                 UNION ALL
                 SELECT d.company_siren AS siren
                   FROM crm_deal_facts d
                  WHERE d.workspace_id = $1 AND d.company_siren IS NOT NULL
                 UNION ALL
                 SELECT a.siren AS siren
                   FROM crm_deal_facts d
                   JOIN accounts a ON a.id = d.account_id
                  WHERE d.workspace_id = $1 AND a.siren IS NOT NULL
                ) f
          GROUP BY f.siren
          ORDER BY COUNT(*) DESC, f.siren
          LIMIT $2`,
        [workspaceId, cap, DELETED_ACCOUNT_STATUS],
      ),
    )
    const sirens = new Set<string>()
    for (const row of rows ?? []) {
      const digits = String(row?.siren ?? '').replace(/\s/g, '')
      if (/^\d{9}$/.test(digits)) sirens.add(digits)
    }
    return [...sirens]
  }

  /**
   * #4792 (épopée #4791) — LES SIREN DES COMPTES QUE NOTRE BASE PORTE DÉJÀ SUR CES CRITÈRES.
   *
   * Le constat de l'épopée : Découvrir ne regardait QUE les appels live du moment, et coupait la liste
   * à `limit` sans savoir ce que la base contenait. `spaceFactSirens` (#4067) disait déjà « ne coupe
   * pas ces SIREN-là », mais seulement sur un historique de signaux ou une affaire CRM : un compte que
   * l'espace a analysé, qui porte un besoin Java à Lille et dont aucun signal n'a été historisé
   * restait coupable. Cette lecture-ci le protège aussi, par les CRITÈRES de la recherche.
   *
   * #4791.3 (Louis 31/10) — elle lit l'ESPACE (comptes analysés, besoins, signaux de l'espace) : elle reste donc
   * un critère de COUPE et de RANG, JAMAIS une source — rien de propre à un espace ne nourrit un autre espace.
   * Les CANDIDATS de la base, eux, viennent de la base COMMUNE seule : {@link commonBaseCandidates} (#4793.1,
   * revient sur « elle ne fabrique aucun candidat » de #4792).
   *
   * Best-effort comme ses voisines : sans le port, sur une lecture en échec ou sans critère de lieu ni
   * de métier, elle rend `[]` et la coupe reste CELLE D'AVANT — jamais un SIREN deviné, jamais une
   * panne de Découvrir.
   */
  async baseAccountSirens(
    workspaceId: string,
    businessUnitScope: BusinessUnitScopeClause,
    filters: Parameters<typeof discoverBaseCriteria>[0],
    cap: number,
  ): Promise<string[]> {
    const port = this.baseMatches
    if (!port || !workspaceId || !Number.isInteger(cap) || cap <= 0) return []
    const criteria = discoverBaseCriteria(filters, cap)
    // Aucun critère de métier NI de lieu : la lecture rendrait les comptes les plus récents de
    // l'espace, ce qui n'a rien à voir avec la recherche en cours. On ne protège alors personne.
    if (
      criteria.terms.length === 0 &&
      !criteria.city &&
      criteria.departments.length === 0 &&
      criteria.regions.length === 0
    ) {
      return []
    }
    const read = await this.safely('base_reader', () => port.read({ workspaceId, businessUnitScope }, criteria))
    const sirens = new Set<string>()
    for (const row of read?.accounts?.rows ?? []) {
      const digits = String(row?.siren ?? '').replace(/\s/g, '')
      if (/^\d{9}$/.test(digits)) sirens.add(digits)
    }
    return [...sirens]
  }

  /**
   * #4793.1 / #4791.1 / #4791.2 (Louis 31/10) — LES CANDIDATS DE LA BASE COMMUNE.
   *
   * Les comptes que la base COMMUNE (partagée entre espaces, GA-16 : un fait de marché) porte sur les critères —
   * métier ou compétence (besoins observés), secteur (NAF), lieu (siège ou lieu du besoin) — entrent dans Découvrir
   * COMME CANDIDATS, avec leur besoin le plus récent qui correspond, DATÉ (récent ou historique, aucune borne).
   *
   * ⚠️ CLOISONNEMENT (#4791.3) : la signature ne reçoit AUCUN espace et la requête n'en lit aucun. Le CRM, les
   * comptes suivis, les notes ou les contacts d'un espace ne peuvent donc PAS en sortir — ils restent un critère de
   * rang (`spaceFactSirens`, `baseAccountSirens`), lu avec l'espace de l'appelant seulement.
   *
   * Muette sans critère (jamais « toute la base ») ; best-effort : une lecture en échec rend `[]`.
   */
  async commonBaseCandidates(
    filters: (Parameters<typeof discoverBaseCriteria>[0] & { nafCode?: string } & DiscoverNeedFilters) | undefined,
    cap: number,
    now: Date = new Date(),
  ): Promise<DiscoverCommonBaseCandidate[]> {
    if (!Number.isInteger(cap) || cap <= 0) return []
    const criteria = discoverBaseCriteria(filters, cap)
    const terms = termPatterns(criteria)
    // Lot R (01/11) — la base ne porte que la VILLE (« Lille »), jamais « (59) » : un département (ou une région, déjà
    // convertie en départements) ne se rapproche plus en SQL (`%(59)%` ne trouvait rien : common_base=0) mais en
    // TypeScript par la table des communes. Les libellés libres (ville, nom de région) restent rapprochés en SQL.
    const departmentCodes = placeCodes({ city: null, departments: criteria.departments, regions: [] })
    const textPlaces = placePatterns({
      city: criteria.city,
      departments: criteria.departments.filter(d => !departmentCodes.includes(d.trim().toUpperCase())),
      regions: criteria.regions,
    })
    const byDepartment = departmentCodes.length > 0
    // Un filtre de département sans libellé libre : la requête ne pose aucun lieu et sur-lit, le tri se fait ici.
    const places = byDepartment ? [] : textPlaces
    const sqlCap = byDepartment
      ? Math.min(cap * COMMON_BASE_DEPARTMENT_OVERFETCH, COMMON_BASE_DEPARTMENT_MAX_ROWS)
      : cap
    const placeLabels = textPlaces.map(p =>
      p
        .replace(/^%|%$/g, '')
        .replace(/\\([\\%_])/g, '$1')
        .toLowerCase(),
    )
    const inPlace = (city: string | null): boolean => {
      if (!byDepartment) return true
      const text = String(city ?? '').trim()
      if (!text) return false
      if (placeLabels.some(label => text.toLowerCase().includes(label))) return true
      if (departmentCodes.some(code => text.toUpperCase().includes(`(${code})`))) return true
      return cityInDepartments(text, departmentCodes)
    }
    const nafs = [
      ...new Set(
        String(filters?.nafCode ?? '')
          .split(',')
          .map(code => code.replace(/[\s.]/g, '').toUpperCase())
          .filter(code => /^\d{4}[A-Z]$/.test(code)),
      ),
    ]
    if (terms.length === 0 && places.length === 0 && nafs.length === 0) return []
    // #5203 — « récent » = moins de 6 mois ; un filtre de période ou de nature RETIRE (Tous par défaut : aucune borne).
    const recentSince = new Date(now)
    recentSince.setUTCMonth(recentSince.getUTCMonth() - DISCOVER_NEED_RECENT_MONTHS)
    const query = commonBaseCandidatesQuery(terms, places, nafs, sqlCap, {
      period: filters?.needsPeriod ?? 'all',
      recentSince: recentSince.toISOString().slice(0, 10),
      natures: filters?.needsNature ?? [],
    })
    const rows = await this.safely('common_base', () =>
      this.accounts.manager.query<
        Array<{
          siren: string | null
          name: string | null
          city: string | null
          sector: string | null
          naf_code: string | null
          need_label: string | null
          need_date: string | null
          need_nature?: string | null
        }>
      >(query.sql, query.params),
    )
    const out: DiscoverCommonBaseCandidate[] = []
    const seen = new Set<string>()
    for (const row of rows ?? []) {
      const siren = String(row?.siren ?? '').replace(/\s/g, '')
      const name = String(row?.name ?? '').trim()
      if (!/^\d{9}$/.test(siren) || !name || seen.has(siren)) continue
      if (!inPlace(row?.city ?? null)) continue
      if (out.length >= cap) break
      seen.add(siren)
      const label = String(row?.need_label ?? '').trim()
      const date = String(row?.need_date ?? '').slice(0, 10)
      out.push({
        siren,
        name,
        city: row?.city ?? null,
        sector: row?.sector ?? null,
        nafCode: row?.naf_code ?? null,
        // #4791.2 — le besoin voyage DATÉ, ou pas du tout (une ligne sans date n'affiche aucun besoin).
        ...(label && /^\d{4}-\d{2}-\d{2}$/.test(date)
          ? {
              observedNeed: {
                label: label.slice(0, 160),
                date,
                ...(row?.need_nature === 'mission' ? { nature: 'mission' as const } : {}),
              },
            }
          : {}),
      })
    }
    return out
  }

  /**
   * #5203 (lot 782) — LES BESOINS PASSÉS DE L'ESPACE comme candidats : les comptes de l'espace actif (périmètre de
   * business unit inclus) dont une ligne passée — recrutement, mission, projet, besoin ancien — correspond aux
   * mots-clés / compétences, sans borne d'âge. Lus par le lecteur unique des lignes (`AccountSignalLinesService`),
   * cloisonné par espace ; JAMAIS un autre espace. Muette sans mot-clé ; best-effort : `[]` en échec. Bornée.
   */
  async spacePastNeedCandidates(
    workspaceId: string,
    businessUnitScope: BusinessUnitScopeClause,
    filters: (Parameters<typeof discoverBaseCriteria>[0] & DiscoverNeedFilters) | undefined,
    cap: number,
    now: Date = new Date(),
  ): Promise<DiscoverCommonBaseCandidate[]> {
    if (!this.signalLines || !workspaceId || !Number.isInteger(cap) || cap <= 0) return []
    const terms = discoverBaseCriteria(filters, cap).terms
    if (terms.length === 0) return []
    const accounts = await this.safely('space_past_needs', () =>
      this.signalLines!.pastNeedsForWorkspace({ workspaceId, businessUnitScope, now }),
    )
    return spacePastNeedCandidates({
      accounts: accounts ?? [],
      terms,
      period: filters?.needsPeriod,
      natures: filters?.needsNature,
      now,
      cap,
    })
  }

  /** Une source en échec = `null` pour toute la page, journalisée, jamais jetée. */
  private async safely<T>(source: string, read: () => Promise<T>): Promise<T | null> {
    try {
      return await read()
    } catch (error) {
      this.logger.warn(`Découvrir — source « ${source} » illisible (non-fatal, non mesurée)`, {
        error: error instanceof Error ? error.message : String(error),
        tags: { feature: 'discover', source },
      })
      return null
    }
  }

  /** #4067.1 — tout l'historique, actif ET résolu (on archive, on ne supprime
   *  pas) ; la décote par l'âge et la fenêtre récente sont tranchées par
   *  `computeDiscoverSourceAxes`, pas ici. */
  private async readHistory(
    workspaceId: string,
    accountIds: string[],
  ): Promise<Map<string, Array<{ type: string | null; date: string; changeCount: number }>>> {
    const byAccount = new Map<string, Array<{ type: string | null; date: string; changeCount: number }>>()
    if (accountIds.length === 0) return byAccount
    const rows = await this.accounts.manager.query<
      Array<{ account_id: string; signal_type: string | null; signal_date: string | Date | null; change_count: number }>
    >(
      `SELECT h.account_id, h.signal_type,
              COALESCE(h.signal_date, h.first_detected_at::text) AS signal_date,
              h.change_count
         FROM signal_history h
         JOIN accounts a ON a.id = h.account_id
        WHERE h.account_id = ANY($2::uuid[])
          AND (h.workspace_id = $1 OR a.workspace_id = $1)
          AND a.status <> $3`,
      [workspaceId, accountIds, DELETED_ACCOUNT_STATUS],
    )
    for (const row of rows ?? []) {
      if (!row?.signal_date) continue
      const date = row.signal_date instanceof Date ? row.signal_date.toISOString() : String(row.signal_date)
      byAccount.set(row.account_id, [
        ...(byAccount.get(row.account_id) ?? []),
        { type: row.signal_type ?? null, date, changeCount: Number(row.change_count) || 0 },
      ])
    }
    return byAccount
  }

  /** #4067.2 — affaires du CRM de l'espace (par compte rattaché OU par SIREN
   *  du fournisseur) et contacts connus du compte. Un candidat neuf n'est
   *  MESURÉ que si l'espace a un CRM qui a déjà rapporté des affaires. */
  private async readCrm(
    workspaceId: string,
    candidates: ReadonlyArray<SourceCandidate>,
    accountIds: string[],
    sirens: string[],
    now: Date,
  ): Promise<Array<DiscoverSourceFacts['crm']>> {
    const [presence, deals, contacts] = await Promise.all([
      this.accounts.manager.query<Array<{ crm_has_deals: boolean }>>(
        `SELECT EXISTS (SELECT 1 FROM crm_deal_facts x WHERE x.workspace_id = $1) AS crm_has_deals`,
        [workspaceId],
      ),
      this.accounts.manager.query<
        Array<{
          account_id: string | null
          company_siren: string | null
          is_closed: boolean
          is_won: boolean | null
          last_at: string | Date | null
        }>
      >(
        `SELECT account_id, company_siren, is_closed, is_won,
                COALESCE(last_activity_at, deal_created_at) AS last_at
           FROM crm_deal_facts
          WHERE workspace_id = $1
            AND (account_id = ANY($2::uuid[]) OR company_siren = ANY($3::text[]))`,
        [workspaceId, accountIds, sirens],
      ),
      // GA-405 — les contacts se lisent par `ContactEntity`, jamais par un SQL brut de plus.
      accountIds.length === 0
        ? Promise.resolve([] as Array<{ account_id: string; count: string }>)
        : this.contacts
            .createQueryBuilder('contact')
            .innerJoin(AccountEntity, 'account', 'account.id = contact.account_id')
            .select('contact.account_id', 'account_id')
            .addSelect('COUNT(*)', 'count')
            .where('contact.account_id IN (:...accountIds)', { accountIds })
            .andWhere('account.workspace_id = :workspaceId', { workspaceId })
            .andWhere('contact.deleted_at IS NULL')
            .groupBy('contact.account_id')
            .getRawMany<{ account_id: string; count: string }>(),
    ])
    const crmConnected = presence?.[0]?.crm_has_deals === true
    const contactsByAccount = new Map((contacts ?? []).map(row => [row.account_id, Number(row.count) || 0]))

    return candidates.map(candidate => {
      if (!candidate.accountId && !crmConnected) return null
      const mine = (deals ?? []).filter(
        deal =>
          (candidate.accountId !== null && deal.account_id === candidate.accountId) ||
          (deal.company_siren !== null && deal.company_siren === candidate.siren),
      )
      const facts = { won: 0, lost: 0, open: 0, dormant: 0 }
      let lastActivity: number | null = null
      for (const deal of mine) {
        const at = deal.last_at ? new Date(deal.last_at).getTime() : Number.NaN
        if (!Number.isNaN(at) && (lastActivity === null || at > lastActivity)) lastActivity = at
        if (deal.is_won === true) facts.won += 1
        else if (deal.is_closed && deal.is_won === false) facts.lost += 1
        else if (!deal.is_closed) {
          const idle = Number.isNaN(at) ? Number.POSITIVE_INFINITY : (now.getTime() - at) / DAY_MS
          if (idle > DORMANT_AFTER_DAYS) facts.dormant += 1
          else facts.open += 1
        }
      }
      return {
        ...facts,
        contacts: candidate.accountId ? (contactsByAccount.get(candidate.accountId) ?? 0) : 0,
        lastActivityAt: lastActivity === null ? null : new Date(lastActivity).toISOString(),
      }
    })
  }

  /** #4067.3 — le statut du compte dans le référentiel de comptes cibles,
   *  PARTAGÉ (GA-16), par SIREN EXACT (jamais un SIRET tronqué, jamais un nom). */
  private async readDataforge(sirens: string[]): Promise<Map<string, { status: string }>> {
    const bySiren = new Map<string, { status: string }>()
    if (sirens.length === 0) return bySiren
    const rows = await this.accounts.manager.query<Array<{ siren: string; statut_code: string }>>(
      `SELECT x.siren, x.statut_code FROM (
         SELECT regexp_replace(s.siren_siret, '[[:space:].-]', '', 'g') AS siren, s.statut_code
           FROM dataforge_account_statuses s
         UNION ALL
         SELECT d.siren, s.statut_code
           FROM dataforge_accounts d
           JOIN dataforge_account_statuses s ON s.source_id = d.source_id
          WHERE d.siren IS NOT NULL
       ) x
       WHERE x.siren = ANY($1::text[])`,
      [sirens],
    )
    for (const row of rows ?? []) {
      if (row?.siren && row.statut_code && !bySiren.has(row.siren)) bySiren.set(row.siren, { status: row.statut_code })
    }
    return bySiren
  }

  /** #4294.9 — le statut ET les besoins passés : un besoin observé suffit à mesurer l'axe ; sans
   *  besoin, la forme est exactement celle d'avant (`{ status }`). */
  private referenceFacts(
    status: { status: string } | null,
    needs: { total: number; won: number; latestAt: string | null } | undefined,
  ): DiscoverSourceFacts['dataforge'] {
    if (!needs || needs.total <= 0) return status
    return { status: status?.status ?? null, needs }
  }

  /** #4294.9 — les besoins PASSÉS observés dans la base commune (PARTAGÉE, GA-16 : un fait de marché,
   *  jamais filtré par l'espace), par SIREN EXACT. Le rattachement SIREN → fiche suit la règle de
   *  `DataforgeService.resolveBySiren` (#4281.4) DANS la requête : une seule fiche, ou le primaire
   *  unique d'une même grappe — sinon le SIREN ne lit aucun besoin, jamais une fiche choisie. */
  private async readDataforgeNeeds(
    sirens: string[],
  ): Promise<Map<string, { total: number; won: number; latestAt: string | null }>> {
    const bySiren = new Map<string, { total: number; won: number; latestAt: string | null }>()
    if (sirens.length === 0) return bySiren
    const rows = await this.accounts.manager.query<
      Array<{ siren: string; total: number | string; won: number | string; latest: string | null }>
    >(
      `WITH resolved AS (
         SELECT d.siren,
                CASE
                  WHEN COUNT(*) = 1 THEN MIN(d.source_id)
                  WHEN COUNT(DISTINCT d.cluster_id) = 1 AND bool_and(d.cluster_id IS NOT NULL)
                       AND COUNT(*) FILTER (WHERE d.is_cluster_primary) = 1
                    THEN MIN(d.source_id) FILTER (WHERE d.is_cluster_primary)
                END AS source_id
           FROM dataforge_accounts d
          WHERE d.siren = ANY($1::text[])
          GROUP BY d.siren
       )
       SELECT r.siren,
              COUNT(n.id)::int AS total,
              (COUNT(n.id) FILTER (WHERE n.status = 'GAGNE'))::int AS won,
              MAX(n.need_date)::text AS latest
         FROM resolved r
         JOIN dataforge_needs n ON n.account_source_id = r.source_id
        WHERE r.source_id IS NOT NULL
        GROUP BY r.siren`,
      [sirens],
    )
    for (const row of rows ?? []) {
      const total = Number(row?.total ?? 0)
      if (!row?.siren || !Number.isFinite(total) || total <= 0) continue
      bySiren.set(row.siren, { total, won: Number(row.won ?? 0) || 0, latestAt: row.latest ?? null })
    }
    return bySiren
  }

  /** #4067.4 — les documents VIVANTS de l'espace (portée espace ou compte,
   *  jamais un fil de conversation, jamais archivés) qui visent le compte ou
   *  nomment le candidat. Un espace sans aucun document : non mesuré. */
  private async readDrive(
    workspaceId: string,
    candidates: ReadonlyArray<SourceCandidate>,
  ): Promise<Array<DiscoverSourceFacts['drive']>> {
    const presence = await this.accounts.manager.query<Array<{ drive_has_documents: boolean }>>(
      `SELECT EXISTS (
         SELECT 1 FROM rag_documents x
          WHERE x.workspace_id = $1 AND x.archived_at IS NULL AND x.scope IN ('workspace', 'account')
       ) AS drive_has_documents`,
      [workspaceId],
    )
    if (presence?.[0]?.drive_has_documents !== true) return candidates.map(() => null)

    const patterns = candidates.map(candidate => textPattern(candidate.name))
    const rows = await this.accounts.manager.query<
      Array<{ idx: string | number; documents: string | number; latest: string | Date | null }>
    >(
      `SELECT c.idx, COUNT(d.id) AS documents, MAX(d.created_at) AS latest
         FROM unnest($2::text[], $3::uuid[]) WITH ORDINALITY AS c(pattern, account_id, idx)
         LEFT JOIN rag_documents d
           ON d.workspace_id = $1
          AND d.archived_at IS NULL
          AND d.scope IN ('workspace', 'account')
          AND ((c.account_id IS NOT NULL AND d.account_id = c.account_id)
            OR (c.pattern IS NOT NULL AND (d.title ILIKE c.pattern OR d.content ILIKE c.pattern)))
        GROUP BY c.idx`,
      [workspaceId, patterns, candidates.map(candidate => candidate.accountId)],
    )
    const byIndex = new Map((rows ?? []).map(row => [Number(row.idx), row]))
    return candidates.map((_, index) => {
      const row = byIndex.get(index + 1)
      const latest = row?.latest ? new Date(row.latest).toISOString() : null
      return { documents: Number(row?.documents ?? 0) || 0, latestAt: latest }
    })
  }

  /** #4067.4 — missions de l'espace sur le compte, consultants du vivier dont
   *  une expérience NOMME ce client (jamais un client masqué). Un espace sans
   *  mission ni vivier : non mesuré. */
  private async readMissions(
    workspaceId: string,
    candidates: ReadonlyArray<SourceCandidate>,
    accountIds: string[],
    now: Date,
  ): Promise<Array<DiscoverSourceFacts['missions']>> {
    const presence = await this.accounts.manager.query<Array<{ bench_has_rows: boolean }>>(
      `SELECT (EXISTS (SELECT 1 FROM missions x WHERE x.workspace_id = $1)
            OR EXISTS (SELECT 1 FROM consultant_experiences y WHERE y.workspace_id = $1)) AS bench_has_rows`,
      [workspaceId],
    )
    if (presence?.[0]?.bench_has_rows !== true) return candidates.map(() => null)

    const names = candidates.map(candidate => comparableName(candidate.name))
    const [missionRows, benchRows] = await Promise.all([
      accountIds.length === 0
        ? Promise.resolve([] as Array<MissionDateRow>)
        : this.accounts.manager.query<Array<MissionDateRow>>(
            // #4067.4 (R47) — fin des missions OUVERTES et fin des TERMINÉES lues à part : une
            // mission terminée dont la fin prévue est restée dans le futur ne doit pas dater « à venir ».
            `SELECT account_id, COUNT(*) AS count,
                    MAX(COALESCE(ends_on, started_on)) FILTER (WHERE NOT (status = ANY($3::text[])))::text AS latest_open,
                    MAX(COALESCE(ends_on, started_on)) FILTER (WHERE status = ANY($3::text[]))::text AS latest_finished
               FROM missions
              WHERE workspace_id = $1 AND account_id = ANY($2::uuid[])
              GROUP BY account_id`,
            [workspaceId, accountIds, [...FINISHED_MISSION_STATUSES]],
          ),
      this.accounts.manager.query<Array<{ idx: string | number; consultants: string | number }>>(
        `SELECT c.idx, COUNT(DISTINCT e.consultant_id) AS consultants
           FROM unnest($2::text[]) WITH ORDINALITY AS c(name, idx)
           JOIN consultant_experiences e
             ON e.workspace_id = $1
            AND e.client_masked = false
            AND c.name <> ''
            AND (LOWER(TRIM(e.entreprise)) = c.name OR LOWER(TRIM(e.client_final)) = c.name)
          GROUP BY c.idx`,
        [workspaceId, names],
      ),
    ])
    const missionsByAccount = new Map((missionRows ?? []).map(row => [row.account_id, row]))
    const benchByIndex = new Map((benchRows ?? []).map(row => [Number(row.idx), Number(row.consultants) || 0]))
    return candidates.map((candidate, index) => {
      const mission = candidate.accountId ? missionsByAccount.get(candidate.accountId) : undefined
      return {
        missions: Number(mission?.count ?? 0) || 0,
        consultants: benchByIndex.get(index + 1) ?? 0,
        latestAt: missionsLatestAt(mission, now),
      }
    })
  }
}

interface MissionDateRow {
  account_id: string
  count: string
  latest_open: string | Date | null
  latest_finished: string | Date | null
}

const isoOf = (value: string | Date): string => (value instanceof Date ? value.toISOString() : String(value))

/** #4067.4 (R47) — la date qui dit si le compte a une mission « en cours » ou « passée ».
 *  Une mission ouverte garde sa fin prévue ; une mission TERMINÉE ne date jamais d'après
 *  aujourd'hui, même si sa fin prévue est restée dans le futur (le statut terminé gagne). */
function missionsLatestAt(row: MissionDateRow | undefined, now: Date): string | null {
  const open = row?.latest_open ? isoOf(row.latest_open) : null
  const finished = row?.latest_finished ? isoOf(row.latest_finished) : null
  const finishedCapped =
    finished && Date.parse(finished) >= now.getTime() ? new Date(now.getTime() - 86_400_000).toISOString() : finished
  if (open && finishedCapped) return Date.parse(open) >= Date.parse(finishedCapped) ? open : finishedCapped
  return open ?? finishedCapped
}

/** Motif `ILIKE` d'un nom, jokers échappés ; `null` sous la longueur minimale. */
function textPattern(name: string): string | null {
  const trimmed = name.trim()
  if (trimmed.length < MIN_NAME_LENGTH_FOR_TEXT_MATCH) return null
  return `%${trimmed.replace(/[\\%_]/g, char => `\\${char}`)}%`
}

function comparableName(name: string): string {
  return name.trim().toLowerCase()
}
