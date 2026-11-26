import { isJobOffer, offerTitleKey } from '@/lib/signal-dedupe'
import type { WatchSignal } from './watch'

/**
 * #3680.1 — UNE UNITÉ DE LECTURE : l'ÉVÉNEMENT IDENTIFIÉ.
 *
 * Plusieurs articles sur un même événement ne sont pas plusieurs signaux. La
 * clé de rapprochement ne se déduisait pas du code (« les 7 et 41 ne se
 * recomposent pas ») : tranché sans Louis — même catégorie, même date
 * (jamais vide : un signal non daté ne fusionne avec rien, ce serait lui
 * inventer un événement), même texte une fois normalisé (casse, accents,
 * ponctuation). Volontairement étroite : fusionner à tort cacherait un vrai
 * signal, ne pas fusionner laisse seulement un doublon lisible.
 *
 * La liste ET les compteurs lisent cette même collection (le compteur ouvre
 * la liste qu'il nomme). Les sources des doublons ne disparaissent pas : elles
 * se joignent à celle de l'événement retenu.
 */
/** Casse, accents et ponctuation retirés : la forme sous laquelle deux textes se comparent. */
export function normalizeEventText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

export function watchEventKey(signal: WatchSignal): string | null {
  const date = signal.date.trim()
  if (!date || signal.freshness === 'undated') return null
  const text = normalizeEventText(signal.signal)
  if (!text) return null
  return `${signal.category}|${date}|${text}`
}

/** Mots de 3 lettres et plus : ce que deux libellés partagent quand ils racontent le même événement. */
function eventTokens(value: string): Set<string> {
  return new Set(
    normalizeEventText(value)
      .split(' ')
      .filter(word => word.length >= 3),
  )
}

const NEAR_DUPLICATE_OVERLAP = 0.75

/**
 * #4142 (R25) — deux libellés QUASI identiques (« Veolia investit dans Mistral AI » / « Veolia
 * investit dans Mistral AI pour l'IA générative ») sont le même événement : même catégorie, même
 * date (jamais devinée — un signal non daté ne fusionne avec rien), et l'un des deux libellés est
 * recouvert à 75 % ou plus par l'autre. Plus étroit que la clé exacte sur la DATE seulement : un
 * jour d'écart reste un autre événement.
 */
function nearDuplicateIndex(events: readonly WatchSignal[], signal: WatchSignal): number {
  if (!signal.date.trim() || signal.freshness === 'undated') return -1
  const tokens = eventTokens(signal.signal)
  if (tokens.size < 3) return -1
  return events.findIndex(kept => {
    if (kept.category !== signal.category || kept.date.trim() !== signal.date.trim() || kept.freshness === 'undated')
      return false
    const other = eventTokens(kept.signal)
    if (other.size < 3) return false
    const shared = [...tokens].filter(word => other.has(word)).length
    return shared / Math.min(tokens.size, other.size) >= NEAR_DUPLICATE_OVERLAP
  })
}

export function distinctWatchEvents(signals: readonly WatchSignal[]): WatchSignal[] {
  const byKey = new Map<string, number>()
  const byOfferTitle = new Map<string, number>()
  const events: WatchSignal[] = []
  for (const signal of signals) {
    // Recette 21/10 K3 — deux offres au même intitulé (deux villes) sont UNE ligne « 2 offres (Toulouse, Aix) » :
    // seules les offres d'emploi se replient ainsi, et les villes absentes ne s'inventent pas.
    // K3 22/10 — le prédicat est CELUI de la catégorie « recrutement » (`isJobOffer`), pas `source_kind === 'job'` seul.
    const offerKey =
      isJobOffer({ type: signal.type, source_kind: signal.sourceKind, source: signal.source }) && signal.signal
        ? offerTitleKey(signal.signal)
        : ''
    const firstOffer = offerKey ? byOfferTitle.get(offerKey) : undefined
    if (firstOffer !== undefined) {
      const host = events[firstOffer]
      if (host) {
        const places = host.offerPlaces ?? (host.location?.trim() ? [host.location.trim()] : [])
        const place = signal.location?.trim()
        if (place && !places.includes(place)) places.push(place)
        events[firstOffer] = { ...host, offerCount: (host.offerCount ?? 1) + 1, offerPlaces: places }
        continue
      }
    }
    if (offerKey) byOfferTitle.set(offerKey, events.length)
    const key = watchEventKey(signal)
    let seen = key === null ? undefined : byKey.get(key)
    if (seen === undefined) {
      const near = nearDuplicateIndex(events, signal)
      if (near >= 0) {
        seen = near
        if (key !== null) byKey.set(key, near)
      }
    }
    if (seen === undefined) {
      if (key !== null) byKey.set(key, events.length)
      events.push(signal)
      continue
    }
    const kept = events[seen]
    if (kept && signal.source && !kept.source.split(' · ').includes(signal.source)) {
      events[seen] = { ...kept, source: kept.source ? `${kept.source} · ${signal.source}` : signal.source }
    }
    // #3916 — le doublon ne fait jamais perdre le LIEN : le signal retenu sans lien prend celui du doublon.
    const current = events[seen]
    if (current && !current.sourceUrl && signal.sourceUrl) {
      events[seen] = { ...current, sourceUrl: signal.sourceUrl, sourceKind: signal.sourceKind ?? current.sourceKind }
    }
  }
  return events
}
