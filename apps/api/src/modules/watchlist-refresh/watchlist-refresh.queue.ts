/**
 * Shared constants + pure helpers for the daily watchlist signal refresh
 * (C4 — « la Veille doit reposer sur une vraie boucle », retour Théo p.12,
 * PDF4 §12.3). Kept in one file so the scheduler, the worker and their specs
 * agree on the queue name, the job payload and the volume/idempotence rules.
 */
import { isSignalArchived } from '@bellum/contracts'
import { killSwitchCut } from '../../common/kill-switches'

export const WATCHLIST_REFRESH_QUEUE = 'watchlist-refresh'

export type WatchlistRefreshJobData = {
  accountId: string
  /** Account owner — `refreshResearch()` is user-scoped (`findOne(accountId, userId)`). */
  userId: string
}

/**
 * #3916.a — le SECOND genre de job de la même file : la lecture quotidienne des
 * registres publics pour UN SIREN suivi. Même file, même worker, pour une raison
 * précise : c'est le worker qui compare l'AVANT et l'APRÈS, et une seule
 * comparaison doit décider de ce qui est neuf (#3920.a) — deux workers qui
 * diffent chacun leur moitié des sources alerteraient deux fois, ou jamais.
 */
export const REGISTRY_WATCH_JOB = 'registry'

export type RegistryWatchJobData = {
  siren: string
}

/** Un job registre par (SIREN, jour de Paris) — un tick rejoué est dédoublonné. */
export function registryWatchJobId(siren: string, day: string): string {
  return `${WATCHLIST_REFRESH_QUEUE}:${REGISTRY_WATCH_JOB}:${siren}:${day}`
}

/** #3916.a — coupe-circuit de la veille des registres (`PUBLIC_REGISTRY_WATCH_DISABLED=true`). */
export function registryWatchDisabled(): boolean {
  return killSwitchCut('watchlist.registry')
}

/**
 * #3916.a — premier passage sur un SIREN : on lit 24 mois, la fenêtre au-delà
 * de laquelle un signal est de toute façon archivé (`isSignalArchived`). Les
 * passages suivants repartent du dernier jour lu, moins un chevauchement de
 * trois jours (une annonce indexée en retard) — sans risque, l'écriture est
 * idempotente sur `(source, siren, ref)`.
 */
const BODACC_FIRST_LOOKBACK_DAYS = 730
const BODACC_OVERLAP_DAYS = 3

export function bodaccWindow(through: string | null, today: string): { since: string; until: string } {
  const base = new Date(`${through ?? today}T00:00:00Z`)
  base.setUTCDate(base.getUTCDate() - (through ? BODACC_OVERLAP_DAYS : BODACC_FIRST_LOOKBACK_DAYS))
  return { since: base.toISOString().slice(0, 10), until: today }
}

/**
 * #3920.a — LE plafond d'alertes « nouveau signal », et le seul (GA-26) :
 * combien d'alertes système un même destinataire reçoit au plus par jour, toutes
 * sources confondues (re-analyse de veille ET registres publics). Au-delà, le
 * signal reste visible dans la veille du compte — seule la sonnerie se tait.
 * `WATCHLIST_ALERTS_MAX_PER_DAY` (défaut 50, 0 = aucune alerte système).
 *
 * #4016 L7 — décision Louis 11/10/2026 : 10 → 50. Tout le portefeuille suivi
 * est relu chaque jour ; dix alertes par jour auraient fait taire la cloche
 * sur l'essentiel des faits neufs.
 */
/**
 * #3915.decp — décision Louis 16/10/2026 : les marchés publics attribués d'un SIREN
 * suivi se relisent au plus tous les `PUBLIC_AWARDS_REFRESH_DAYS` jours (défaut 30).
 * Le curseur est par SIREN (`public_registry_watch_state.awards_checked_at`, table
 * partagée) : un SIREN lu pour un espace ne se relit pas pour le suivant — c'est
 * le cache 30 j partagé entre espaces. Raison du défaut : la commande publique se
 * publie avec des semaines de retard sur la notification ; relire chaque jour
 * paierait 30 lectures pour un seul fait neuf. `0` = à chaque passage. Une seule
 * lecture de cette clé dans le dépôt (GA-26).
 */
