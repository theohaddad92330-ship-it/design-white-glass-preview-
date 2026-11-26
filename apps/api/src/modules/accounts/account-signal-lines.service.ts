import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  CLOSED_STAGES,
  CRM_DEAL_SIGNAL_KINDS,
  historyAccountMatchesSearch,
  INTAKE_STAGES,
  mergeSignalLineCandidates,
  parseSearch,
  type AccountSignalLine,
  type AccountSignalLines,
  type SignalLineCandidate,
  type SignalLineOutcome,
  type WorkspaceSignalHistory,
  type HistoryContact,
  type WorkspaceSignalHistoryAccount,
} from '@bellum/contracts'
import { AccountEntity } from '../../database/entities/account.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import {
  analysisCandidates,
  isIdentityFact,
  isText,
  lineTypeOfKind,
  opaque,
  refineLineType,
  rows,
  text,
} from './account-signal-lines.sources'
import { type BusinessUnitScopeClause, businessUnitScopeClause } from './business-unit-scope.clause'
import type { MarketPersonPathsReader, MarketPersonPathView } from '../market-memory/market-person-path-view'
import { fold, grappeOf, sirenOf } from '../../common/dataforge-grappe'
import {
  type CommonAccountResolution,
  type CommonAccountsReader,
  resolveCommonKeys,
} from '../../common/common-account-links'
import { marketMatchKey } from '../market-memory/market-company-key'
import { readMarketV2Facts } from './account-signal-lines.market-v2'

/**
 * #4755 / #4756 / #4762 (lot 761, maquette Louis du 31/10/2026) — LE LECTEUR UNIQUE des lignes du tableau
 * « Signaux et besoins » d'un compte : les quatre familles, une ligne par fait daté, Actuel / Historique.
 *
 * Avant ce lot, l'écran lisait ses sources à sa façon, en treize blocs : les signaux CRM trois fois, les
 * recrutements cinq fois, `GET /projects?account_id` par quatre composants — et `it_job_signals`,
 * `public_tenders`, `awarded_contracts`, `legal_signals`, `historical_needs` n'étaient lus QUE par la Vue
 * d'ensemble. Ici, une lecture par famille, puis UNE fusion (`mergeSignalLineCandidates`, contrat partagé).
 *
 * Cloisonnement (`## Droits` du brief) : la PREMIÈRE requête lit le compte par `workspace_id = $1 AND id = $2` ;
 * absent ⇒ `null` et AUCUNE autre lecture. Ensuite CHAQUE requête porte `workspace_id = $1 AND account_id = $2`
 * — jamais un `where id` seul. La base commune (`dataforge_needs`) est un fait de marché PARTAGÉ (GA-16) : lue
 * par le SIREN du compte DÉJÀ lu dans l'espace, en SQL, sans le service du module interne (GA-37).
 *
 * La mémoire marché (`market_*`) ne fait AUCUNE ligne (hors pack v2.1, lot 794) : ses tables sont des agrégats par entreprise, sans date
 * d'observation — l'écran en montre l'encart agrégé (`GET /accounts/:id/market-context`), rien de plus.
 *
 * Aucune coupe : aucune requête n'a de `LIMIT` sur l'historique d'un compte (décision 3 du lot) ; l'écran pagine.
 *
 * Lot 764 — LE MÊME CŒUR sert l'Historique de TOUT l'espace (`forWorkspace`, page Signaux › Historique) : les
 * familles se lisent pour un ENSEMBLE de comptes (`account_id = ANY($2)`), en un nombre de requêtes qui ne dépend
 * pas du nombre de comptes — jamais une boucle de `forAccount`. Un compte (l'onglet) n'est qu'un ensemble à un
 * élément : deux écrans, une seule lecture (GA-26).
 * Une famille en panne est journalisée et absente (dans une liste, une absence ne fait aucune ligne) ; elle
 * n'efface pas les autres.
 *
 * Lot 793 — le RÉFÉRENTIEL PIVOT (`CommonAccountResolverService`, `common_account_links`) rattache chaque compte à ses
 * identifiants communs (BM-A du pack v2.1, fiches DF, groupe et filiales) par SIREN, domaine, puis nom/alias unique :
 * la base commune (besoins) et les parcours se lisent aussi par ces clés, pas seulement par le SIREN. Comme les
 * parcours, c'est une PORTE liée à l'espace par le contrôleur (`commonAccounts`) : une résolution pour tout l'ensemble,
 * un nombre de requêtes qui ne dépend pas du nombre de comptes ; sans porte, la lecture d'avant ce lot.
 *
 * Lot 794 — les mêmes BM-A ouvrent les familles du pack v2.1 (`market_v2_rows` : besoins, signaux, offres) comme lignes
 * datées (`account-signal-lines.market-v2.ts`) : la fiche compte (`forAccount`) et l'Historique (`forWorkspace`, recherche
 * comprise) les lisent par ce seul cœur.
 */

type AccountRow = {
  id: string
  company_name: string
  sector: string | null
  logo_url: string | null
  website: string | null
  headquarters?: string | null
  address?: string | null
  recent_signals: unknown
  raw_analysis: unknown
  siren: string | null
  group_head_siren: string | null
  signals_collected_at: Date | string | null
}

type Query = <R>(sql: string, params: unknown[]) => Promise<R[]>

/** Un fait brut et le compte auquel il appartient. */
type Owned = { accountId: string; candidate: SignalLineCandidate }

type Fiche = { source_id: string; name: string | null }

const NO_COMMON: CommonAccountResolution = { sets: new Map(), counts: { resolved: 0, ambiguous: 0, none: 0 } }

type NeedRow = {
  id: string
  title: string | null
  status: string
  need_date: string | null
  starts_on: string | null
  tjm_eur: number | null
  technologies: string[] | null
  prescriber_name: string | null
  prescriber_title: string | null
  location: string | null
}

const NEED_COLUMNS = `id, title, status, need_date, starts_on, tjm_eur, technologies, prescriber_name, prescriber_title, location`

