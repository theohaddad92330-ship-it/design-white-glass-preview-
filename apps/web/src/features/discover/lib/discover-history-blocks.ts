import { DISCOVER_BLOCK_CAP } from '@bellum/contracts'
import { signalAgeDays } from './discover-presentation'
import { hasOwnSignalDate, whyNowSignals } from './discover-why-now'
import type { DiscoverCandidate, DiscoverSignal } from './discover-types'

/**
 * #4758 / #4761 (épopée #4762, Louis 28/10/2026) — DEUX BLOCS, jamais une liste de trois cents lignes :
 * « Signaux récents » (un fait daté dans la fenêtre de recherche) puis « Comptes à historique » (aucun
 * récent, mais des besoins DATÉS plus anciens, déjà stockés). Chaque bloc dit son plafond et son total.
 *
 * Ce module ne fabrique rien : il range des signaux datés que la recherche a ramenés. Un compte sans
 * signal ni historique n'est dans aucun bloc — il est COMPTÉ (`unlisted`), jamais passé sous silence.
 */

/** La fenêtre de « récent » quand l'appelant n'en connaît pas d'autre : celle de l'écran (`sinceDays`, 90). */
const DEFAULT_WINDOW_DAYS = 90

/** Ce qui fait remonter un compte sur son historique — de quoi écrire « 11 offres Java entre 2025 et 2026, la dernière il y a 3 mois ». */
export interface HistoryReason {
  count: number
  /** `offers` quand tous les besoins comptés sont des offres d'emploi, `needs` sinon — on ne dit « offres » que si c'est vrai. */
  kind: 'offers' | 'needs'
  /** Ce que l'entreprise a cherché (la techno de la recherche), `null` si rien ne la recoupe — jamais deviné. */
  subject: string | null
  fromYear: number
  toYear: number
  lastAgeDays: number
  /**
   * #4819 — la ligne de preuve de la carte nomme une offre datée DANS la fenêtre de recherche alors que le compte
   * est rangé ici (aucun signal récent : offre fermée ou date de simple détection). Présent seulement quand c'est
   * vrai ; la carte DIT alors pourquoi cette offre ne compte pas, au lieu de contredire le bloc.
   */
  evidenceInsideWindow?: true
}

interface HistoryOptions {
  nowMs?: number
  /** La fenêtre de recherche (jours) : la même que celle de `splitDiscoverBlocks`. */
  windowDays?: number
  /** La techno / le mot-clé de la recherche en cours : nommé SEULEMENT si au moins un besoin le recoupe. */
  subject?: string
}

const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Un besoin daté du compte : ni vie juridique, ni simple date de détection. */
function datedNeeds(signals: readonly DiscoverSignal[], nowMs: number): DiscoverSignal[] {
  return signals.filter(signal => signal.type !== 'legal' && hasOwnSignalDate(signal, nowMs))
}

/**
 * #4758 (recette du 29/10) — le sujet que la raison essaie de nommer. L'expertise cochée d'abord ; à défaut les
 * mots-clés de la recherche lancée ; à défaut ce qui est tapé dans la barre (`freetext`) — le geste naturel du
 * commercial (« Java »). Ce n'est qu'un CANDIDAT : `historyReason` ne le nomme que si un besoin daté le recoupe,
 * donc une phrase entière tapée dans la barre ne recoupe rien et la ligne reste générique.
 */
export function historySubject({
  skills,
  keywords,
  freetext,
}: {
  skills: string
  keywords: string
  freetext: string
}): string {
  return skills.trim() || keywords.trim() || freetext.trim()
}

export function historyReason(
  candidate: Pick<DiscoverCandidate, 'signals' | 'skillEvidence'>,
  { nowMs = Date.now(), subject, windowDays = DEFAULT_WINDOW_DAYS }: HistoryOptions = {},
): HistoryReason | null {
  const needs = datedNeeds(candidate.signals, nowMs)
  if (needs.length === 0) return null
  const wanted = subject?.trim() ?? ''
  const matching = wanted === '' ? [] : needs.filter(signal => fold(signal.label).includes(fold(wanted)))
  const named = matching.length > 0
  const used = named ? matching : needs
  const times = used.map(signal => Date.parse(signal.date)).sort((a, b) => a - b)
  const last = times[times.length - 1]
  const first = times[0]
  if (last === undefined || first === undefined) return null
  const lastAgeDays = signalAgeDays(new Date(last).toISOString(), nowMs)
  if (lastAgeDays === null) return null
  const evidenceAge = signalAgeDays(candidate.skillEvidence?.latestOffer.date ?? '', nowMs)
  return {
    count: used.length,
    kind: used.every(signal => signal.type === 'hiring') ? 'offers' : 'needs',
    subject: named ? wanted : null,
    fromYear: new Date(first).getUTCFullYear(),
    toYear: new Date(last).getUTCFullYear(),
    lastAgeDays,
    ...(evidenceAge !== null && evidenceAge <= windowDays ? { evidenceInsideWindow: true as const } : {}),
  }
}

export interface DiscoverBlock {
  /** Tous les comptes du bloc. */
  rows: DiscoverCandidate[]
  /** Les comptes rendus : `DISCOVER_BLOCK_CAP` au plus, tous si le bloc est déplié. */
  shown: DiscoverCandidate[]
  total: number
  /** Les « N autres » : `total - shown`, jamais négatif. */
  hidden: number
}

interface DiscoverBlocks {
  recent: DiscoverBlock
  history: DiscoverBlock
  /** Les comptes sans signal récent ni historique : dans aucun bloc, mais comptés. */
  unlisted: number
}

function block(rows: DiscoverCandidate[], expanded: boolean): DiscoverBlock {
  const shown = expanded ? rows : rows.slice(0, DISCOVER_BLOCK_CAP)
  return { rows, shown, total: rows.length, hidden: rows.length - shown.length }
}

export function splitDiscoverBlocks(
  candidates: readonly DiscoverCandidate[],
  {
    nowMs = Date.now(),
    windowDays = DEFAULT_WINDOW_DAYS,
    expanded = {},
  }: { nowMs?: number; windowDays?: number; expanded?: { recent?: boolean; history?: boolean } } = {},
): DiscoverBlocks {
  const recent: DiscoverCandidate[] = []
  const history: DiscoverCandidate[] = []
  let unlisted = 0
  for (const candidate of candidates) {
    if (whyNowSignals(candidate.signals, 1, { maxAgeDays: windowDays, nowMs }).length > 0) recent.push(candidate)
    else if (datedNeeds(candidate.signals, nowMs).length > 0) history.push(candidate)
    else unlisted += 1
  }
  return {
    recent: block(recent, expanded.recent === true),
    history: block(history, expanded.history === true),
    unlisted,
  }
}
