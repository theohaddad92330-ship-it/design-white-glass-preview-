import { isSignalArchived } from './account.js'
import { parseSignalDate, signalSortMs } from './signal-date.js'

function eventMsOf(date: string | null | undefined, nowMs: number): number | null {
  return signalSortMs(parseSignalDate(date), nowMs)
}

/**
 * #3682 — LA DATE D'UNE RECHERCHE ET CELLE D'UN ÉVÉNEMENT RACONTENT DEUX CHOSES.
 *
 * Une seule lecture, partagée par la liste des comptes, le dossier et Laura
 * (GA-26) : « dernière vérification » (quand NOUS avons regardé) et « dernier
 * événement utile » (quand le fait s'est produit). Confondre les deux faisait
 * passer un fait de 2024 pour une raison d'agir en 2026 parce que l'analyse
 * avait été relancée.
 */

type FreshnessSignalLike = { freshness?: string | null; date?: string | null }

export type SignalFreshnessState = 'current' | 'historical' | 'undated' | 'none'

export type SignalFreshnessSummary = {
  /** Dernière analyse TERMINÉE (une recherche interrompue n'est jamais « à jour »). */
  verifiedAt: string | null
  /** La date du FAIT, telle que la source la portait. `null` = inconnue, jamais la date d'import. */
  eventDate: string | null
  state: SignalFreshnessState
}

/**
 * Le signal dominant : le premier fait actuel, à défaut le premier non ancien
 * (pertinence avant chronologie, mais un fait ancien ne passe pas pour l'actualité).
 * Que des faits anciens : le premier, on garde le contexte historique.
 */
export function pickDominantRecentSignal<T extends { freshness?: string | null }>(usable: readonly T[]): T | null {
  return (
    usable.find(signal => signal.freshness === 'current') ??
    usable.find(signal => signal.freshness !== 'archive') ??
    usable[0] ??
    null
  )
}

export function summarizeSignalFreshness(input: {
  dominant: FreshnessSignalLike | null | undefined
  verifiedAt: string | null
  nowMs?: number
}): SignalFreshnessSummary {
  const nowMs = input.nowMs ?? Date.now()
  const { dominant, verifiedAt } = input
  if (!dominant) return { verifiedAt, eventDate: null, state: 'none' }
  const eventMs = eventMsOf(dominant.date, nowMs)
  // Une date future dans un texte de programme est un HORIZON, pas une publication.
  if (eventMs === null || eventMs > nowMs) return { verifiedAt, eventDate: null, state: 'undated' }
  const eventDate = dominant.date ?? null
  if (isSignalArchived(dominant, nowMs)) return { verifiedAt, eventDate, state: 'historical' }
  if ((dominant.freshness ?? '').toLowerCase() === 'undated') return { verifiedAt, eventDate: null, state: 'undated' }
  return { verifiedAt, eventDate, state: 'current' }
}

/** La fraîcheur d'un fait DÉCLARÉ (saisie, import) : posée par SA date, jamais par le geste de déclaration. */
export function declaredSignalFreshness(
  date: string | null | undefined,
  nowMs: number = Date.now(),
): 'current' | 'archive' | 'undated' {
  const ms = eventMsOf(date, nowMs)
  if (ms === null || ms > nowMs) return 'undated'
  return isSignalArchived({ date }, nowMs) ? 'archive' : 'current'
}