export function publicAwardsRefreshDays(): number {
  return readNonNegativeInt(process.env['PUBLIC_AWARDS_REFRESH_DAYS'], 30)
}

export function maxSignalAlertsPerDay(): number {
  return readNonNegativeInt(process.env['WATCHLIST_ALERTS_MAX_PER_DAY'], 50)
}

/*
 * ⚠️ #4267.1 (Louis 18/10/2026) — `WATCHED_COMMERCIAL_STATUSES` a disparu : le suivi ne se DÉDUIT plus du
 * statut commercial. Un compte est suivi quand un utilisateur l'a suivi explicitement (`account_follows`,
 * 3 au plus par utilisateur) ; la seule définition est `activeFollowExists` (`account-follow.entity.ts`),
 * lue par le scheduler, le worker et les deux digests.
 */

/**
 * #4267.5 (Louis 18/10/2026, promesse client) — le TROISIÈME genre de job de la même file : la
 * ré-analyse COMPLÈTE d'un compte suivi explicitement dont la dernière analyse a plus de 15 jours.
 * Elle passe par le lancement d'analyse normal : les crédits sont débités comme pour toute analyse.
 * Le plafond est celui du suivi lui-même (3 comptes par utilisateur) — jamais tout le parc.
 */
export const REANALYSIS_JOB = 'reanalysis'

export const REANALYSIS_AFTER_DAYS = 15

const DAY_MS = 24 * 60 * 60 * 1000

export type ReanalysisJobData = WatchlistRefreshJobData

export type ReanalysisCandidateRow = {
  id: string
  user_id: string
  followed: boolean
  last_analysis_at: Date | null
}

/** Nombre de jours calendaires (Paris) entre deux instants — l'échéance se compte au JOUR, pas à l'heure. */
function parisDaysBetween(from: Date, to: Date): number {
  const [fy = 0, fm = 1, fd = 1] = parisDay(from).split('-').map(Number)
  const [ty = 0, tm = 1, td = 1] = parisDay(to).split('-').map(Number)
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / DAY_MS)
}

/**
 * Suivi explicitement ET dernière analyse connue vieille de 15 jours calendaires (Paris) ou plus. #4283.8 —
 * « au plus 15 jours » : le tick passe le matin, une analyse de l'après-midi est donc rejouée le 15e jour
 * (14 h plus tôt que 15 × 24 h), jamais le 16e. Une date inconnue n'est jamais devinée.
 */
export function isReanalysisDue(input: { followed: boolean; lastAnalysisAt: Date | null; now: Date }): boolean {
  if (!input.followed || !input.lastAnalysisAt) return false
  return parisDaysBetween(input.lastAnalysisAt, input.now) >= REANALYSIS_AFTER_DAYS
}

/** #4283.8 — le JOUR (Paris, AAAA-MM-JJ) de la prochaine ré-analyse automatique ; `null` quand la dernière analyse est inconnue. */
export function nextReanalysisAt(lastAnalysisAt: Date | null): string | null {
  if (!lastAnalysisAt || Number.isNaN(lastAnalysisAt.getTime())) return null
  const [y = 0, m = 1, d = 1] = parisDay(lastAnalysisAt).split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + REANALYSIS_AFTER_DAYS)).toISOString().slice(0, 10)
}

/** #4283.8 — ce que la fiche annonce : le jour de la prochaine ré-analyse, seulement si un suivi actif la déclenchera vraiment. */
export function nextReanalysisFor(followed: boolean, lastAnalysisAt: Date | null): string | null {
  // Recette 21/10 K4 — même condition que la fréquence affichée (kill switch OU plafond à 0) : une veille coupée
  // n'annonce aucune date.
  if (!followed || watchCadenceFor(followed) === null) return null
  return nextReanalysisAt(lastAnalysisAt)
}

/** Recette 21/10 K4 — pourquoi un compte SUIVI n'a pas de date de prochaine ré-analyse. */
type NextReanalysisReason = 'suspended' | 'never_analyzed' | 'not_followed'

