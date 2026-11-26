import { z } from 'zod'
import {
  REFRESH_DIMENSION_CREDIT_COST,
  REFRESH_DIMENSION_PHASE,
  refreshDimensionSchema,
  refreshedTooRecently,
  type RefreshDimension,
  type RefreshPhase,
} from './analysis.js'
import type { RefreshDiff } from './refresh-explained.js'

/**
 * #2452 (LAU-FINAL-165) — APPROFONDIR UNE RÉPONSE DE /chat, PROGRESSIVEMENT.
 *
 * « Commencer vite, puis approfondir seulement ce qui compte » — sans
 * recommencer depuis zéro, sans refacturer ce qui a déjà été payé, sans créer
 * trois versions non reliées du même travail.
 *
 * Tranché sans Louis (decisions-louis-22-09-soir.md §12) — reco appliquée :
 * AUCUN moteur neuf. Le moteur qui rejoue UNE section d'un dossier en
 * réutilisant les sorties stockées de toutes les autres existe déjà
 * (`AnalysisRefreshService.refresh`, rafraîchissement par axe) : verrou par
 * phase, fenêtre de fraîcheur, débit APRÈS succès, compte rendu du changement.
 * Ce fichier ne fait que trois choses qu'il n'avait pas :
 *   1. traduire les sept actions de l'issue en (compte, axe) ;
 *   2. DEVISER le delta avant de lancer — ce qui est frais est réutilisé
 *      (0 crédit), deux axes d'une même phase ne se paient qu'une fois ;
 *   3. résumer ce qui a changé et ce que ça a coûté.
 *
 * Tout est PUR (aucune I/O, `now` en paramètre) : l'API lit les comptes et le
 * grand livre, le web lit le devis ; les deux appliquent la MÊME règle (GA-26).
 */

/** Une réponse peut citer vingt comptes ; on n'en approfondit jamais plus de cinq d'un geste. */
export const DEEPEN_MAX_ACCOUNTS = 5

type DeepenReach = 'first' | 'all'

/**
 * #2452.3 — les sept actions de l'issue, chacune traduite en axes RÉELLEMENT
 * rejouables. L'ordre est celui de l'issue ; un axe est un
 * `RefreshDimension`, jamais une chaîne libre.
 */
const DEEPEN_ACTION_TABLE = {
  verify_now: { dimensions: ['signals'], reach: 'first' },
  deepen_answer: { dimensions: ['signals', 'entities', 'strategy'], reach: 'first' },
  deepen_top_five: { dimensions: ['signals', 'entities', 'strategy'], reach: 'all' },
  refresh_contacts: { dimensions: ['contacts'], reach: 'first' },
  compare_subsidiaries: { dimensions: ['subsidiaries'], reach: 'first' },
  // #2263.20 — « offrir de vérifier un poste » : le seul des six axes de
  // l'ACTUALISATION CIBLÉE (#2263) absent de cette table. Le moteur existait
  // déjà (RefreshDimension `positions`, coûté séparément côté fiche de
  // compte) ; il ne manquait qu'à cette traduction chat.
  verify_position: { dimensions: ['positions'], reach: 'first' },
  access_paths: { dimensions: ['buying_path'], reach: 'first' },
  full_dossier: { dimensions: ['signals', 'contacts', 'entities', 'strategy'], reach: 'first' },
} as const satisfies Record<string, { dimensions: readonly RefreshDimension[]; reach: DeepenReach }>

export type DeepenActionId = keyof typeof DEEPEN_ACTION_TABLE

const DEEPEN_ACTION_IDS = Object.keys(DEEPEN_ACTION_TABLE) as DeepenActionId[]

/**
 * #2452.3 — les actions proposées DÉPENDENT de la réponse : aucune sans compte
 * cité (rien à approfondir), « les cinq premiers » seulement quand il y en a
 * plusieurs.
 */
export function deepenActionsFor(accountCount: number): DeepenActionId[] {
  if (accountCount <= 0) return []
  return DEEPEN_ACTION_IDS.filter(id => id !== 'deepen_top_five' || accountCount > 1)
}

// Un lien de fiche, tel que les cartes de réponse (`reply-blocks.ts`) et le
// markdown de Laura l'écrivent : `/accounts/<uuid>`.
const ACCOUNT_LINK = /\/accounts\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi

