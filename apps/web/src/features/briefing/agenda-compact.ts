import type { AgendaEvent, AgendaPreferences, ProtectedTime } from '@bellum/contracts'
import { isAllDay, isProposedAgendaEvent } from '@/features/agenda/agenda-view'

/**
 * LA JOURNÉE D'AGENDA, EN UNE LIGNE (#2101.1, #2101.2).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE LIGNE DIT, ET CE QU'ELLE NE REDIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * « Aujourd'hui » porte déjà le rendez-vous en cours ou le prochain (le
 * bandeau), le nombre de rendez-vous à venir, le temps en réunion et le compte
 * de conflits. #2101 demande quatre choses de plus, et ce sont EXACTEMENT
 * celles que cette ligne apporte :
 *
 *  - la distinction CLIENT / INTERNE (#2101.5, #2101.6) — un après-midi de
 *    points internes et un après-midi de clients ne se préparent pas pareil ;
 *  - ce qui est PROPOSÉ et pas encore accepté (#2101.9, #2101.20) — `dayLoad`
 *    le calcule depuis le premier jour et personne ne le lisait ;
 *  - les CRÉNEAUX LIBRES significatifs (#2101.8) ;
 *  - rien d'autre : la vue semaine reste derrière le sélecteur du plateau
 *    (#2101.10), et le détail reste dans le plateau.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI LES CRÉNEAUX SE COMPTENT ENTRE DEUX RENDEZ-VOUS, ET PAS AUTREMENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Un « créneau libre » dépend de ce qu'on appelle une journée de travail, et ce
 * réglage — le temps protégé — n'existe pas encore dans le produit (#2101.13
 * le demande). L'inventer ici (« 9 h - 18 h ») poserait une heure de fin que
 * personne n'a choisie, puis un second endroit où elle vivrait le jour où
 * quelqu'un la choisira pour de bon.
 *
 * On compte donc ce qu'on SAIT : les trous ENTRE deux rendez-vous confirmés.
 * Le temps après le dernier rendez-vous n'est pas compté — il n'a pas de fin
 * connue. C'est moins que ce que #2101.8 décrit, et c'est dit dans le libellé :
 * « entre tes rendez-vous ».
 *
 * ⚠️ #2101.13 (mise à jour) — le temps protégé EXISTE maintenant, comme un
 * réglage personnel explicite (`protected-time.ts`, Réglages › Mémoire de
 * Laura). Quand la personne l'a réglé, cette fin connue apparaît : le trou
 * AVANT le premier rendez-vous du jour et celui APRÈS le dernier, bornés à
 * l'intérieur de sa fenêtre protégée, s'ajoutent aux trous déjà comptés — sans
 * rien changer pour qui ne l'a pas réglé (`protectedTime` reste optionnel,
 * comportement inchangé, byte pour byte).
 *
 * ⚠️ #2101.17 (mise à jour) — les DEUX constantes ci-dessous
 * (`AGENDA_FREE_SLOT_MIN_MINUTES`/`AGENDA_CAPACITY_MINUTES_PER_DOSSIER` et
 * `AGENDA_CAPACITY_RESERVE_SLOTS`) tranchaient pour tout le monde de la même
 * façon ce que #2101 nomme « préférences », une entrée de la routine SÉPARÉE
 * du temps protégé. Une personne réglée (`agenda-preferences.ts`, même sac
 * `user_preferences`) fait maintenant remplacer ces deux défauts globaux par
 * les siens — sans rien changer pour qui ne les a pas réglés
 * (`agendaPreferences` reste optionnel, un champ à la fois).
 */

/**
 * À partir de combien de minutes un trou vaut la peine d'être nommé.
 *
 * Quarante-cinq : en dessous, on ne place ni un appel préparé ni une visite,
 * et annoncer « 3 créneaux libres » pour trois fois vingt minutes ferait
 * promettre à la journée une souplesse qu'elle n'a pas.
 */
export const AGENDA_FREE_SLOT_MIN_MINUTES = 45

/**
 * CAPACITÉ D'AGENDA (#2101.33, #2101.34, #2101.35).
 *
 * Combien de minutes libres « coûte » un dossier ouvrable — le même repère que
 * {@link AGENDA_FREE_SLOT_MIN_MINUTES} : en dessous, un trou ne suffit déjà pas
 * à y placer un appel ou une visite, donc pas à y ouvrir un dossier non plus.
 */