/**
 * Les colonnes du compte que la lecture consomme. `raw_analysis` est PROJETÉ sur les seules clés que
 * `analysisCandidates` lit (le dossier entier pèse lourd, et l'espace en lit des dizaines d'un coup).
 */
const ACCOUNT_COLUMNS = `a.id, a.company_name, a.sector, a.logo_url, a.website, a.headquarters, a.address, a.recent_signals,
       jsonb_build_object(
         'recent_signals', a.raw_analysis->'recent_signals',
         'it_job_signals', a.raw_analysis->'it_job_signals',
         'public_tenders', a.raw_analysis->'public_tenders',
         'awarded_contracts', a.raw_analysis->'awarded_contracts',
         'legal_signals', a.raw_analysis->'legal_signals',
         'signal_layers', a.raw_analysis->'signal_layers',
         'signalLayers', a.raw_analysis->'signalLayers',
         'historical_needs', a.raw_analysis->'historical_needs'
       ) AS raw_analysis,
       a.siren, a.group_head_siren, a.signals_collected_at`

const PROJECT_NEED_OUTCOME: Readonly<Record<string, SignalLineOutcome>> = {
  won: 'won',
  staffed: 'won',
  lost: 'lost',
  cancelled: 'none',
}

const DATAFORGE_OUTCOME: Readonly<Record<string, SignalLineOutcome>> = {
  GAGNE: 'won',
  PERDU: 'lost',
  ABANDONNE: 'none',
}

const SHARED_NEED_PREFIX = 'shared-need:'

/**
 * Lot 776 — « tout ce qui rend identifiable on le montre pas » : le nom d'un prescripteur de la base commune ne sort
 * jamais. Il ne sert qu'à RETROUVER un contact du compte (même nom, accents et casse ignorés) : le rattachement sort
 * en `contact_ids`, le nom reste ici. Sans contact retrouvé, la ligne garde son rôle et son lieu, sans personne.
 */
function settleSharedNeedPeople<L extends AccountSignalLine>(
  lines: readonly L[],
  contacts: readonly { id: string; full_name: string }[],
): L[] {
  const byName = new Map(contacts.map(contact => [fold(contact.full_name), contact.id]))
  return lines.map(line => {
    if (!line.id.startsWith(SHARED_NEED_PREFIX) || line.people_hints.names.length === 0) return line
    const matched = line.people_hints.names
      .map(name => byName.get(fold(name)))
      .filter((id): id is string => typeof id === 'string')
    const contactIds = [...new Set([...(line.contact_ids ?? []), ...matched])]
    return {
      ...line,
      ...(contactIds.length > 0 ? { contact_ids: contactIds } : {}),
      people_hints: { ...line.people_hints, names: [] },
    }
  })
}

const WORK_STATUS_WORD: Readonly<Record<MarketPersonPathView['workStatus'], string>> = {
  freelance: 'freelance',
  esn: 'consultant en ESN',
  salarie: 'salarié',
  inconnu: 'profil',
}

/** « Un freelance Data Engineer » — le statut et le métier, jamais une personne. Valeur absente : rien d'inventé. */
function missionTitle(path: MarketPersonPathView): string {
  const word = WORK_STATUS_WORD[path.workStatus]
  const job = path.jobTitle ?? path.roleFamily
  return `Un ${word}${job ? ` ${job}` : ''}`
}

/** La date de la ligne : la FIN de la mission si connue, sinon son début — à la précision que la source porte. */
function missionDate(path: MarketPersonPathView): string | null {
  const date = path.endDate ?? path.startDate
  if (!date) return null
  if (path.datePrecision === 'year') return date.slice(0, 4)
  if (path.datePrecision === 'month') return date.slice(0, 7)
  return date
}

function missionDetail(path: MarketPersonPathView): string | null {
  const from = path.startDate?.slice(0, 4)
  const to = path.endDate?.slice(0, 4)
  const years = from && to ? (from === to ? from : `${from}-${to}`) : (from ?? to ?? null)
  const parts = [years, path.esnName ? `via ${path.esnName}` : null, path.missionCity ?? path.missionRegion].filter(
    (part): part is string => !!part,
  )
  return parts.length > 0 ? parts.join(' · ') : null
}

/** Lot 768 — plafond de contacts proposables par compte dans l'Historique (le reste se trouve dans l'onglet contacts). */
const CONTACTS_PER_ACCOUNT = 100

@Injectable()
export class AccountSignalLinesService {
  private readonly logger = new Logger(AccountSignalLinesService.name)

  constructor(
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
  ) {}

  private get query(): Query {
    return (sql, params) => this.accounts.manager.query(sql, params)
  }

  /** `null` = compte absent de l'espace (ou supprimé) : AUCUNE autre lecture n'est faite. */
  async forAccount(args: {
    workspaceId: string
    accountId: string
    now?: Date
    marketPaths?: MarketPersonPathsReader
    commonAccounts?: CommonAccountsReader
  }): Promise<AccountSignalLines | null> {
    const { workspaceId, accountId } = args
    const [account] = await this.query<AccountRow>(
      `SELECT ${ACCOUNT_COLUMNS}
         FROM accounts a
        WHERE a.workspace_id = $1 AND a.id = $2 AND a.status <> 'deleted'
        LIMIT 1`,
      [workspaceId, accountId],
    )
    if (!account) return null
    const found = (
      await this.linesOf(workspaceId, [account], args.now ?? new Date(), args.marketPaths, args.commonAccounts)
    ).get(account.id)!
    const { openDeals } = found
    const lines = settleSharedNeedPeople(found.lines, [])
    const verifiedAt = account.signals_collected_at ? new Date(account.signals_collected_at).toISOString() : null
    return { lines, verified_at: verifiedAt, open_deals: openDeals }
  }

