import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, IsNull, Not, Repository } from 'typeorm'
import {
  SIGNAL_RECURRENCE_WINDOW_DAYS,
  knownPersonKey,
  signalRecurrenceOf,
  weighAccountFacts,
  type AccountFact,
  type AccountFacts,
  type KnownPeople,
  type MarketMemoryRead,
  type SignalRecurrence,
} from '@bellum/contracts'
import { AccountEntity } from '../../database/entities/account.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import {
  crmDealFacts,
  projectDealFacts,
  currentSignalFacts,
  documentFacts,
  exchangeFacts,
  dormantDealFacts,
  feedbackFacts,
  marketObservationFacts,
  missionFacts,
  renewalDueFacts,
  needFacts,
  noteFacts,
  signalHistoryFacts,
  careerFacts,
} from './account-facts.sources'
import {
  ACCOUNT_FACTS_MARKET_MANY_READER,
  ACCOUNT_FACTS_MARKET_READER,
  type AccountFactsMarketManyReader,
  type AccountFactsMarketReader,
} from './module-tokens'

type RawFact = Omit<AccountFact, 'weight' | 'ageDays'>
type SignalHistoryRow = Parameters<typeof signalHistoryFacts>[0][number]
type AccountRow = {
  company_name: string | null
  website: string | null
  registry_country: string | null
  recent_signals: unknown
}

/** Par famille : assez pour qu'une récurrence se voie, pas assez pour noyer le contexte. */
const PER_FAMILY = 200

/**
 * #4069.1 — LE lecteur unique des faits du compte.
 *
 * Constat (#4068) : chaque consommateur lisait ses sources à sa façon —
 * `signal_history` à 48 h / 7 j, le CRM ouvert seulement, les affaires closes
 * affichées mais jamais lues par un traitement. Ce service rend, pour UN
 * compte, TOUT ce que l'espace sait de lui, daté, typé, pesé
 * (`weighAccountFacts`, #4069.2) — et jamais d'où ça vient.
 *
 * Il REJOUE les lectures existantes, bornées à ce compte, sans en importer
 * les services (GA-07 au plafond, même patron que `CrmAccountSignalsService`) :
 *  A `signal_history` (tout âge, actifs ET résolus — `SignalHistoryService`)
 *    + les signaux COURANTS du dossier (`accounts.recent_signals`) ;
 *  B `crm_deal_facts` clos (gagné/perdu) + `canonical_trigger_events`
 *    `affaire_dormante` (`CrmAccountSignalsService`) ;
 *  D mémoire marché, par JETON (`MarketMemoryService.coverageFor`) ;
 *  E `rag_documents` : rattachés au compte, d'équipe qui le nomment, et les
 *    PERSONNELS du seul demandeur (`_visibility_filter` côté IA) ;
 *  F `missions` ;
 *  H `activities` en MÉTADONNÉES (date, destinataire, sujet — jamais le corps) ;
 *  G besoins enregistrés, notes et comptes rendus (`NotesService.list`),
 *    corrections du dossier (`account_feedback`).
 * C (DataForge) : tranché sans Louis — sa ligne ne porte que des scores et des
 * RECOMMANDATIONS, aucun fait daté du compte ; une recommandation n'est pas un
 * fait, rien n'en est tiré ici (voir le rapport #4069).
 *
 * Cloisonnement : CHAQUE requête porte `workspace_id = $1` ET le compte en
 * `$2` — jamais un `where id` seul, même après la vérification d'appartenance.
 * Une famille en panne est journalisée et absente de la liste (dans une
 * liste, une absence ne fait aucune ligne) ; elle n'efface pas les autres.
 */
@Injectable()
export class AccountFactsService {
  private readonly logger = new Logger(AccountFactsService.name)

  constructor(
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
    @Optional()
    @Inject(ACCOUNT_FACTS_MARKET_READER)
    private readonly marketReader?: AccountFactsMarketReader,
    @Optional()
    @Inject(ACCOUNT_FACTS_MARKET_MANY_READER)
    private readonly marketManyReader?: AccountFactsMarketManyReader,
  ) {}