/**
 * La raison de l'absence de date, dite explicitement : jamais un `null` muet sur un compte suivi. Un compte NON suivi
 * dit « not_followed » (recette 22/10 K4 : l'écran affichait « actualisée il y a 6 jours » sans un mot sur la suite) ;
 * un compte suivi qui a une date n'a pas de raison.
 */
export function nextReanalysisReasonFor(followed: boolean, lastAnalysisAt: Date | null): NextReanalysisReason | null {
  if (!followed) return 'not_followed'
  if (watchCadenceFor(followed) === null) return 'suspended'
  return nextReanalysisAt(lastAnalysisAt) === null ? 'never_analyzed' : null
}

export function selectReanalysisBatch(rows: ReanalysisCandidateRow[], now: Date): ReanalysisCandidateRow[] {
  return rows.filter(row => isReanalysisDue({ followed: row.followed, lastAnalysisAt: row.last_analysis_at, now }))
}

/**
 * Un job par (compte, analyse précédente) : un tick rejoué ou une seconde réplique ne le met jamais deux fois,
 * et une analyse neuve ouvre sa propre fenêtre (une fenêtre calée sur l'époque aurait pu avaler un rejeu dû).
 */
export function reanalysisJobId(accountId: string, lastAnalysisAt: Date): string {
  return `${WATCHLIST_REFRESH_QUEUE}:${REANALYSIS_JOB}:${accountId}:${parisDay(lastAnalysisAt)}`
}

/** Deterministic per-(account, Paris-day) jobId: a replayed cron tick or a
 *  second replica re-adding the same job is silently deduped by BullMQ. */
export function watchlistRefreshJobId(accountId: string, day: string): string {
  return `${WATCHLIST_REFRESH_QUEUE}:${accountId}:${day}`
}

/** Europe/Paris calendar date as `YYYY-MM-DD` — the jobId dedup window. */
export function parisDay(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(now)
}

/**
 * Le plafond OPÉRATEUR du volume de re-analyses, lu dans
 * `WATCHLIST_REFRESH_MAX_PER_WORKSPACE` — UN seul réglage (GA-26).
 *
 * ⚠️ RENVERSEMENT DATÉ — #4016 L7, décision Louis 11/10/2026 : « veille de
 * tout le portefeuille suivi, chaque jour ». Jusqu'au 11/10, le défaut était
 * 10 comptes / jour / espace : un portefeuille de 40 comptes n'était relu
 * qu'une fois tous les quatre jours. Désormais :
 *  · absent, vide ou illisible → AUCUN plafond (tout le portefeuille) ;
 *  · `0` → la veille est COUPÉE (inchangé) ;
 *  · `N` → N comptes / jour / espace, pour tous (la forme d'avant) ;
 *  · `growth=50,team=200,*=30` → un plafond PAR PLAN (le palier de l'owner de
 *    l'espace), `*` pour les paliers non nommés ; un palier à `0` coupe la
 *    veille de ce palier seulement. Un morceau illisible est ignoré — jamais
 *    un plafond deviné.
 *
 * Le refresh est payé par le système (aucun crédit) : c'est ce réglage, et
 * l'étalement ({@link spreadSpacingMs}), qui en tiennent le coût.
 */
type WatchlistRefreshCap = {
  /** `0` posé seul : la boucle ne tourne pas. */
  off: boolean
  /** Le plafond des paliers non nommés (`N` seul, ou `*=N`) ; `null` = aucun. */
  fallback: number | null
  /** Plafonds nommés par code de palier. */
  byPlan: Partial<Record<string, number>>
}

export function parseWatchlistRefreshCap(raw: string | undefined): WatchlistRefreshCap {
  const value = (raw ?? '').trim()
  const none: WatchlistRefreshCap = { off: false, fallback: null, byPlan: {} }
  if (!value) return none
  if (/^\d+$/.test(value)) {
    const cap = Number.parseInt(value, 10)
    return { off: cap === 0, fallback: cap, byPlan: {} }
  }
  const byPlan: Partial<Record<string, number>> = {}
  let fallback: number | null = null
  for (const token of value.split(',')) {
    const match = /^\s*([a-z_*]+)\s*=\s*(\d+)\s*$/i.exec(token)
    if (!match) continue
    const [, plan, count] = match
    const cap = Number.parseInt(count ?? '', 10)
    if (!plan || !Number.isFinite(cap)) continue
    if (plan === '*') fallback = cap
    else byPlan[plan.toLowerCase()] = cap
  }
  return { off: false, fallback, byPlan }
}