  /**
   * Lot 764 — l'Historique de TOUS les comptes visibles du lecteur : les lignes `past` de chaque onglet, telles
   * quelles. Périmètre de business unit sur la lecture des comptes (la seule qui les NOMME) ; ensuite chaque
   * famille est refiltrée par l'espace ET l'ensemble des comptes lus. Un compte sans ligne passée n'en est pas.
   */
  async forWorkspace(args: {
    workspaceId: string
    businessUnitScope?: BusinessUnitScopeClause
    now?: Date
    marketPaths?: MarketPersonPathsReader
    commonAccounts?: CommonAccountsReader
    /** Lot 785 (#5213) — la PAGE : `limit` absent = tout l'historique, sans `page` (appelants internes). */
    limit?: number
    offset?: number
    /** Lot 785 — la recherche texte, faite ICI avec la règle de l'écran (`historyAccountMatchesSearch`). */
    search?: string
  }): Promise<WorkspaceSignalHistory> {
    const { workspaceId } = args
    const scope = args.businessUnitScope ?? null
    const clause = businessUnitScopeClause(scope, 'a.business_unit_id', 'SELECT unnest($2::uuid[])')
    const params: unknown[] = [workspaceId]
    if (clause?.includes('$2')) params.push(scope!.businessUnitIds)
    const accounts = await this.query<AccountRow>(
      `SELECT ${ACCOUNT_COLUMNS}
         FROM accounts a
        WHERE a.workspace_id = $1 AND a.status <> 'deleted'${clause ? ` AND ${clause}` : ''}
        ORDER BY a.company_name, a.id`,
      params,
    )
    const paged = args.limit !== undefined
    const offset = args.offset ?? 0
    const emptyPage = (total: number) => ({
      accounts: [],
      ...(paged ? { page: { total, offset, limit: args.limit! } } : {}),
    })
    if (accounts.length === 0) return emptyPage(0)
    const byAccount = await this.linesOf(
      workspaceId,
      accounts,
      args.now ?? new Date(),
      args.marketPaths,
      args.commonAccounts,
    )
    const search = args.search ? parseSearch(args.search) : null
    const out: WorkspaceSignalHistoryAccount[] = []
    const listed: AccountRow[] = []
    for (const account of accounts) {
      const past = byAccount
        .get(account.id)!
        .lines.filter((line): line is AccountSignalLine & { period: 'past' } => line.period === 'past')
      if (past.length === 0) continue
      const row: WorkspaceSignalHistoryAccount = {
        account_id: account.id,
        company_name: account.company_name,
        sector: text(account.sector),
        logo_url: text(account.logo_url),
        website: text(account.website),
        headquarters: text(account.headquarters),
        address: text(account.address),
        lines: past,
      }
      // Lot 785 — une recherche écarte un compte AVANT le découpage : le total dit ce qui correspond.
      if (search && !historyAccountMatchesSearch(row, search)) continue
      out.push(row)
      listed.push(account)
    }
    // Lot 785 — la page : seuls les comptes rendus gardent leurs lignes et leurs contacts (le poids vit là).
    const total = out.length
    const pageOut = paged ? out.slice(offset, offset + args.limit!) : out
    const pageListed = paged ? listed.slice(offset, offset + args.limit!) : listed
    if (pageOut.length === 0) return emptyPage(total)
    // Lot 768 — les personnes à contacter sur chaque besoin passé : UNE lecture pour tous les comptes de la page.
    const contacts = await this.contactsOf(
      workspaceId,
      pageListed.map(account => account.id),
    )
    return {
      accounts: pageOut.map(account => ({
        ...account,
        lines: settleSharedNeedPeople(account.lines, contacts.get(account.account_id) ?? []),
        contacts: contacts.get(account.account_id) ?? [],
      })),
      ...(paged ? { page: { total, offset, limit: args.limit! } } : {}),
    }
  }

  /**
   * #5203 (lot 782) — les lignes PASSÉES de chaque compte visible, SANS contacts ni coordonnées : de quoi apparier un
   * mot-clé à un besoin ancien de l'espace dans Découvrir. Même lecture que `forWorkspace` (espace + business unit,
   * mêmes familles, même fusion) : un seul lecteur (GA-26). Le SIREN sort, aucune personne.
   */
  async pastNeedsForWorkspace(args: {
    workspaceId: string
    businessUnitScope?: BusinessUnitScopeClause
    now?: Date
    marketPaths?: MarketPersonPathsReader
    commonAccounts?: CommonAccountsReader
  }): Promise<
    Array<{
      siren: string | null
      company_name: string
      headquarters: string | null
      sector: string | null
      lines: Array<Pick<AccountSignalLine, 'type' | 'title' | 'date'>>
    }>
  > {
    const { workspaceId } = args
    const scope = args.businessUnitScope ?? null
    const clause = businessUnitScopeClause(scope, 'a.business_unit_id', 'SELECT unnest($2::uuid[])')
    const params: unknown[] = [workspaceId]
    if (clause?.includes('$2')) params.push(scope!.businessUnitIds)
    const accounts = await this.query<AccountRow>(
      `SELECT ${ACCOUNT_COLUMNS}
         FROM accounts a
        WHERE a.workspace_id = $1 AND a.status <> 'deleted'${clause ? ` AND ${clause}` : ''}
        ORDER BY a.company_name, a.id`,
      params,
    )
    if (accounts.length === 0) return []
    const byAccount = await this.linesOf(
      workspaceId,
      accounts,
      args.now ?? new Date(),
      args.marketPaths,
      args.commonAccounts,
    )
    return accounts.flatMap(account => {
      const past = (byAccount.get(account.id)?.lines ?? []).filter(line => line.period === 'past')
      if (past.length === 0) return []
      return [
        {
          siren: text(account.siren),
          company_name: account.company_name,
          headquarters: text(account.headquarters),
          sector: text(account.sector),
          lines: past.map(line => ({ type: line.type, title: line.title, date: line.date })),
        },
      ]
    })
  }