  /**
   * #4072.5 — les faits de plusieurs comptes (liste de cibles). La mémoire marché — la seule
   * famille qui lisait trois tables PAR compte — est lue UNE fois pour tous (un `IN` par
   * table) ; les autres familles restent celles de `forAccount`. Un compte absent de
   * l'espace n'a pas de clé (une absence ne fait aucune ligne).
   */
  async forAccounts(args: {
    workspaceId: string
    userId: string
    accountIds: readonly string[]
  }): Promise<Map<string, AccountFacts>> {
    const out = new Map<string, AccountFacts>()
    const ids = [...new Set(args.accountIds)]
    if (ids.length === 0) return out
    let market: Map<string, MarketMemoryRead> | undefined
    if (this.marketManyReader) {
      try {
        const rows = await this.accounts.manager.query<(AccountRow & { id: string })[]>(
          `SELECT a.id, a.company_name, a.website, a.registry_country
             FROM accounts a
            WHERE a.workspace_id = $1 AND a.id = ANY($2) AND a.status <> 'deleted'`,
          [args.workspaceId, ids],
        )
        const lookups = rows
          .filter(row => (row.company_name ?? '').trim() !== '')
          .map(row => ({
            ref: row.id,
            name: (row.company_name ?? '').trim(),
            website: row.website,
            country: row.registry_country,
          }))
        market = await this.marketManyReader(lookups)
      } catch (error) {
        this.logger.error('lecture groupée de la mémoire marché impossible (D)', { error })
      }
    }
    await Promise.all(
      ids.map(async accountId => {
        try {
          const facts = await this.forAccount({ ...args, accountId, ...(market ? { marketRead: market } : {}) })
          if (facts) out.set(accountId, facts)
        } catch (error) {
          this.logger.warn('faits du compte illisibles', { error })
        }
      }),
    )
    return out
  }