export function watchlistRefreshCap(): WatchlistRefreshCap {
  return parseWatchlistRefreshCap(process.env['WATCHLIST_REFRESH_MAX_PER_WORKSPACE'])
}

/** Le plafond d'UN espace, son palier connu (ou non) : `null` = aucun plafond. */
export function capForPlan(cap: WatchlistRefreshCap, plan: string | null): number | null {
  const named = plan ? cap.byPlan[plan] : undefined
  return named ?? cap.fallback
}

/** Delay step between two queued refreshes — spreads the batch across the
 *  morning instead of hammering the IA service at the tick. Tunable via
 *  `WATCHLIST_REFRESH_SPACING_MS`. */
export function jobSpacingMs(): number {
  return readNonNegativeInt(process.env['WATCHLIST_REFRESH_SPACING_MS'], 5 * 60 * 1000)
}

/**
 * #4016 L7 — la fenêtre dans laquelle le lot du jour doit tenir : 18 h après
 * le tick de 05:20, la veille du jour est passée avant minuit. Dérivée, jamais
 * une variable de plus (GA-26).
 */
export const WATCHLIST_REFRESH_WINDOW_MS = 18 * 60 * 60 * 1000

/**
 * #4016 L7 — le plancher d'espacement : jamais deux re-analyses à moins de
 * 30 s d'intervalle, quel que soit le volume — c'est ce qui empêche « tout le
 * portefeuille » de marteler les sources (le worker n'en traite d'ailleurs
 * qu'une à la fois, `concurrency: 1`).
 */
export const WATCHLIST_REFRESH_MIN_SPACING_MS = 30_000

/**
 * L'espacement EFFECTIF d'un lot de `count` re-analyses : celui configuré
 * ({@link jobSpacingMs}), RESSERRÉ si le lot déborderait la fenêtre du jour,
 * jamais sous le plancher. Un réglage configuré sous le plancher est respecté
 * tel quel (choix explicite de l'opérateur).
 */
export function spreadSpacingMs(count: number, configured: number = jobSpacingMs()): number {
  if (count <= 1 || configured <= WATCHLIST_REFRESH_MIN_SPACING_MS) return configured
  const fitting = Math.floor(WATCHLIST_REFRESH_WINDOW_MS / (count - 1))
  return Math.max(WATCHLIST_REFRESH_MIN_SPACING_MS, Math.min(configured, fitting))
}

/** Break-glass kill switch (same pattern as `RETENTION_SWEEP_DISABLED`):
 *  the loop is ACTIVE by default, `WATCHLIST_REFRESH_DISABLED=true` stops it. */
export function watchlistRefreshDisabled(): boolean {
  return killSwitchCut('watchlist.refresh')
}

/**
 * #3682.5 — LA FRÉQUENCE DE VEILLE AFFICHÉE EST LA CONFIGURATION RÉELLE.
 * `'daily'` = ce compte est suivi ET la boucle est active (ni coupée, ni plafonnée
 * à 0) : il peut être relancé au plus une fois par jour (rotation, plafond par
 * espace). `null` = aucune veille automatique — l'écran n'affiche alors rien,
 * jamais un « toutes les 24 h » supposé.
 */
export function watchCadenceFor(followed: boolean): 'daily' | null {
  // #4267.1 — `followed` = un suivi EXPLICITE actif existe sur ce compte (`activeFollowExists`).
  if (!followed) return null
  if (watchlistRefreshDisabled() || watchlistRefreshCap().off) return null
  return 'daily'
}

export type WatchlistCandidateRow = {
  id: string
  user_id: string
  workspace_id: string | null
}

/**
 * Pick today's batch from the stalest-first candidate list: at most `cap`
 * accounts per workspace (legacy rows without a workspace fall back to their
 * owner), then interleave workspaces round-robin so the staggered delays don't
 * let one tenant monopolise the early slots.
 *
 * #4016 L7 — `cap` est `null` (aucun plafond : tout le portefeuille), un
 * nombre (le même pour tous), ou une fonction (le plafond de CHAQUE espace,
 * lu sur sa première ligne — un plafond par plan).
 */