  /**
   * Lot 768 — les contacts PROPOSABLES de l'ensemble de comptes listés, en UNE requête (jamais une par compte) :
   * le minimum que lit `proposeContactsForSignal` (nom, poste, lieu) et l'état de l'e-mail — jamais l'adresse.
   * Les comptes viennent de la lecture déjà cloisonnée (espace + business unit) ; la requête reporte l'espace.
   * Écartés, masqués et supprimés ne voyagent pas. Au plus {@link CONTACTS_PER_ACCOUNT} par compte, les mieux
   * classés d'abord. Une lecture en panne est journalisée : l'Historique reste, sans personnes (une absence).
   */
  private async contactsOf(workspaceId: string, accountIds: readonly string[]): Promise<Map<string, HistoryContact[]>> {
    const byAccount = new Map<string, HistoryContact[]>()
    if (accountIds.length === 0) return byAccount
    try {
      // ContactEntity (jamais un SQL brut de plus : GA-405) ; `raw_data` n'est lu que pour le lieu, projeté en SQL.
      const rowsRead: Array<{
        account_id: string
        id: string
        full_name: string
        title: string | null
        location: string | null
        email_verified: boolean | null
        country: string | null
        city: string | null
        organization: string | null
      }> = await this.accounts.manager
        .createQueryBuilder(ContactEntity, 'c')
        .select('c.account_id', 'account_id')
        .addSelect('c.id', 'id')
        .addSelect('c.full_name', 'full_name')
        .addSelect('c.title', 'title')
        .addSelect('c.location', 'location')
        .addSelect('c.email_verified', 'email_verified')
        .addSelect("c.raw_data->>'country'", 'country')
        .addSelect("c.raw_data->>'city'", 'city')
        .addSelect("c.raw_data->'apolloDetails'->>'organization'", 'organization')
        .where('c.workspace_id = :workspaceId', { workspaceId })
        .andWhere('c.account_id IN (:...accountIds)', { accountIds: [...accountIds] })
        .andWhere('c.deleted_at IS NULL')
        .andWhere('c.hidden = false')
        .andWhere('c.excluded_at IS NULL')
        .orderBy('c.priority', 'ASC', 'NULLS LAST')
        .addOrderBy('c.full_name', 'ASC')
        .addOrderBy('c.id', 'ASC')
        .getRawMany()
      for (const row of rowsRead) {
        const name = text(row.full_name)
        if (!name || (byAccount.get(row.account_id)?.length ?? 0) >= CONTACTS_PER_ACCOUNT) continue
        const place = { country: text(row.country), city: text(row.city), organization: text(row.organization) }
        const contact: HistoryContact = {
          id: row.id,
          full_name: name,
          title: text(row.title),
          location: text(row.location),
          place: place.country || place.city || place.organization ? place : null,
          email_verified: row.email_verified === true,
        }
        byAccount.set(row.account_id, [...(byAccount.get(row.account_id) ?? []), contact])
      }
    } catch (error) {
      this.logger.error('lecture des contacts de l’historique impossible', { error })
      return new Map()
    }
    return byAccount
  }

