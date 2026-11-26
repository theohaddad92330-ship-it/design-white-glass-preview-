/**
 * Ce que le navigateur se rappelle d'une visite à l'autre — §4.4 règle n°7 et
 * décision D47 du PDF 10.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * OÙ ÇA VIT, ET POURQUOI PAS AILLEURS
 * ─────────────────────────────────────────────────────────────────────────
 * D47 tranche : « oui, 30 jours, en stockage local uniquement, **jamais côté
 * serveur sans compte** ». C'est ce qui rend la mémoire tenable sur un site
 * public : il n'y a aucune conversation de visiteur à conserver, à purger, à
 * sauvegarder ni à déclarer. Ce que le visiteur efface en vidant son navigateur
 * est réellement effacé, et personne n'a besoin de le lui promettre.
 *
 * Le module est PUR — il ne touche pas `localStorage`, il en lit et en produit
 * la chaîne. Le stockage échoue en navigation privée, sur un navigateur qui
 * bloque les données de site, et dans un aperçu ; un module qui irait le
 * chercher lui-même ne serait ni testable, ni robuste à ces trois cas.
 */

import type { ChatTurn } from './contract'
import { VISIT_MEMORY_DAYS } from './auto-open'
import type { LeadState } from './routing'

export const VISIT_STORAGE_KEY = 'bellum.chat.visit'

const MEMORY_MS = VISIT_MEMORY_DAYS * 24 * 60 * 60 * 1000
/** Le fil conservé. Au-delà, on garde la fin : c'est elle qui porte le contexte
 *  d'une reprise, pas la salutation d'il y a trois semaines. */
const MAX_STORED_TURNS = 20
/** Les accroches déjà servies. Bornée, sinon la clé grossit indéfiniment sur un
 *  visiteur fidèle. */
const MAX_SEEN = 12

export type StoredVisit = {
  /** Le format. Une version inconnue est JETÉE plutôt que devinée : lire un
   *  ancien format de travers vaut moins que repartir de zéro. */
  version: 1
  lastSeenAt: number
  visitCount: number
  /** Les messages d'accroche déjà vus — jamais de rejeu du même (règle n°7). */
  seen: string[]
  /** La page qui avait retenu la personne la dernière fois. C'est ce que le
   *  message de retour cite : « tu avais regardé les tarifs ». */
  lastTopic?: string
  lead?: LeadState
  turns?: ChatTurn[]
  /**
   * L'identifiant local et opaque qui affecte ce visiteur aux variantes des
   * deux A/B du §11 (`experiments.ts`) — jamais un identifiant de tracking, il
   * ne sert qu'à choisir une variante et ne quitte jamais le navigateur. Il vit
   * ICI plutôt que dans une seconde clé de stockage : même durée de trente
   * jours, même disparition quand le visiteur vide son navigateur, rien de
   * plus à expliquer ni à purger.
   */
  visitorId?: string
}

/**
 * Relit ce qui est stocké, ou `null`.
 *
 * `null` couvre quatre cas qu'il ne sert à rien de distinguer ici — rien de
 * stocké, JSON illisible, version inconnue, mémoire périmée : dans les quatre,
 * la bonne conduite est la même, on accueille la personne comme la première
 * fois. Une mémoire à moitié comprise produirait un « content de te revoir » à
 * quelqu'un qui n'est jamais venu, ce qui est pire que rien.
 */
export function readVisit(raw: string | null, now: number): StoredVisit | null {
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const record = parsed as Partial<StoredVisit>
  if (record.version !== 1) return null
  if (typeof record.lastSeenAt !== 'number' || typeof record.visitCount !== 'number') return null
  if (now - record.lastSeenAt > MEMORY_MS) return null

  return {
    version: 1,
    lastSeenAt: record.lastSeenAt,
    visitCount: Math.max(1, Math.trunc(record.visitCount)),
    seen: Array.isArray(record.seen) ? record.seen.filter(item => typeof item === 'string').slice(-MAX_SEEN) : [],
    ...(typeof record.lastTopic === 'string' ? { lastTopic: record.lastTopic } : {}),
    ...(record.lead && typeof record.lead === 'object' ? { lead: record.lead } : {}),
    ...(Array.isArray(record.turns) ? { turns: record.turns.slice(-MAX_STORED_TURNS) } : {}),
    ...(typeof record.visitorId === 'string' && record.visitorId ? { visitorId: record.visitorId } : {}),
  }
}

/**
 * L'état de la visite qui commence.
 *
 * `alreadyCounted` vient de la session du navigateur : sans lui, chaque
 * navigation entre deux pages compterait une visite de plus, et Laura dirait
 * « content de te revoir » au deuxième clic de la première visite.
 *
 * `visitorId` n'est utilisé QUE pour amorcer une mémoire qui n'en a pas encore
 * un — une fois posé, il ne change plus. Le module reste pur : c'est
 * l'appelant qui fabrique l'identifiant (`createVisitorId`), jamais ce fichier
 * qui irait chercher son propre hasard.
 */
export function openVisit(
  previous: StoredVisit | null,
  now: number,
  options: { alreadyCounted: boolean; visitorId?: string },
): StoredVisit {
  const visitorId = previous?.visitorId || options.visitorId
  if (!previous) return { version: 1, lastSeenAt: now, visitCount: 1, seen: [], ...(visitorId ? { visitorId } : {}) }
  return {
    ...previous,
    lastSeenAt: now,
    visitCount: options.alreadyCounted ? previous.visitCount : previous.visitCount + 1,
    ...(visitorId ? { visitorId } : {}),
  }
}

/** Ce message d'accroche a-t-il déjà été servi ? — la règle n°7, en une ligne. */
export function alreadySeen(visit: StoredVisit | null, message: string): boolean {
  return Boolean(visit?.seen.includes(message))
}

/** Note ce qu'on vient de montrer, de lire et d'apprendre. Rend un nouvel
 *  objet : rien n'est muté, la valeur stockée est celle qu'on rend. */
export function rememberVisit(
  visit: StoredVisit,
  update: { message?: string; topic?: string; lead?: LeadState; turns?: readonly ChatTurn[] },
): StoredVisit {
  const seen = update.message && !visit.seen.includes(update.message) ? [...visit.seen, update.message] : visit.seen
  return {
    ...visit,
    seen: seen.slice(-MAX_SEEN),
    ...(update.topic ? { lastTopic: update.topic } : {}),
    ...(update.lead ? { lead: update.lead } : {}),
    ...(update.turns ? { turns: update.turns.slice(-MAX_STORED_TURNS) } : {}),
  }
}

export function serializeVisit(visit: StoredVisit): string {
  return JSON.stringify(visit)
}