export function selectDailyBatch(
  rows: WatchlistCandidateRow[],
  cap: number | null | ((tenant: WatchlistCandidateRow) => number | null),
): WatchlistCandidateRow[] {
  const capOf = typeof cap === 'function' ? cap : () => cap

  const byTenant = new Map<string, { cap: number | null; rows: WatchlistCandidateRow[] }>()
  for (const row of rows) {
    const tenant = row.workspace_id ?? `user:${row.user_id}`
    const bucket = byTenant.get(tenant) ?? { cap: capOf(row), rows: [] }
    byTenant.set(tenant, bucket)
    if (bucket.cap === null || bucket.rows.length < bucket.cap) bucket.rows.push(row)
  }

  const buckets = [...byTenant.values()].map(bucket => bucket.rows)
  const depth = Math.max(0, ...buckets.map(bucket => bucket.length))
  const batch: WatchlistCandidateRow[] = []
  for (let i = 0; i < depth; i++) {
    for (const bucket of buckets) {
      const row = bucket[i]
      if (row) batch.push(row)
    }
  }
  return batch
}

/**
 * Stable identity of one persisted `recent_signals[]` item — label + date +
 * source, lower-cased/trimmed so a re-scrape of the SAME news never counts as
 * new. Reads the same loose label fields (and order) as the Cockpit/Veille and
 * `notifyBuySignalForAccount`, plus the canonical `signal` field of
 * `recentSignalSchema`. Unlabelled items are skipped (they can't be shown, so
 * they can't be "new" either).
 *
 * #3920 — un item PÉRIMÉ au sens d'`isSignalArchived` (Cockpit/Veille, seule
 * source de vérité de la fraîcheur) n'entre JAMAIS dans l'ensemble : sans ce
 * filtre, un signal archivé qui réapparaît dans le JSON (réordonnancement du
 * modèle, ré-collecte d'une source datée) compterait comme NEUF et déclencherait
 * une alerte sur un fait périmé — exactement ce que le critère de l'issue
 * refuse. Appliqué aux DEUX côtés du diff (avant et après), par construction :
 * un même item archivé ne peut donc jamais apparaître que dans l'« après ».
 */
export function signalKeys(value: unknown, now: Date = new Date()): Set<string> {
  // #3920.a — une seule implémentation du diff : `recent_signals` seul est une
  // vue de la comparaison sur toutes les sources.
  return new Set(signalItemsAcrossSources({ recentSignals: value }, now).keys())
}

/**
 * #3920.a — LES SOURCES QUE LA VEILLE COMPARE, toutes, pas seulement `recent_signals`.
 *
 * Avant ce lot, seul `recent_signals` (la sélection du modèle) entrait dans le
 * diff : une offre, un avis de marché ou une annonce BODACC re-collectés ne
 * déclenchaient rien si le modèle ne les recopiait pas. Chaque clé ci-dessous
 * est une liste de `raw_analysis` que la phase 1 re-collecte à chaque passage ;
 * les registres lus en continu (`public_registry_announcements`) s'y ajoutent.
 */
const DIFFED_RAW_ANALYSIS_SOURCES: Readonly<Record<string, string>> = {
  legal_signals: 'BODACC',
  it_job_signals: 'Offres d’emploi',
  press_signals: 'Presse',
  public_tenders: 'Appels d’offres publics',
  // #3915.decp (décision Louis 16/10) — la source se nomme par sa nature : « Marchés publics attribués ».
  awarded_contracts: 'Marchés publics attribués',
  company_events: 'Registre officiel des entreprises (Sirene)',
}

/** Une ligne de registre public telle que la veille la compare. */
export type RegistrySignalRow = {
  source: string
  ref: string
  kind: string
  family_label: string | null
  published_on: string
  url: string | null
}

/** Un signal comparable, quelle que soit sa source — et ce qu'une alerte en dit. */
export type WatchSignalItem = { label: string; source: string; date: string | null; url: string | null }