  /**
   * LE CŒUR : les familles d'un ENSEMBLE de comptes déjà lus dans l'espace, une requête par famille (jamais une
   * par compte), puis la fusion compte par compte. Chaque compte de `accounts` a son entrée, même vide.
   */
  private async linesOf(
    workspaceId: string,
    accounts: readonly AccountRow[],
    now: Date,
    marketPaths?: MarketPersonPathsReader,
    commonAccounts?: CommonAccountsReader,
  ): Promise<Map<string, { lines: AccountSignalLine[]; openDeals: number }>> {
    const q = this.query
    // Lot 793 — UNE résolution pivot pour tout l'ensemble, partagée par les besoins et les parcours (GA-26).
    const common = (
      commonAccounts ? commonAccounts(accounts.map(account => account.id)) : Promise.resolve(NO_COMMON)
    ).then(
      resolution => {
        if (resolution.counts.ambiguous > 0)
          this.logger.debug(`référentiel pivot : ${resolution.counts.ambiguous} compte(s) ambigu(s), rien rattaché`)
        return resolution
      },
      (error: unknown) => {
        this.logger.error('référentiel pivot illisible', { error })
        return NO_COMMON
      },
    )
    const read = async (family: string, run: () => Promise<Owned[]>) => {
      try {
        return await run()
      } catch (error) {
        this.logger.error(`lecture des lignes de signaux impossible (${family})`, { error })
        return []
      }
    }
    const ids = accounts.map(account => account.id)
    const base = [workspaceId, ids]
    const openDeals = new Map<string, number>()

    const families = await Promise.all([
      read('bellum-analysis', async () =>
        accounts.flatMap(account =>
          analysisCandidates(account.raw_analysis, account.recent_signals).map(candidate => ({
            accountId: account.id,
            candidate,
          })),
        ),
      ),
      read('bellum-history', async () =>
        (
          await q<{
            account_id: string
            id: string
            label: string
            signal_type: string | null
            signal_date: string | null
            first_detected_at: Date
          }>(
            `SELECT h.account_id, h.id, h.label, h.signal_type, h.signal_date, h.first_detected_at
               FROM signal_history h
               JOIN accounts a ON a.id = h.account_id
              WHERE a.workspace_id = $1 AND h.account_id = ANY($2::uuid[])
                AND (h.workspace_id = $1 OR h.workspace_id IS NULL)`,
            base,
          )
        ).map(row => ({
          accountId: row.account_id,
          candidate: {
            key: `history:${row.id}`,
            type: refineLineType(lineTypeOfKind(row.signal_type), row.label),
            // La date du FAIT d'abord ; à défaut, le jour où on l'a vu — une observation réelle, jamais devinée.
            rawDate: text(row.signal_date) ?? row.first_detected_at,
            title: row.label,
          },
        })),
      ),
      read('bellum-projects', async () => {
        const projects = await q<{
          account_id: string
          id: string
          label: string
          detail: string | null
          stage: string
          kind: string
          outcome: string | null
          closed_at: Date | null
          stage_entered_at: Date | null
          first_detected_at: Date | null
          management: string | null
        }>(
          `SELECT o.account_id, o.id, o.label, o.detail, o.stage, o.kind, o.outcome, o.closed_at, o.stage_entered_at,
                  o.first_detected_at, o.btmmp->>'management' AS management
             FROM opportunities o
            WHERE o.workspace_id = $1 AND o.account_id = ANY($2::uuid[]) AND o.archived_at IS NULL`,
          base,
        )
        const out: Owned[] = []
        for (const row of projects) {
          const closed =
            row.outcome === 'won' || row.outcome === 'lost' || (CLOSED_STAGES as readonly string[]).includes(row.stage)
          if ((INTAKE_STAGES as readonly string[]).includes(row.stage)) {
            // Un projet possible : la ligne datée qui l'a fait naître porte « Confirmer / Écarter ».
            // Lot 771 — un « projet possible » qui décrit l'identité ou les chiffres de l'entreprise est un FAIT :
            // il ne porte plus « Projet possible » (le décompte « à trancher » suit).
            const fact = isIdentityFact(row.label)
            // Lot 772 — la même règle unique de typage que les autres familles : « Viveris publie une offre CDI de … »
            // est une offre, pas un « projet possible » (elle ne porte plus « Confirmer / Écarter »).
            const type = fact ? 'fait' : refineLineType('projet', row.label)
            out.push({
              accountId: row.account_id,
              candidate: {
                key: `project:${row.id}`,
                type,
                origin: 'analyse',
                rawDate: row.first_detected_at,
                title: row.label,
                detail: row.detail,
                roles: [row.management],
                ...(type === 'projet' ? { leadId: row.id } : {}),
              },
            })
          } else if (closed) {
            const outcome: SignalLineOutcome =
              row.outcome === 'won' || row.stage === 'won'
                ? 'won'
                : row.outcome === 'lost' || row.stage === 'lost'
                  ? 'lost'
                  : 'none'
            out.push({
              accountId: row.account_id,
              candidate: {
                key: `project:${row.id}`,
                type: 'besoin_passe',
                rawDate: row.closed_at ?? row.stage_entered_at,
                title: row.label,
                detail: row.detail,
                outcome,
                roles: [row.management],
              },
            })
          } else if (row.kind !== 'signal') {
            // Une affaire en cours vit dans l'onglet Opportunités : elle est COMPTÉE, pas recopiée.
            openDeals.set(row.account_id, (openDeals.get(row.account_id) ?? 0) + 1)
          }
        }
        return out
      }),
      read('bellum-needs', async () =>
        (
          await q<{
            account_id: string
            id: string
            title: string
            status: string
            status_changed_at: Date | null
            detected_at: Date | null
            target_tjm_cents: string | null
            skills: unknown
            location: string | null
            contact_id: string | null
          }>(
            `SELECT n.account_id, n.id, n.title, n.status, n.status_changed_at, n.detected_at, n.target_tjm_cents,
                    n.skills, n.location, n.contact_id
               FROM project_needs n
              WHERE n.workspace_id = $1 AND n.account_id = ANY($2::uuid[])`,
            base,
          )
        ).map(row => {
          const outcome = PROJECT_NEED_OUTCOME[row.status]
          const cents = row.target_tjm_cents === null ? Number.NaN : Number(row.target_tjm_cents)
          return {
            accountId: row.account_id,
            candidate: {
              key: `need:${row.id}`,
              type: outcome ? ('besoin_passe' as const) : ('projet' as const),
              rawDate: outcome ? (row.status_changed_at ?? row.detected_at) : row.detected_at,
              title: row.title,
              ...(outcome ? { outcome } : {}),
              tjmEur: Number.isFinite(cents) && cents > 0 ? cents / 100 : null,
              technologies: rows(row.skills)
                .map(skill => text(skill['term']))
                .filter(isText),
              location: row.location,
              contactIds: [row.contact_id],
            },
          }
        }),
      ),
      read('crm-facts', async () =>
        (
          await q<{
            account_id: string
            provider: string
            deal_id: string
            name: string | null
            is_closed: boolean
            is_won: boolean | null
            closed_at: Date | null
            last_activity_at: Date | null
            deal_created_at: Date | null
          }>(
            `SELECT f.account_id, f.provider, f.deal_id, f.name, f.is_closed, f.is_won, f.closed_at, f.last_activity_at,
                    f.deal_created_at
               FROM crm_deal_facts f
              WHERE f.workspace_id = $1 AND f.account_id = ANY($2::uuid[])`,
            base,
          )
        ).map(row => ({
          accountId: row.account_id,
          candidate: {
            key: `crm-deal:${opaque(row.provider, row.deal_id)}`,
            type: 'affaire' as const,
            origin: 'crm' as const,
            rawDate: row.is_closed
              ? (row.closed_at ?? row.last_activity_at)
              : (row.last_activity_at ?? row.deal_created_at),
            title: row.name,
            ...(row.is_closed
              ? {
                  outcome: (row.is_won === true ? 'won' : row.is_won === false ? 'lost' : 'none') as SignalLineOutcome,
                }
              : {}),
          },
        })),
      ),
      read('crm-signals', async () =>
        (
          await q<{ account_id: string; id: string; kind: string; evidence: string | null; occurred_at: Date | null }>(
            // Résolus et échus COMPRIS : un signal CRM passé est de l'historique, pas un oubli.
            `SELECT DISTINCT ON (e.payload->>'accountId', e.kind, e.payload->>'subjectId')
                    e.payload->>'accountId' AS account_id, e.id, e.kind, e.payload->>'evidence' AS evidence,
                    e.occurred_at
               FROM canonical_trigger_events e
              WHERE e.workspace_id = $1 AND e.payload->>'accountId' = ANY($2::text[]) AND e.kind = ANY($3::text[])
              ORDER BY e.payload->>'accountId', e.kind, e.payload->>'subjectId', e.created_at DESC`,
            [...base, [...CRM_DEAL_SIGNAL_KINDS]],
          )
        ).map(row => ({
          accountId: row.account_id,
          candidate: {
            key: `crm-signal:${row.id}`,
            type: 'affaire' as const,
            origin: 'crm' as const,
            rawDate: row.occurred_at,
            title: row.evidence,
          },
        })),
      ),
      read('crm-mirror', async () =>
        (
          await q<{
            account_id: string
            provider: string
            external_id: string
            title: string | null
            status: string | null
            closed_at: Date | null
            crm_created_at: Date | null
            crm_url: string | null
          }>(
            // Dédoublonné contre `crm_deal_facts` (même fournisseur, même affaire) : une affaire = une ligne.
            `SELECT d.account_id, d.provider, d.external_id, d.title, d.status, d.closed_at, d.crm_created_at, d.crm_url
               FROM crm_deals d
              WHERE d.workspace_id = $1 AND d.account_id = ANY($2::uuid[]) AND d.archived_at IS NULL
                AND NOT EXISTS (
                  SELECT 1 FROM crm_deal_facts f
                   WHERE f.workspace_id = d.workspace_id AND f.provider = d.provider AND f.deal_id = d.external_id
                )`,
            base,
          )
        ).map(row => ({
          accountId: row.account_id,
          candidate: {
            key: `crm-mirror:${opaque(row.provider, row.external_id)}`,
            type: 'affaire' as const,
            origin: 'crm' as const,
            rawDate: row.closed_at ?? row.crm_created_at,
            title: row.title,
            url: row.crm_url,
            ...(row.status === 'won' || row.status === 'lost' ? { outcome: row.status as SignalLineOutcome } : {}),
          },
        })),
      ),
      read('shared-needs', async () => this.sharedNeeds(q, accounts, await common)),
      read('market-person-paths', async () => this.marketMissions(q, accounts, marketPaths, await common)),
      read('market-v2', async () => this.marketV2Lines(q, accounts, await common)),
    ])

    const nameOf = new Map(accounts.map(account => [account.id, account.company_name]))
    const candidatesOf = new Map<string, SignalLineCandidate[]>(ids.map(id => [id, []]))
    for (const owned of families.flat()) candidatesOf.get(owned.accountId)?.push(owned.candidate)
    return new Map(
      ids.map(id => [
        id,
        {
          lines: mergeSignalLineCandidates(candidatesOf.get(id)!, now, { companyName: nameOf.get(id) }),
          openDeals: openDeals.get(id) ?? 0,
        },
      ]),
    )
  }

