import { Injectable, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, IsNull, MoreThanOrEqual, Not, Repository } from 'typeorm'
import {
  computeAccountVariationSignals,
  computeHierarchyLevel,
  headcountTrancheLowerBound,
  type AccountVariationInput,
  type AccountVariationSignal,
  type ContactApolloDetails,
} from '@bellum/contracts'
import { AccountEntity } from '../../database/entities/account.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { PublicRegistryAnnouncementEntity, SireneSnapshotEntity } from '../../database/entities/public-registry.entity'
import { contactSourceTag } from '../analysis/contact-score'

/**
 * #3920.10 (décision Louis 15/10/2026) — LECTURE des quatre signaux de variation d'un compte.
 *
 * Aucun achat de données : les dates viennent de ce que l'espace a DÉJÀ (signaux du dossier, contacts
 * enrichis). Une source sans aucune date exploitable est passée `null` → « non mesuré », jamais 0. Le calcul
 * est dans `computeAccountVariationSignals` (contrat) ; ce service ne fait que rassembler les dates.
 */
const IT_TITLE_RE =
  /\b(dsi|cio|cto|cdo|rssi|ciso|dpo|informatique|syst[èe]mes?\s+d.information|digital|data|cyber|technolog\w*|infrastructure|it)\b/i
const DECISION_LEVELS = new Set(['c_level', 'direction', 'management'])

function datesOf(signals: readonly unknown[], kinds: readonly string[]): string[] | null {
  const dates: string[] = []
  for (const raw of signals) {
    if (!raw || typeof raw !== 'object') continue
    const { type, date } = raw as { type?: unknown; date?: unknown }
    if (typeof type !== 'string' || !kinds.includes(type)) continue
    if (typeof date === 'string' && Number.isFinite(Date.parse(date))) dates.push(date)
  }
  // Aucune date lisible : la source n'a rien dit de daté — « non mesuré », pas « zéro offre ».
  return dates.length > 0 ? dates : null
}

/** Un relevé d'effectif tel que `sirene_snapshots` le garde (une ligne par SIREN et par jour). */
type HeadcountSnapshot = { observedOn: string; headcountRange: string | null }

/** #3920.9 — au-delà de la base la plus ancienne que le signal accepte (225 j), un relevé ne sert plus. */
const HEADCOUNT_LOOKBACK_DAYS = 230

/**
 * #3920.9 — relevés Sirene → observations d'effectif. Borne basse de la tranche (jamais un milieu deviné) ;
 * tranche absente, `NN` ou « 0 salarié » : le relevé sort du dénominateur. Aucun relevé lisible → `null`.
 */
function headcountObservationsOf(
  readings: readonly HeadcountSnapshot[],
): AccountVariationInput['headcountObservations'] {
  const observations: { date: string; headcount: number }[] = []
  for (const reading of readings) {
    const headcount = headcountTrancheLowerBound(reading.headcountRange)
    if (headcount === null || headcount <= 0) continue
    observations.push({ date: reading.observedOn, headcount })
  }
  return observations.length > 0 ? observations : null
}

/** #3915.30 — les attributions datées lues AILLEURS que dans `recent_signals` (la même source que la liste de la fiche). */
type AwardDateSources = { frozenAwardDates?: readonly string[]; registryAwardDates?: readonly string[] }

/** #3915.30 — `raw_analysis.awarded_contracts[].notified_date` → dates ISO lisibles. */
function frozenAwardDatesOf(rawAnalysis: unknown): string[] {
  const contracts = (rawAnalysis as { awarded_contracts?: unknown } | null)?.awarded_contracts
  if (!Array.isArray(contracts)) return []
  const dates: string[] = []
  for (const c of contracts) {
    const d = (c as { notified_date?: unknown } | null)?.notified_date
    if (typeof d === 'string' && Number.isFinite(Date.parse(d))) dates.push(d.trim().slice(0, 10))
  }
  return dates
}

/** Union sans doublon (même jour = même marché), l'ordre de lecture gardé. `null` quand rien de daté. */
function mergeAwardDates(...lists: (readonly string[] | null | undefined)[]): string[] | null {
  const seen = new Set<string>()
  const out: string[] = []
  for (const list of lists) {
    for (const d of list ?? []) {
      const key = d.slice(0, 10)
      if (seen.has(key)) continue
      seen.add(key)
      out.push(d)
    }
  }
  return out.length > 0 ? out : null
}