const REGISTRY_SOURCE_LABEL: Readonly<Record<string, string>> = {
  bodacc: 'BODACC',
  sirene: 'Registre officiel des entreprises (Sirene)',
  // #3920.8 / #3915.decp — même libellé que `awarded_contracts` : un marché lu à l'analyse puis par la veille n'est qu'un fait.
  decp: 'Marchés publics attribués',
  // #3921.9 — le registre national des entreprises : la source se nomme « registre public », jamais un fournisseur.
  rne: 'Registre national des entreprises',
}

/** #3920.k — une ligne de registre sous la forme comparable : une seule traduction. */
export function registryRowToItem(row: RegistrySignalRow): {
  label: string
  source: string
  date: string | null
  url: string
} {
  return {
    label: row.family_label || row.kind,
    source: REGISTRY_SOURCE_LABEL[row.source] ?? row.source,
    date: row.published_on || null,
    url: row.url ?? `${row.source}:${row.ref}`,
  }
}

/**
 * #3920.a — l'ensemble comparable de TOUTES les sources d'un compte, clé →
 * signal. La clé est l'URL quand le signal en porte une (la même annonce lue à
 * l'analyse et par la veille des registres n'est qu'UN fait), sinon
 * libellé + date + source. Les signaux périmés (`isSignalArchived`) n'y entrent
 * jamais, des deux côtés du diff (#3920.2).
 */
export function signalItemsAcrossSources(
  input: { recentSignals: unknown; rawAnalysis?: unknown; registry?: readonly RegistrySignalRow[] },
  now: Date = new Date(),
): Map<string, WatchSignalItem> {
  const items = new Map<string, WatchSignalItem>()
  const nowMs = now.getTime()
  const add = (record: Record<string, unknown>, fallbackSource: string): void => {
    const label = readAnySourceLabel(record)
    if (!label) return
    const freshness = typeof record['freshness'] === 'string' ? (record['freshness'] as string) : null
    const date = readTrimmed(record['date'])
    if (isSignalArchived({ freshness, date: date || null }, nowMs)) return
    const source = readTrimmed(record['source']) || fallbackSource
    const url = readTrimmed(record['url'])
    const key = url
      ? `url:${url.toLowerCase()}`
      : `${label.toLowerCase()}|${date.toLowerCase()}|${source.toLowerCase()}`
    if (!items.has(key)) items.set(key, { label, source, date: date || null, url: url || null })
  }
  for (const raw of Array.isArray(input.recentSignals) ? input.recentSignals : []) {
    if (raw && typeof raw === 'object') add(raw as Record<string, unknown>, '')
  }
  const analysis =
    input.rawAnalysis && typeof input.rawAnalysis === 'object' ? (input.rawAnalysis as Record<string, unknown>) : {}
  for (const [field, sourceLabel] of Object.entries(DIFFED_RAW_ANALYSIS_SOURCES)) {
    const list = analysis[field]
    for (const raw of Array.isArray(list) ? list : []) {
      if (raw && typeof raw === 'object') add(raw as Record<string, unknown>, sourceLabel)
    }
  }
  for (const row of input.registry ?? []) {
    const item = registryRowToItem(row)
    add({ title: item.label, date: item.date, url: item.url, source: item.source }, '')
  }
  return items
}

/** #3920.a — ce qui est dans l'APRÈS et pas dans l'AVANT, le plus récent d'abord. */
export function newSignalItems(
  before: Map<string, WatchSignalItem>,
  after: Map<string, WatchSignalItem>,
): WatchSignalItem[] {
  return [...after.entries()]
    .filter(([key]) => !before.has(key))
    .map(([, item]) => item)
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
}

/** Le libellé d'un item de N'IMPORTE QUELLE source : une annonce BODACC se nomme
 *  par son `type` (son `label` est le nom du commerçant), un avis par son `object`. */
function readAnySourceLabel(record: Record<string, unknown>): string | null {
  for (const field of ['signal', 'title', 'type', 'label', 'object', 'description', 'summary'] as const) {
    const value = record[field]
    if (typeof value === 'string' && value.trim().length > 0) return value.trim()
  }
  return null
}

function readTrimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readNonNegativeInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}