/**
 * Les comptes que la réponse CITE, dans l'ordre où elle les cite (le classement
 * de Laura est donc respecté : « les cinq premiers » sont les siens).
 * Dédoublonnés, bornés à {@link DEEPEN_MAX_ACCOUNTS}. Un identifiant écrit par
 * le modèle n'est qu'une CANDIDATURE : le serveur ne devise que les comptes
 * que l'appelant voit réellement.
 */
export function accountIdsInReply(text: string): string[] {
  const seen: string[] = []
  for (const match of text.matchAll(ACCOUNT_LINK)) {
    const id = match[1]?.toLowerCase()
    if (id && !seen.includes(id)) seen.push(id)
    if (seen.length >= DEEPEN_MAX_ACCOUNTS) break
  }
  return seen
}

export type DeepenTarget = { accountId: string; dimension: RefreshDimension }

export function deepenTargetsFor(action: DeepenActionId, accountIds: readonly string[]): DeepenTarget[] {
  const { dimensions, reach } = DEEPEN_ACTION_TABLE[action]
  const accounts = reach === 'first' ? accountIds.slice(0, 1) : accountIds.slice(0, DEEPEN_MAX_ACCOUNTS)
  return accounts.flatMap(accountId => dimensions.map(dimension => ({ accountId, dimension })))
}

/** Corps de `POST /analysis/deepen/quote`. */
export const deepenQuoteRequestSchema = z.object({
  targets: z
    .array(z.object({ accountId: z.string().guid(), dimension: refreshDimensionSchema }))
    .min(1)
    .max(DEEPEN_MAX_ACCOUNTS * 4),
})

/** Ce que l'API sait d'un compte, lu en base — l'entrée du devis. */
export type DeepenAccountState = {
  accountId: string
  name: string
  /** Un dossier terminé existe — sans lui, rien n'est rejouable par axe. */
  hasDossier: boolean
  /** Crédits nets déjà consommés sur ce compte (grand livre), réutilisés tels quels. */
  invested: number
  /** Dernier rafraîchissement de chaque phase (`<phase>_refreshed_at`), ISO ou `null`. */
  freshness: Record<RefreshPhase, string | null>
}

/**
 * Le statut d'une ligne du devis :
 *  - `reuse`      — la phase est fraîche : réutilisée, 0 crédit ;
 *  - `run`        — la phase sera rejouée, et elle seule ;
 *  - `same_phase` — un autre axe de la même phase est déjà rejoué dans ce geste : 0 crédit ;
 *  - `no_dossier` — aucun dossier à approfondir sur ce compte, rien n'est lancé.
 */
export type DeepenLineStatus = 'reuse' | 'run' | 'same_phase' | 'no_dossier'

export type DeepenLine = DeepenTarget & {
  name: string
  status: DeepenLineStatus
  cost: number
  refreshedAt: string | null
}

export type DeepenQuote = {
  lines: DeepenLine[]
  /** Crédits déjà investis sur les comptes visés, et réutilisés. */
  alreadyInvested: number
  /** Crédits SUPPLÉMENTAIRES que ce geste coûtera — jamais le total. */
  delta: number
  remaining: number
  sufficient: boolean
  accounts: DeepenAccountState[]
}

/**
 * #2452.2 / #2452.4 / #2452.5 — le devis du delta. Même règle de fraîcheur que
 * le moteur qui exécutera (`refreshedTooRecently`), même grille de prix
 * (`REFRESH_DIMENSION_CREDIT_COST`) : l'écran n'annonce jamais un chiffre que
 * la caisse ne prélèvera pas.
 */