  /**
   * La base commune, par SIREN seulement (jamais par nom : un nom rapproché serait un rattachement deviné), et
   * seulement quand le rattachement est UNIVOQUE — même règle que `dataforge_needs.py:resolve_source_id`.
   * Aucune donnée d'espace n'est lue ici ; ni le nom du référentiel ni le statut brut ne sortent. Deux requêtes
   * pour tout l'ensemble de comptes : les fiches de tous les SIREN, puis les besoins de toutes les fiches.
   */
  /**
   * Lot 773 / 775 — les FICHES de la grappe de chaque compte (par SIREN), UNE seule dérivation (GA-26) : la base
   * commune (besoins) et les parcours observés de la mémoire marché lisent la même grappe.
   */
  private async groupFiches(
    q: Query,
    accounts: readonly AccountRow[],
    common: CommonAccountResolution,
  ): Promise<Map<string, Fiche[]>> {
    const bySiren = await this.sirenFiches(q, accounts)
    // Lot 793 — les fiches DF que le référentiel pivot rattache au compte (BM-A ↔ DF, groupe), en plus du SIREN.
    const pivotOf = new Map<string, string[]>()
    for (const [accountId, set] of common.sets) {
      const ids = set.members.map(member => member.dataforgeSourceId).filter((id): id is string => !!id)
      if (ids.length > 0) pivotOf.set(accountId, ids)
    }
    const known = new Set([...bySiren.values()].flat().map(fiche => fiche.source_id))
    const missing = [...new Set([...pivotOf.values()].flat())].filter(id => !known.has(id))
    const extra = new Map<string, Fiche>()
    if (missing.length > 0) {
      const rows = await q<{ source_id: string; name: string | null; est_doublon: boolean }>(
        `SELECT d.source_id, d.name, COALESCE(s.est_doublon, false) AS est_doublon
           FROM dataforge_accounts d
           LEFT JOIN dataforge_account_statuses s ON s.source_id = d.source_id
          WHERE d.source_id = ANY($1::text[])`,
        [missing],
      )
      for (const row of rows)
        if (!row.est_doublon) extra.set(row.source_id, { source_id: row.source_id, name: row.name })
    }
    const out = new Map<string, Fiche[]>()
    for (const account of accounts) {
      const fiches = new Map<string, Fiche>((bySiren.get(account.id) ?? []).map(fiche => [fiche.source_id, fiche]))
      for (const id of pivotOf.get(account.id) ?? []) {
        const fiche = extra.get(id)
        if (fiche && !fiches.has(id)) fiches.set(id, fiche)
      }
      if (fiches.size > 0) out.set(account.id, [...fiches.values()])
    }
    return out
  }