  /** `null` = compte absent de l'espace (ou supprimé) : rien n'est lu. */
  async forAccount(args: {
    workspaceId: string
    userId: string
    accountId: string
    asOf?: Date
    /** #4072.5 — mémoire marché DÉJÀ lue en groupe (clé : compte) ; absente ⇒ lecture unitaire. */
    marketRead?: ReadonlyMap<string, MarketMemoryRead>
  }): Promise<AccountFacts | null> {
    const { workspaceId, userId, accountId } = args
    const asOf = args.asOf ?? new Date()
    const q = this.accounts.manager
    const [account] = await q.query<AccountRow[]>(
      `SELECT a.company_name, a.website, a.registry_country, a.recent_signals
         FROM accounts a
        WHERE a.workspace_id = $1 AND a.id = $2 AND a.status <> 'deleted'
        LIMIT 1`,
      [workspaceId, accountId],
    )
    if (!account) return null
    const companyLike = titlePattern(account.company_name)

    const read = async <R>(family: string, sql: string, params: unknown[], map: (rows: R[]) => RawFact[]) => {
      try {
        return map(await q.query<R[]>(sql, params))
      } catch (error) {
        this.logger.error(`lecture des faits du compte impossible (${family})`, { error })
        return []
      }
    }
    const base = [workspaceId, accountId]

    const families = await Promise.all([
      read(
        'A',
        `SELECT h.label, h.signal_type, h.signal_date, h.first_detected_at
           FROM signal_history h
           JOIN accounts a ON a.id = h.account_id
          WHERE a.workspace_id = $1 AND h.account_id = $2
            AND (h.workspace_id = $1 OR h.workspace_id IS NULL)
          ORDER BY h.first_detected_at DESC
          LIMIT ${PER_FAMILY}`,
        base,
        signalHistoryFacts,
      ),
      read(
        'B',
        `SELECT f.name, f.is_won, f.closed_at, f.last_activity_at
           FROM crm_deal_facts f
          WHERE f.workspace_id = $1 AND f.account_id = $2 AND f.is_closed
          ORDER BY f.closed_at DESC NULLS LAST
          LIMIT ${PER_FAMILY}`,
        base,
        crmDealFacts,
      ),
      read(
        'B-projects',
        `SELECT o.label, o.outcome, o.closed_at, o.stage_entered_at
           FROM opportunities o
          WHERE o.workspace_id = $1 AND o.account_id = $2 AND o.outcome IN ('won', 'lost')
          ORDER BY o.closed_at DESC NULLS LAST
          LIMIT ${PER_FAMILY}`,
        base,
        projectDealFacts,
      ),
      read(
        'B-dormant',
        `SELECT DISTINCT ON (e.payload->>'subjectId') e.payload->>'evidence' AS evidence, e.occurred_at
           FROM canonical_trigger_events e
          WHERE e.workspace_id = $1 AND e.payload->>'accountId' = $2::text AND e.kind = 'affaire_dormante'
          ORDER BY e.payload->>'subjectId', e.created_at DESC
          LIMIT ${PER_FAMILY}`,
        base,
        dormantDealFacts,
      ),
      read(
        'E',
        `SELECT d.title, d.created_at
           FROM rag_documents d
          WHERE (d.workspace_id = $1 OR (d.workspace_id IS NULL AND d.user_id = $3))
            AND d.archived_at IS NULL
            AND d.origin <> 'distilled'
            AND (
                  (d.scope = 'account' AND d.account_id = $2)
               OR (d.scope IN ('workspace', 'knowledge_base') AND d.title ILIKE $4)
               OR (d.scope = 'personal' AND d.user_id = $3 AND d.title ILIKE $4)
            )
          ORDER BY d.created_at DESC
          LIMIT ${PER_FAMILY}`,
        [...base, userId, companyLike],
        documentFacts,
      ),
      read(
        'F',
        `SELECT m.label, m.started_on, m.created_at
           FROM missions m
          WHERE m.workspace_id = $1 AND m.account_id = $2
          ORDER BY m.created_at DESC
          LIMIT ${PER_FAMILY}`,
        base,
        missionFacts,
      ),
      read(
        'F-renewal',
        `SELECT m.label, m.status, m.ends_on
           FROM missions m
          WHERE m.workspace_id = $1 AND m.account_id = $2 AND m.ends_on IS NOT NULL
          ORDER BY m.ends_on ASC
          LIMIT ${PER_FAMILY}`,
        base,
        (rows: Array<{ label: string | null; status: string | null; ends_on: Date | string | null }>) =>
          renewalDueFacts(rows, asOf),
      ),
      read(
        'G-needs',
        `SELECT n.title, n.created_at
           FROM project_needs n
          WHERE n.workspace_id = $1 AND n.account_id = $2
          ORDER BY n.created_at DESC
          LIMIT ${PER_FAMILY}`,
        base,
        needFacts,
      ),
      read(
        'G-notes',
        `SELECT n.body, n.created_at, (n.meeting_recap_snapshot IS NOT NULL) AS is_meeting
           FROM notes n
          WHERE n.workspace_id = $1 AND n.entity_type = 'account'
            AND (n.entity_id = $2 OR $2 = ANY(n.also_applies_to_account_ids))
          ORDER BY n.created_at DESC
          LIMIT ${PER_FAMILY}`,
        base,
        noteFacts,
      ),
      // H — #4072.2/.3 : les échanges en MÉTADONNÉES (voir `exchangeFamily`).
      this.exchangeFamily(workspaceId, accountId),
      read(
        'G-corrections',
        `SELECT f.target_ref, f.verdict, f.note, f.created_at
           FROM account_feedback f
          WHERE f.workspace_id = $1 AND f.account_id = $2
          ORDER BY f.created_at DESC
          LIMIT ${PER_FAMILY}`,
        base,
        feedbackFacts,
      ),
      this.marketFacts(accountId, account, args.marketRead),
      // #4284.19 — les parcours des personnes chez ce compte (l'historique ancien que les signaux ne portent pas).
      this.careerFamily(workspaceId, accountId, account.company_name),
    ])
    families.push(currentSignalFacts(account.recent_signals))

    return { asOf: asOf.toISOString(), facts: weighAccountFacts(families.flat(), asOf) }
  }