export function buildDeepenQuote(input: {
  targets: readonly DeepenTarget[]
  accounts: readonly DeepenAccountState[]
  remaining: number
  now: Date
}): DeepenQuote {
  const byId = new Map(input.accounts.map(account => [account.accountId, account]))
  const planned = new Set<string>()
  const lines: DeepenLine[] = []
  for (const target of input.targets) {
    const account = byId.get(target.accountId)
    // On n'affiche pas ce qu'on n'a pas : un compte introuvable ne fait aucune ligne.
    if (!account) continue
    const phase = REFRESH_DIMENSION_PHASE[target.dimension]
    const refreshedAt = account.freshness[phase]
    const base = { ...target, name: account.name, refreshedAt }
    if (!account.hasDossier) {
      lines.push({ ...base, status: 'no_dossier', cost: 0 })
      continue
    }
    const key = `${target.accountId}:${phase}`
    if (planned.has(key)) {
      lines.push({ ...base, status: 'same_phase', cost: 0 })
      continue
    }
    if (refreshedTooRecently(refreshedAt, input.now)) {
      lines.push({ ...base, status: 'reuse', cost: 0 })
      continue
    }
    planned.add(key)
    lines.push({ ...base, status: 'run', cost: REFRESH_DIMENSION_CREDIT_COST[target.dimension] })
  }
  const targeted = new Set(lines.filter(line => line.status !== 'no_dossier').map(line => line.accountId))
  const alreadyInvested = [...targeted].reduce((sum, id) => sum + Math.max(0, byId.get(id)?.invested ?? 0), 0)
  const delta = lines.reduce((sum, line) => sum + line.cost, 0)
  return {
    lines,
    alreadyInvested,
    delta,
    remaining: input.remaining,
    sufficient: delta <= input.remaining,
    accounts: [...input.accounts],
  }
}

/** #2452.7 — les trois étapes d'UN même travail, dans l'ordre de l'issue. */
export type DeepenLevel = 'quick' | 'verified' | 'deepened'

const DEEPENING_PHASES: readonly RefreshPhase[] = ['entities', 'strategy']

/**
 * #2452.7 — où en est le travail ouvert par CETTE réponse. Lu sur les dates de
 * fraîcheur des comptes qu'elle cite, postérieures à la réponse : rien de
 * stocké à part, donc rien qui diverge, et un fil rouvert demain dit la même
 * chose qu'aujourd'hui.
 */
export function deepenLevel(accounts: readonly DeepenAccountState[], since: string): DeepenLevel {
  const from = Date.parse(since)
  if (!Number.isFinite(from)) return 'quick'
  const after = (at: string | null) => (at ? Date.parse(at) > from : false)
  if (accounts.some(account => DEEPENING_PHASES.some(phase => after(account.freshness[phase])))) return 'deepened'
  if (accounts.some(account => after(account.freshness.signals) || after(account.freshness.contacts))) return 'verified'
  return 'quick'
}

export type DeepenRunOutcome = {
  dimension: RefreshDimension
  /** Crédits réellement débités (0 si la ligne a échoué — le moteur ne débite qu'après succès). */
  cost: number
  diff: RefreshDiff | null
  failed?: boolean
}

export type DeepenRunSummary = {
  confirmed: RefreshDimension[]
  changed: string[]
  added: string[]
  dropped: string[]
  unmeasured: RefreshDimension[]
  failed: RefreshDimension[]
  spent: number
}

/**
 * #2452.6 — la fin d'un approfondissement : confirmé, changé, nouveau, écarté
 * (redevenu inconnu, avec sa date côté fiche), non mesuré, et le coût
 * supplémentaire RÉELLEMENT débité. Un axe que l'instantané ne sait pas lire
 * se dit « non mesuré », jamais « confirmé » (GA-18).
 */
export function summarizeDeepenRun(outcomes: readonly DeepenRunOutcome[]): DeepenRunSummary {
  const summary: DeepenRunSummary = {
    confirmed: [],
    changed: [],
    added: [],
    dropped: [],
    unmeasured: [],
    failed: [],
    spent: 0,
  }
  for (const outcome of outcomes) {
    if (outcome.failed) {
      summary.failed.push(outcome.dimension)
      continue
    }
    summary.spent += outcome.cost
    const diff = outcome.diff
    if (!diff || diff.unmeasured.includes(outcome.dimension)) {
      summary.unmeasured.push(outcome.dimension)
      continue
    }
    const changed = diff.changedFacts.map(fact => fact.label)
    const added = diff.newFacts.map(fact => fact.label)
    const dropped = [...diff.obsoleteFacts, ...diff.expiredSignals].map(fact => fact.label)
    if (changed.length + added.length + dropped.length === 0) summary.confirmed.push(outcome.dimension)
    summary.changed.push(...changed)
    summary.added.push(...added)
    summary.dropped.push(...dropped)
  }
  return summary
}