  /** Lot 773 / 775 — les fiches de la grappe SIREN de chaque compte (la règle d'avant le référentiel pivot). */
  private async sirenFiches(q: Query, accounts: readonly AccountRow[]): Promise<Map<string, Fiche[]>> {
    const sirensOf = new Map<string, string[]>()
    for (const account of accounts) {
      const sirens = [account.siren, account.group_head_siren].map(sirenOf).filter((siren): siren is string => !!siren)
      if (sirens.length > 0) sirensOf.set(account.id, [...new Set(sirens)])
    }
    const allSirens = [...new Set([...sirensOf.values()].flat())]
    if (allSirens.length === 0) return new Map()
    const matches = await q<{
      siren: string
      source_id: string
      name: string | null
      group_name: string | null
      cluster_id: string | null
      est_doublon: boolean
    }>(
      // Lot 776 — la marque DOUBLON du référentiel (statuts) voyage avec la fiche, sans requête de plus.
      `SELECT d.siren, d.source_id, d.name, d.group_name, d.cluster_id, COALESCE(s.est_doublon, false) AS est_doublon
         FROM dataforge_accounts d
         LEFT JOIN dataforge_account_statuses s ON s.source_id = d.source_id
        WHERE d.siren = ANY($1::text[])
        ORDER BY d.siren, d.source_id`,
      [allSirens],
    )
    const matchesOf = new Map<string, typeof matches>()
    for (const row of matches) {
      const list = matchesOf.get(row.siren)
      if (list) list.push(row)
      else matchesOf.set(row.siren, [row])
    }
    // Lot 773 — un SIREN porté par PLUSIEURS fiches est un groupe (DF-0014 / DF-0415, 40 grappes, 85 comptes) : on lit
    // les besoins de TOUTES les fiches de la grappe — même cluster, ou à défaut le même groupe (nom normalisé) sur
    // toutes les fiches du SIREN. Groupes différents sur un même SIREN = vraie ambiguïté : rien, mais une trace.
    const resolvedOf = new Map<string, typeof matches>()
    for (const [siren, rowsOfSiren] of matchesOf) {
      const grappe = grappeOf(rowsOfSiren)
      if (grappe) resolvedOf.set(siren, grappe)
      else
        this.logger.warn(
          `base commune : rattachement ambigu, ${rowsOfSiren.length} fiches de groupes différents sur un même SIREN — rien rendu`,
        )
    }
    const out = new Map<string, Fiche[]>()
    for (const [accountId, sirens] of sirensOf) {
      const fiches = sirens.flatMap(siren => resolvedOf.get(siren) ?? []).filter(fiche => !fiche.est_doublon)
      if (fiches.length > 0)
        out.set(
          accountId,
          fiches.map(fiche => ({ source_id: fiche.source_id, name: fiche.name })),
        )
    }
    return out
  }

  /**
   * Lot 775 (Louis 02/11/2026) — LES MISSIONS OBSERVÉES sur le marché chez le compte et les entités de sa grappe.
   *
   * Un parcours de la mémoire marché (sans identité : pseudonyme, jamais lu ici) devient une ligne « Mission observée »,
   * source générique « Mémoire marché ». Aucun nom, aucun contact : les `people_hints` ne portent que le MÉTIER et le
   * LIEU de la mission — les contacts proposés suivent la règle existante, jamais la personne du parcours.
   * Une panne de la mémoire est une absence (dans une liste, une absence ne fait aucune ligne).
   */
  private async marketMissions(
    q: Query,
    accounts: readonly AccountRow[],
    marketPaths: MarketPersonPathsReader | undefined,
    common: CommonAccountResolution,
  ): Promise<Owned[]> {
    if (!marketPaths || accounts.length === 0) return []
    const fichesOf = await this.groupFiches(q, accounts, common).catch(() => new Map<string, Fiche[]>())
    const lookups: Array<{ ref: string; name: string; website?: string | null; commonKeys?: string[] }> = []
    const entityOfRef = new Map<string, { accountId: string; entity: string | null }>()
    for (const account of accounts) {
      const set = common.sets.get(account.id)
      const direct = new Set(set?.direct ?? [])
      const bmOf = (ids: Iterable<string>) =>
        (set?.members ?? []).filter(m => [...ids].includes(m.commonId) && m.bmAccountId).map(m => m.bmAccountId!)
      const own = bmOf(direct)
      lookups.push({
        ref: account.id,
        name: account.company_name,
        website: account.website,
        ...(own.length > 0 ? { commonKeys: own } : {}),
      })
      entityOfRef.set(account.id, { accountId: account.id, entity: null })
      // Les autres entités : fiches DF de la grappe, puis entreprises du groupe (BM-A) — une entrée par nom.
      const byName = new Map<string, { ref: string; name: string; commonKeys: string[] }>()
      const seen = new Set([fold(account.company_name)])
      for (const fiche of fichesOf.get(account.id) ?? []) {
        const name = fiche.name?.trim()
        if (!name || seen.has(fold(name))) continue
        seen.add(fold(name))
        byName.set(fold(name), { ref: `${account.id}::${fiche.source_id}`, name, commonKeys: [] })
      }
      for (const member of set?.members ?? []) {
        if (direct.has(member.commonId) || !member.bmAccountId) continue
        const name = member.name.trim()
        if (fold(name) === fold(account.company_name)) continue
        const entry = byName.get(fold(name)) ?? { ref: `${account.id}::${member.commonId}`, name, commonKeys: [] }
        entry.commonKeys.push(member.bmAccountId)
        byName.set(fold(name), entry)
      }
      for (const entry of byName.values()) {
        lookups.push({
          ref: entry.ref,
          name: entry.name,
          ...(entry.commonKeys.length > 0 ? { commonKeys: entry.commonKeys } : {}),
        })
        entityOfRef.set(entry.ref, { accountId: account.id, entity: entry.name })
      }
    }
    const read = await marketPaths(lookups)
    if (read.status !== 'ok') return []
    const out: Owned[] = []
    const seenPaths = new Set<string>()
    for (const [ref, paths] of read.paths) {
      const owner = entityOfRef.get(ref)
      if (!owner) continue
      for (const path of paths) {
        // Lot 793 — un parcours atteint par deux clés (nom ET BM-A) ne fait qu'une ligne par compte.
        if (seenPaths.has(`${owner.accountId}\u0000${path.id}`)) continue
        seenPaths.add(`${owner.accountId}\u0000${path.id}`)
        out.push({
          accountId: owner.accountId,
          candidate: {
            key: `market-path:${path.id}`,
            type: 'mission_observee' as const,
            origin: 'memoire' as const,
            ...(owner.entity ? { entity: owner.entity } : {}),
            rawDate: missionDate(path),
            title: missionTitle(path),
            detail: missionDetail(path),
            tjmEur: path.dailyRateEur,
            technologies: path.skills,
            // Le MÉTIER et le LIEU seulement — jamais une personne.
            names: [],
            roles: [path.jobTitle],
            location: path.missionCity ?? path.missionRegion,
          },
        })
      }
    }
    return out
  }