export const AGENDA_CAPACITY_MINUTES_PER_DOSSIER = AGENDA_FREE_SLOT_MIN_MINUTES

/**
 * Le nombre de dossiers que la capacité calculée NE compte jamais (#2101.35) —
 * la réserve. Sans elle, une journée exactement pleine de rendez-vous
 * proposerait d'utiliser 100 % de son temps libre (#2101.34), ce qu'on ne fait
 * jamais : il reste toujours de la place pour l'imprévu.
 */
export const AGENDA_CAPACITY_RESERVE_SLOTS = 1

/**
 * Moins de temps disponible = moins de dossiers ouvrables SIMULTANÉMENT
 * (#2101.33) : une fonction croissante des minutes libres, jamais un nombre
 * fixe. Elle ne remplit jamais tous les créneaux libres (#2101.34) et retient
 * toujours une réserve (#2101.35).
 *
 * #2101.17 — `minutesPerDossier` et `reserveSlots` sont les DÉFAUTS globaux
 * sauf si l'appelant passe les préférences de CETTE personne
 * (`agendaPreferences`, voir {@link agendaCompactSummary}).
 */
export function computeAgendaCapacity(
  freeMinutesTotal: number,
  minutesPerDossier: number = AGENDA_CAPACITY_MINUTES_PER_DOSSIER,
  reserveSlots: number = AGENDA_CAPACITY_RESERVE_SLOTS,
): number {
  if (freeMinutesTotal <= 0) return 0
  const fullSlots = Math.floor(freeMinutesTotal / minutesPerDossier)
  return Math.max(0, fullSlots - reserveSlots)
}

/** Non exporté : rien hors de ce fichier ne le consomme, et `knip` le voit. */
type AgendaCompactSummary = {
  /** Rendez-vous à venir avec quelqu'un d'EXTERNE, confirmés. */
  client: number
  /** Rendez-vous à venir internes, confirmés. */
  internal: number
  /** Créneaux PROPOSÉS, à venir, que personne n'a encore acceptés. */
  proposed: number
  /** Trous d'au moins {@link AGENDA_FREE_SLOT_MIN_MINUTES} entre deux confirmés. */
  freeSlots: number
  /** Dossiers ouvrables aujourd'hui compte tenu du temps libre restant (#2101.33-35). */
  capacity: number
}

/**
 * Le résumé compact de ce qui RESTE de la journée.
 *
 * ⚠️ Les journées entières sortent du compte, comme dans `dayLoad` : un salon
 * n'est ni un rendez-vous client de plus ni un créneau occupé de la journée, et
 * le compter des deux façons rendrait les deux chiffres faux.
 *
 * ⚠️ Un évènement sans date lisible est IGNORÉ, jamais rangé par défaut : le
 * classer « à venir » ou « passé » serait deviner, et le chiffre porterait une
 * supposition sans le dire.
 */
export function agendaCompactSummary(
  events: AgendaEvent[],
  now: Date,
  /** #2101.13 — absent = comportement inchangé, personne ne l'a réglé. */
  protectedTime: ProtectedTime | null = null,
  /** #2101.17 — absent (ou champ par champ) = défauts globaux inchangés. */
  agendaPreferences: Partial<AgendaPreferences> | null = null,
): AgendaCompactSummary {
  const nowMs = now.getTime()
  const minutesPerDossier = agendaPreferences?.dossierDurationMinutes ?? AGENDA_CAPACITY_MINUTES_PER_DOSSIER
  const reserveSlots = agendaPreferences?.reserveSlots ?? AGENDA_CAPACITY_RESERVE_SLOTS
  const upcoming = (events ?? []).filter(item => {
    if (isAllDay(item) || item.cancelled) return false
    const start = item.start ? Date.parse(item.start) : Number.NaN
    return !Number.isNaN(start) && start >= nowMs
  })

  const confirmed = upcoming.filter(item => !isProposedAgendaEvent(item))
  const { count: freeSlots, minutes: freeMinutesTotal } = freeGaps(confirmed, minutesPerDossier)
  const edges = protectedTime
    ? protectedTimeEdgeGaps(confirmed, now, protectedTime, minutesPerDossier)
    : { count: 0, minutes: 0 }

  return {
    client: confirmed.filter(item => item.isExternal).length,
    internal: confirmed.filter(item => !item.isExternal).length,
    proposed: upcoming.filter(item => isProposedAgendaEvent(item)).length,
    freeSlots: freeSlots + edges.count,
    capacity: computeAgendaCapacity(freeMinutesTotal + edges.minutes, minutesPerDossier, reserveSlots),
  }
}