  /**
   * #4072.4 — la récurrence d'un signal pour TOUTES les cibles d'une liste, en DEUX requêtes (l'histoire
   * `signal_history`, les signaux courants `accounts.recent_signals`), jamais une par compte. Même
   * cloisonnement (`workspace_id = $1`), mêmes natures et même fenêtre que la cloche
   * (`signalRecurrenceOf`). Un compte sans récurrence n'a PAS de clé ; une lecture en panne rend {}.
   */
  async recurrenceForAccounts(args: {
    workspaceId: string
    accountIds: readonly string[]
    asOf?: Date
  }): Promise<Record<string, SignalRecurrence>> {
    const ids = [...new Set(args.accountIds)]
    if (ids.length === 0) return {}
    const asOf = args.asOf ?? new Date()
    const q = this.accounts.manager
    const byAccount = new Map<string, RawFact[]>()
    const push = (accountId: string, facts: RawFact[]) =>
      byAccount.set(accountId, [...(byAccount.get(accountId) ?? []), ...facts])
    try {
      const history = await q.query<Array<{ account_id: string } & SignalHistoryRow>>(
        `SELECT h.account_id, h.label, h.signal_type, h.signal_date, h.first_detected_at
           FROM signal_history h
           JOIN accounts a ON a.id = h.account_id
          WHERE a.workspace_id = $1 AND h.account_id = ANY($2::uuid[])
            AND (h.workspace_id = $1 OR h.workspace_id IS NULL)
            AND h.first_detected_at >= $3`,
        [args.workspaceId, ids, new Date(asOf.getTime() - SIGNAL_RECURRENCE_WINDOW_DAYS * 86_400_000)],
      )
      for (const row of history) push(row.account_id, signalHistoryFacts([row]))
      const current = await q.query<Array<{ id: string; recent_signals: unknown }>>(
        `SELECT a.id, a.recent_signals
           FROM accounts a
          WHERE a.workspace_id = $1 AND a.id = ANY($2::uuid[]) AND a.status <> 'deleted'`,
        [args.workspaceId, ids],
      )
      for (const row of current) push(row.id, currentSignalFacts(row.recent_signals))
    } catch (error) {
      this.logger.error('récurrence des signaux illisible (lot)', { error })
      return {}
    }
    const out: Record<string, SignalRecurrence> = {}
    for (const [accountId, facts] of byAccount) {
      const recurrence = signalRecurrenceOf(facts, asOf)
      if (recurrence) out[accountId] = recurrence
    }
    return out
  }

  /**
   * #4284.19 — les PARCOURS : les rôles (passés ou en cours) que les contacts du compte ont tenus CHEZ lui, lus dans leur
   * parcours enregistré. Même cloisonnement (espace ET compte), lecture par `ContactEntity` (GA-405), jamais d'autre
   * colonne que le nom et le parcours. Une lecture en panne est journalisée et n'efface pas les autres familles.
   */
  private async careerFamily(workspaceId: string, accountId: string, companyName: string | null): Promise<RawFact[]> {
    if (!companyName?.trim()) return []
    try {
      const people = await this.accounts.manager.getRepository(ContactEntity).find({
        where: { workspace_id: workspaceId, account_id: accountId, deleted_at: IsNull() },
        select: { id: true, full_name: true, apollo_enrichment: true },
        take: PER_FAMILY,
      })
      return careerFacts(
        people.map(p => ({
          full_name: p.full_name,
          employment_history: p.apollo_enrichment?.employment_history ?? null,
        })),
        companyName,
      )
    } catch (error) {
      this.logger.error('lecture des faits du compte impossible (parcours)', { error })
      return []
    }
  }

  /**
   * H — les échanges (`activities`) en MÉTADONNÉES : `a.body` n'est JAMAIS
   * sélectionné. Le destinataire se résout par `ContactEntity` (GA-405 : pas de
   * lecture brute de `contacts` de plus), borné à l'espace.
   */
  private async exchangeFamily(workspaceId: string, accountId: string): Promise<RawFact[]> {
    try {
      const q = this.accounts.manager
      const rows = await q.query<
        Array<{
          kind: string | null
          direction: string | null
          subject: string | null
          occurred_at: Date | string | null
          contact_id: string | null
        }>
      >(
        `SELECT a.kind, a.direction, a.subject, a.occurred_at, a.contact_id
           FROM activities a
          WHERE a.workspace_id = $1 AND a.account_id = $2
            AND a.kind IN ('email', 'call', 'meeting', 'linkedin')
            AND a.direction IN ('outbound', 'inbound')
          ORDER BY a.occurred_at DESC
          LIMIT ${PER_FAMILY}`,
        [workspaceId, accountId],
      )
      const ids = [...new Set(rows.flatMap(r => (r.contact_id ? [r.contact_id] : [])))]
      const people =
        ids.length > 0
          ? await q.getRepository(ContactEntity).find({
              where: { id: In(ids), workspace_id: workspaceId },
              select: { id: true, full_name: true },
            })
          : []
      const nameOf = new Map(people.map(p => [p.id, p.full_name]))
      return exchangeFacts(
        rows.map(r => ({ ...r, contact_name: r.contact_id ? (nameOf.get(r.contact_id) ?? null) : null })),
      )
    } catch (error) {
      this.logger.error('lecture des faits du compte impossible (H)', { error })
      return []
    }
  }