  /**
   * Lot 794 — les familles du pack v2.1 (besoins, signaux, offres) des BM-A que le référentiel pivot rattache au compte :
   * le compte lui-même ET les entreprises de son groupe (l'entité se nomme quand ce n'est pas le compte). UNE lecture
   * pour tout l'ensemble (`readMarketV2Facts`) ; sans BM-A résolu, aucune. Un fait atteint par deux BM-A d'un même
   * compte ne fait qu'une ligne.
   */
  private async marketV2Lines(
    q: Query,
    accounts: readonly AccountRow[],
    common: CommonAccountResolution,
  ): Promise<Owned[]> {
    const holders = new Map<string, Array<{ accountId: string; entity: string | null }>>()
    const nameOf = new Map(accounts.map(account => [account.id, account.company_name]))
    for (const [accountId, set] of common.sets) {
      if (!nameOf.has(accountId)) continue
      const direct = new Set(set.direct)
      for (const member of set.members) {
        if (!member.bmAccountId) continue
        const own = direct.has(member.commonId) || fold(member.name) === fold(nameOf.get(accountId) ?? '')
        holders.set(member.bmAccountId, [
          ...(holders.get(member.bmAccountId) ?? []),
          { accountId, entity: own ? null : member.name },
        ])
      }
    }
    if (holders.size === 0) return []
    const out: Owned[] = []
    const seen = new Set<string>()
    for (const fact of await readMarketV2Facts(q, [...holders.keys()])) {
      for (const holder of holders.get(fact.bmAccountId) ?? []) {
        const key = `${holder.accountId}\u0000${fact.candidate.key}`
        if (seen.has(key)) continue
        seen.add(key)
        const entity = holder.entity ?? fact.candidate.entity ?? null
        out.push({ accountId: holder.accountId, candidate: { ...fact.candidate, entity } })
      }
    }
    return out
  }

  private async sharedNeeds(
    q: Query,
    accounts: readonly AccountRow[],
    common: CommonAccountResolution,
  ): Promise<Owned[]> {
    const fichesOf = await this.groupFiches(q, accounts, common)
    const sourcesOf = new Map<string, string[]>()
    const entityOf = new Map<string, string | null>()
    for (const [accountId, fiches] of fichesOf) {
      for (const fiche of fiches) entityOf.set(fiche.source_id, fiche.name)
      const sources = [...new Set(fiches.map(fiche => fiche.source_id).filter(isText))]
      if (sources.length > 0) sourcesOf.set(accountId, sources)
    }
    const nameOfAccount = new Map(accounts.map(account => [account.id, account.company_name]))
    const candidate = (accountId: string, row: NeedRow, entity: string | null | undefined): Owned => {
      const outcome = DATAFORGE_OUTCOME[row.status]
      const differs = !!entity && fold(entity) !== fold(nameOfAccount.get(accountId) ?? '')
      return {
        accountId,
        candidate: {
          key: `shared-need:${row.id}`,
          type: 'besoin_passe' as const,
          origin: 'memoire' as const,
          ...(differs ? { entity } : {}),
          // Pack ORION 24 : la date du besoin manque souvent, le début de mission est une date RÉELLE du même besoin.
          rawDate: row.need_date ?? row.starts_on,
          title: row.title,
          ...(outcome ? { outcome } : {}),
          tjmEur: row.tjm_eur,
          technologies: row.technologies ?? [],
          names: [row.prescriber_name],
          roles: [row.prescriber_title],
          location: row.location,
        },
      }
    }
    const out: Owned[] = []
    const allSources = [...new Set([...sourcesOf.values()].flat())]
    if (allSources.length > 0) {
      const needs = await q<NeedRow & { account_source_id: string }>(
        `SELECT account_source_id, ${NEED_COLUMNS}
           FROM dataforge_needs
          WHERE account_source_id = ANY($1::text[])`,
        [allSources],
      )
      const needsOf = new Map<string, typeof needs>()
      for (const row of needs) {
        const list = needsOf.get(row.account_source_id)
        if (list) list.push(row)
        else needsOf.set(row.account_source_id, [row])
      }
      for (const [accountId, sources] of sourcesOf) {
        for (const row of sources.flatMap(source => needsOf.get(source) ?? []))
          out.push(candidate(accountId, row, entityOf.get(row.account_source_id)))
      }
    }
    out.push(...(await this.unlinkedNeeds(q, common, candidate)))
    return out
  }

  /**
   * Lot 793 — les besoins de la base commune SANS fiche (`account_source_id` vide, 370 en prod) : leur entreprise
   * passe par le MÊME référentiel pivot (nom normalisé UNIQUE, jamais flou) ; résolue vers une entreprise commune de
   * l'ensemble d'un compte, la ligne lui revient, avec l'entité quand ce n'est pas le compte lui-même.
   */
  private async unlinkedNeeds(
    q: Query,
    common: CommonAccountResolution,
    candidate: (accountId: string, row: NeedRow, entity: string | null) => Owned,
  ): Promise<Owned[]> {
    const holders = new Map<string, Array<{ accountId: string; name: string }>>()
    for (const [accountId, set] of common.sets)
      for (const member of set.members)
        holders.set(member.commonId, [...(holders.get(member.commonId) ?? []), { accountId, name: member.name }])
    if (holders.size === 0) return []
    const needs = await q<NeedRow & { entreprise: string }>(
      `SELECT entreprise, ${NEED_COLUMNS}
         FROM dataforge_needs
        WHERE account_source_id IS NULL AND entreprise IS NOT NULL`,
      [],
    )
    const keyOf = (row: { entreprise: string }) => marketMatchKey(row.entreprise)
    const resolved = await resolveCommonKeys(q, needs.map(keyOf))
    const out: Owned[] = []
    for (const row of needs) {
      const owners = new Map<string, string>()
      for (const commonId of resolved.get(keyOf(row)) ?? [])
        for (const holder of holders.get(commonId) ?? [])
          if (!owners.has(holder.accountId)) owners.set(holder.accountId, holder.name)
      for (const [accountId, name] of owners) out.push(candidate(accountId, row, name))
    }
    return out
  }
}