/**
 * Les trous significatifs entre deux rendez-vous confirmés, dans l'ordre, et
 * leur durée cumulée (minutes) — la base de {@link computeAgendaCapacity}.
 *
 * #2101.17 — `minMinutes` est le même repère que le calcul de capacité
 * (voir le commentaire de fichier) : le défaut global, sauf préférence
 * personnelle passée par l'appelant.
 */
function freeGaps(
  confirmed: AgendaEvent[],
  minMinutes: number = AGENDA_FREE_SLOT_MIN_MINUTES,
): { count: number; minutes: number } {
  const slots = [...confirmed]
    .map(item => ({ start: Date.parse(item.start ?? ''), end: Date.parse(item.end ?? item.start ?? '') }))
    .filter(slot => !Number.isNaN(slot.start) && !Number.isNaN(slot.end))
    .sort((left, right) => left.start - right.start)

  let free = 0
  let freeMs = 0
  // `reach` est la fin la plus LOINTAINE rencontrée, pas celle du créneau
  // précédent : deux rendez-vous qui se chevauchent ne créent pas un trou
  // derrière le plus court des deux.
  let reach = slots.length ? slots[0]!.end : 0
  for (const slot of slots.slice(1)) {
    const gap = slot.start - reach
    if (gap >= minMinutes * 60_000) {
      free += 1
      freeMs += gap
    }
    reach = Math.max(reach, slot.end)
  }
  return { count: free, minutes: Math.floor(freeMs / 60_000) }
}

/**
 * #2101.13 — LES DEUX TROUS QUE `freeGaps` NE VOIT PAS : avant le premier
 * rendez-vous du jour, après le dernier — bornés à la fenêtre protégée de
 * CETTE personne, jamais au-delà (une fin de journée que personne n'a réglée
 * ne s'invente pas, voir le commentaire de fichier).
 *
 * ⚠️ N'ajoute QUE les deux bords, jamais les trous ENTRE deux rendez-vous à
 * l'intérieur de la fenêtre : `freeGaps` les compte déjà sur l'ensemble des
 * rendez-vous confirmés, les recompter ici les compterait deux fois (GA-26).
 */
function protectedTimeEdgeGaps(
  confirmed: AgendaEvent[],
  now: Date,
  protectedTime: ProtectedTime,
  /** #2101.17 — même repère que {@link freeGaps}, défaut global sauf préférence. */
  minMinutes: number = AGENDA_FREE_SLOT_MIN_MINUTES,
): { count: number; minutes: number } {
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime()
  const windowEnd = dayStart + protectedTime.endMinute * 60_000
  const windowStart = Math.max(dayStart + protectedTime.startMinute * 60_000, now.getTime())
  if (windowStart >= windowEnd) return { count: 0, minutes: 0 }

  const withinWindow = confirmed
    .map(item => ({ start: Date.parse(item.start ?? ''), end: Date.parse(item.end ?? item.start ?? '') }))
    .filter(
      slot => !Number.isNaN(slot.start) && !Number.isNaN(slot.end) && slot.start < windowEnd && slot.end > windowStart,
    )

  if (withinWindow.length === 0) {
    const minutes = Math.floor((windowEnd - windowStart) / 60_000)
    return minutes >= minMinutes ? { count: 1, minutes } : { count: 0, minutes: 0 }
  }

  const first = withinWindow.reduce((earliest, slot) => (slot.start < earliest.start ? slot : earliest))
  const last = withinWindow.reduce((latest, slot) => (slot.end > latest.end ? slot : latest))

  let count = 0
  let minutes = 0
  const before = first.start - windowStart
  if (before >= minMinutes * 60_000) {
    count += 1
    minutes += Math.floor(before / 60_000)
  }
  const after = windowEnd - last.end
  if (after >= minMinutes * 60_000) {
    count += 1
    minutes += Math.floor(after / 60_000)
  }
  return { count, minutes }
}