export function variationInputFromRecords(
  recentSignals: readonly unknown[] | null | undefined,
  contacts: readonly Pick<ContactEntity, 'title' | 'source' | 'entity' | 'raw_data' | 'last_enrichment_at'>[],
  companyName: string,
  headcountReadings: readonly HeadcountSnapshot[] = [],
  awards: AwardDateSources = {},
): AccountVariationInput {
  const signals = Array.isArray(recentSignals) ? recentSignals : []
  const moves: string[] = []
  for (const contact of contacts) {
    if (!contact.last_enrichment_at || !companyName) continue
    if (!IT_TITLE_RE.test(contact.title ?? '')) continue
    if (!DECISION_LEVELS.has(computeHierarchyLevel(contact.title))) continue
    const apolloDetails = (contact.raw_data as { apolloDetails?: ContactApolloDetails } | null)?.apolloDetails
    if (contactSourceTag(contact.source ?? null, apolloDetails, companyName, contact.entity ?? null) === 'RISQUE') {
      moves.push(contact.last_enrichment_at.toISOString())
    }
  }
  return {
    jobOfferDates: datesOf(signals, ['recrutement']),
    // #3915.30 — signaux datés + marchés figés par l'analyse + annonces DECP : la liste et le compteur lisent la même source.
    publicAwardDates: mergeAwardDates(
      datesOf(signals, ['marche_public']),
      awards.frozenAwardDates,
      awards.registryAwardDates,
    ),
    // #3920.9 — les relevés `sirene_snapshots` (un par jour, tranche INSEE). Sans relevé lisible :
    // « non mesuré » (`no_history`). Jamais un effectif d'hier deviné.
    headcountObservations: headcountObservationsOf(headcountReadings),
    // On n'a appris un mouvement qu'à la date d'enrichissement : sans aucun contact mouvant, source non lue.
    itDecisionMakerMoveDates: moves.length > 0 ? moves : null,
  }
}

@Injectable()
export class AccountVariationSignalsService {
  constructor(
    @InjectRepository(AccountEntity) private readonly accounts: Repository<AccountEntity>,
    @InjectRepository(ContactEntity) private readonly contacts: Repository<ContactEntity>,
    // `@Optional()` : sans le référentiel de relevés, l'effectif reste « non mesuré » (comportement d'avant).
    @Optional()
    @InjectRepository(SireneSnapshotEntity)
    private readonly snapshots?: Repository<SireneSnapshotEntity>,
    // #3915.30 — `@Optional()` : sans lui, seuls les marchés du dossier comptent.
    @Optional()
    @InjectRepository(PublicRegistryAnnouncementEntity)
    private readonly announcements?: Repository<PublicRegistryAnnouncementEntity>,
  ) {}

  /** `null` si le compte n'est pas dans l'espace. Lecture seule. */
  async signalsFor(accountId: string, workspaceId: string, now = new Date()): Promise<AccountVariationSignal[] | null> {
    const account = await this.accounts.findOne({ where: { id: accountId, workspace_id: workspaceId } })
    if (!account) return null
    const contacts = await this.contacts.find({
      where: { account_id: accountId, workspace_id: workspaceId, deleted_at: IsNull() },
      select: ['id', 'title', 'source', 'entity', 'raw_data', 'last_enrichment_at'],
    })
    const readings = await this.headcountReadingsOf(account.siren, now)
    return computeAccountVariationSignals(
      variationInputFromRecords(account.recent_signals as unknown[], contacts, account.company_name, readings, {
        frozenAwardDates: frozenAwardDatesOf(account.raw_analysis),
        registryAwardDates: await this.registryAwardDatesOf(account.siren),
      }),
      now,
    )
  }

  /** #3915.30 — dates des marchés attribués (DECP, acheteur ou titulaire) relus pour ce SIREN. Sans SIREN ou référentiel : `[]`. */
  private async registryAwardDatesOf(siren: string | null): Promise<string[]> {
    if (!this.announcements || !siren) return []
    const rows = await this.announcements.find({
      where: { siren, source: 'decp', kind: In(['award', 'award_won']) },
      select: ['published_on'],
    })
    return rows.map(row => String(row.published_on).slice(0, 10))
  }

  /** Les relevés d'effectif mesurés du SIREN sur la fenêtre utile. Sans SIREN ou sans référentiel : `[]`. */
  private async headcountReadingsOf(siren: string | null, now: Date): Promise<HeadcountSnapshot[]> {
    if (!this.snapshots || !siren) return []
    const since = new Date(now.getTime() - HEADCOUNT_LOOKBACK_DAYS * 86_400_000).toISOString().slice(0, 10)
    const rows = await this.snapshots.find({
      where: { siren, headcount_range: Not(IsNull()), observed_on: MoreThanOrEqual(since) },
      order: { observed_on: 'ASC' },
    })
    return rows.map(row => ({ observedOn: String(row.observed_on).slice(0, 10), headcountRange: row.headcount_range }))
  }
}