  /**
   * #4072.1 — les personnes que l'espace CONNAÎT déjà chez ce compte : contacts
   * présents dans « Votre CRM » et interlocuteurs de missions passées. Même
   * lecteur, même cloisonnement (espace ET compte) ; les contacts se lisent par
   * `ContactEntity` (GA-405). `null` = compte absent de l'espace ; une lecture en
   * panne est journalisée et n'efface pas l'autre. Fusion par nom (clé
   * `knownPersonKey`, exacte) : une personne = une ligne, ses raisons, sa date.
   */
  async knownPeople(args: { workspaceId: string; accountId: string }): Promise<KnownPeople | null> {
    const { workspaceId, accountId } = args
    const q = this.accounts.manager
    const [account] = await q.query<Array<{ company_name: string | null }>>(
      `SELECT a.company_name FROM accounts a WHERE a.workspace_id = $1 AND a.id = $2 AND a.status <> 'deleted' LIMIT 1`,
      [workspaceId, accountId],
    )
    if (!account) return null
    const people = new Map<string, { fullName: string; reasons: Set<'crm' | 'mission'>; lastDate: string | null }>()
    const add = (
      name: string | null | undefined,
      reason: 'crm' | 'mission',
      when: Date | string | null | undefined,
    ) => {
      const fullName = (name ?? '').trim()
      const key = knownPersonKey(fullName)
      if (!key) return
      const day = when ? new Date(when).toISOString().slice(0, 10) : null
      const entry = people.get(key) ?? { fullName, reasons: new Set<'crm' | 'mission'>(), lastDate: null }
      entry.reasons.add(reason)
      if (day && (!entry.lastDate || day > entry.lastDate)) entry.lastDate = day
      people.set(key, entry)
    }
    const contacts = q.getRepository(ContactEntity)
    try {
      const known = await contacts.find({
        where: { workspace_id: workspaceId, account_id: accountId, crm_record_id: Not(IsNull()) },
        select: { id: true, full_name: true, crm_synced_at: true },
      })
      for (const c of known) add(c.full_name, 'crm', c.crm_synced_at)
    } catch (error) {
      this.logger.error('lecture des personnes connues impossible (CRM)', { error })
    }
    try {
      const missions = await q.query<
        Array<{
          client_manager_contact_id: string | null
          cra_contact_id: string | null
          billing_contact_id: string | null
          started_on: string | null
          created_at: Date | string | null
        }>
      >(
        `SELECT m.client_manager_contact_id, m.cra_contact_id, m.billing_contact_id, m.started_on, m.created_at
           FROM missions m
          WHERE m.workspace_id = $1 AND m.account_id = $2`,
        [workspaceId, accountId],
      )
      const whenOf = new Map<string, string | Date | null>()
      for (const m of missions) {
        for (const id of [m.client_manager_contact_id, m.cra_contact_id, m.billing_contact_id]) {
          if (!id) continue
          const when = m.started_on ?? m.created_at
          const prev = whenOf.get(id)
          if (!prev || (when && new Date(when) > new Date(prev))) whenOf.set(id, when)
        }
      }
      if (whenOf.size > 0) {
        const named = await contacts.find({
          where: { workspace_id: workspaceId, id: In([...whenOf.keys()]) },
          select: { id: true, full_name: true },
        })
        for (const c of named) add(c.full_name, 'mission', whenOf.get(c.id))
      }
    } catch (error) {
      this.logger.error('lecture des personnes connues impossible (missions)', { error })
    }
    return {
      people: [...people.values()]
        .map(p => ({ fullName: p.fullName, reasons: [...p.reasons], lastDate: p.lastDate }))
        .sort((a, b) => (b.lastDate ?? '').localeCompare(a.lastDate ?? '') || a.fullName.localeCompare(b.fullName)),
    }
  }

  private async marketFacts(
    accountId: string,
    account: AccountRow,
    prefetched?: ReadonlyMap<string, MarketMemoryRead>,
  ): Promise<RawFact[]> {
    const name = (account.company_name ?? '').trim()
    if (!this.marketReader || !name) return []
    try {
      const already = prefetched?.get(accountId)
      if (already) return marketObservationFacts(already)
      return marketObservationFacts(
        await this.marketReader({ ref: accountId, name, website: account.website, country: account.registry_country }),
      )
    } catch (error) {
      this.logger.error('lecture des faits du compte impossible (D)', { error })
      return []
    }
  }
}

/** `%nom%` échappé pour ILIKE ; `null` (aucun document nommé) sous deux caractères. */
function titlePattern(companyName: string | null): string | null {
  const name = (companyName ?? '').trim().slice(0, 100)
  if (name.length < 2) return null
  return `%${name.replace(/[\\%_]/g, c => `\\${c}`)}%`
}
