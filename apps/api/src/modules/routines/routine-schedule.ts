import type { RoutineCadence, RoutineSubscription } from '@bellum/contracts'
import { zonedDateKey, zonedParts, zonedTimeToInstant } from '../agenda/time-zone'

/**
 * « Cette routine doit-elle tourner MAINTENANT, pour CET utilisateur ? »
 *
 * Calcul pur, et c'est délibéré : c'est le seul endroit du moteur où une erreur
 * est à la fois invisible et coûteuse. Une routine qui ne part jamais ne se
 * remarque pas — l'utilisateur croit simplement qu'il n'y avait rien à dire. Une
 * routine qui part deux fois se remarque tout de suite, et fait désinstaller le
 * produit.
 *
 * Deux décisions structurent la fonction.
 *
 * 1. **L'heure est locale à l'utilisateur.** Un « brief du matin » calé sur UTC
 *    tombe à 6 h 30 pour un commercial parisien en été. Le fuseau vient de
 *    l'abonnement, pas du serveur.
 * 2. **L'idempotence est une CLÉ, pas une horloge.** Le balayeur tourne toutes
 *    les quinze minutes ; s'il redémarre, ou si deux replicas balayent en même
 *    temps, la même occurrence ne doit produire qu'un envoi. La clé
 *    `utilisateur:routine:jour-local` sert d'unicité en base — l'insertion
 *    échoue au second essai plutôt que de dupliquer.
 */

/**
 * La fenêtre de RATTRAPAGE, en heures.
 *
 * Elle valait 1 — une routine due à 8 h ne pouvait partir qu'entre 8 h 00 et
 * 8 h 59 — et c'était un défaut observé en production : la routine
 * « Préparation des rendez-vous » (18 h) n'est pas partie le 15 août. Il suffit
 * que le service redémarre, qu'un déploiement passe ou que le verrou de
 * balayage soit tenu pendant cette heure-là pour que l'occurrence soit perdue
 * DÉFINITIVEMENT et SANS TRACE : l'écran affiche alors la veille comme dernière
 * exécution, et rien ne distingue « il n'y avait rien à dire » de « ça n'a pas
 * tourné ».
 *
 * Trois heures, et pas davantage : le contenu d'une routine est calculé à
 * l'exécution, donc une préparation de rendez-vous envoyée à 20 h reste juste ;
 * mais un « brief du matin » qui arriverait à 23 h serait pire que pas de brief
 * du tout — il ferait douter de tous les autres. Passé la fenêtre, on ne
 * rattrape plus, et le prochain jour ouvré reprend normalement.
 *
 * Note : une routine réglée tard (22 h) dispose mécaniquement de moins de
 * rattrapage, la journée locale s'arrêtant à minuit. C'est voulu — rattraper
 * au-delà de minuit changerait la clé d'idempotence et enverrait l'occurrence
 * de la veille sous la date du lendemain.
 */
const HOUR_WINDOW = 3

/** Les mois qui ouvrent un trimestre. */
const QUARTER_MONTHS = new Set([1, 4, 7, 10])

/**
 * Premier jour OUVRÉ du mois.
 *
 * Le rapport écrit « 1er ouvré 09:30 » et il a raison : un rapport posté un
 * dimanche est lu le lundi, noyé sous le reste. On teste donc que le jour est
 * ouvré ET que tous les jours précédents du mois étaient des week-ends.
 */
function isFirstBusinessDay(parts: { day: number; isoWeekday: number }): boolean {
  if (parts.isoWeekday > 5) return false
  // Le 1er ouvré est le 1er, le 2 (si le 1er était un dimanche) ou le 3 (si le
  // 1er était un samedi). Au-delà, un jour ouvré du mois est déjà passé.
  if (parts.day > 3) return false
  const weekdayOfFirst = ((parts.isoWeekday - (parts.day - 1) - 1 + 7 * 5) % 7) + 1
  if (parts.day === 1) return true
  if (parts.day === 2) return weekdayOfFirst === 7
  return weekdayOfFirst === 6
}

/**
 * Le JOUR calendaire tombe-t-il dans le cycle de cette cadence ? Partagé par
 * {@link isRoutineDue} (le jour ET l'heure) et {@link nextRoutineTrigger} (le
 * jour seul — la prochaine occurrence nominale, jamais une fenêtre de
 * rattrapage).
 */
function isScheduledDate(
  parts: { day: number; month: number; isoWeekday: number },
  cadence: RoutineCadence,
  weekday: number | null,
): boolean {
  if (cadence === 'weekdays' && parts.isoWeekday > 5) return false
  if (cadence === 'weekly' && parts.isoWeekday !== (weekday ?? 1)) return false
  // Mensuel et trimestriel tombent sur le PREMIER JOUR OUVRÉ, pas sur le 1er du
  // mois : un rapport posté un dimanche est lu le lundi, noyé sous le reste.
  if ((cadence === 'monthly' || cadence === 'quarterly') && !isFirstBusinessDay(parts)) return false
  if (cadence === 'quarterly' && !QUARTER_MONTHS.has(parts.month)) return false
  return true
}

/**
 * Une occurrence est-elle due ?
 *
 * `lastRunDateKey` est le jour local de la DERNIÈRE exécution : il empêche un
 * second envoi le même jour même si le balayeur repasse dans la même heure.
 */
export function isRoutineDue(
  subscription: Pick<RoutineSubscription, 'enabled' | 'hour' | 'weekday' | 'timeZone'>,
  cadence: RoutineCadence,
  now: Date,
  lastRunDateKey: string | null,
): boolean {
  if (!subscription.enabled) return false

  // Une routine CONTINUE ne regarde ni l'heure ni le jour : elle tourne à chaque
  // balayage et c'est son idempotence PAR OBJET qui empêche les doublons.
  if (cadence === 'continuous') return true

  const parts = zonedParts(now, subscription.timeZone)

  if (!isScheduledDate(parts, cadence, subscription.weekday)) return false

  // L'heure locale doit être celle demandée. On accepte l'heure entière : un
  // balayage toutes les 15 min tombe donc quatre fois dedans, et c'est la clé
  // d'idempotence qui tranche.
  if (parts.hour < subscription.hour || parts.hour >= subscription.hour + HOUR_WINDOW) return false

  // Déjà partie aujourd'hui (heure locale) : on ne repasse pas.
  return lastRunDateKey !== occurrenceKey(subscription.timeZone, now)
}

/**
 * #2266.27 — LE PROCHAIN DÉCLENCHEMENT, connu et affiché.
 *
 * Calcul pur et déterministe, à partir des SEULS champs déjà en base
 * (`hour`/`weekday`/`timeZone` de l'abonnement, `cadence` du catalogue) —
 * aucune donnée nouvelle, aucune donnée inventée. C'est l'heure NOMINALE de
 * la prochaine occurrence, jamais la fenêtre de rattrapage de
 * {@link isRoutineDue} : afficher « prochain déclenchement 8 h-11 h » ne
 * dirait rien d'utile à qui règle son suivi dessus.
 *
 * Une routine CONTINUE n'a pas de prochain instant unique — elle tourne à
 * chaque balayage — donc `null`, jamais une heure devinée (GA-18/19 : une
 * absence ne se déguise pas en valeur).
 */
const LOOKAHEAD_DAYS: Record<RoutineCadence, number> = {
  continuous: 0,
  daily: 8,
  weekdays: 8,
  weekly: 8,
  monthly: 40,
  // Le pire cas mesuré : juste après le 1er ouvré d'octobre, le prochain est
  // celui de janvier — jusqu'à ~95 jours plus loin selon le calendrier.
  quarterly: 110,
}

export function nextRoutineTrigger(
  subscription: Pick<RoutineSubscription, 'enabled' | 'hour' | 'weekday' | 'timeZone'>,
  cadence: RoutineCadence,
  now: Date,
): string | null {
  if (!subscription.enabled) return null
  if (cadence === 'continuous') return null

  const today = zonedParts(now, subscription.timeZone)
  for (let offset = 0; offset <= LOOKAHEAD_DAYS[cadence]; offset++) {
    // Midi, pas minuit : à distance d'un basculement DST, midi ne tombe jamais
    // dans l'heure qui n'existe pas ou qui existe deux fois.
    const noon = zonedTimeToInstant(
      { year: today.year, month: today.month, day: today.day + offset, hour: 12 },
      subscription.timeZone,
    )
    const candidate = zonedParts(noon, subscription.timeZone)
    if (!isScheduledDate(candidate, cadence, subscription.weekday)) continue

    const trigger = zonedTimeToInstant(
      { year: candidate.year, month: candidate.month, day: candidate.day, hour: subscription.hour },
      subscription.timeZone,
    )
    // Aujourd'hui compte seulement si l'heure nominale n'est pas déjà passée —
    // sinon la « prochaine » occurrence serait déjà derrière nous.
    if (trigger.getTime() >= now.getTime()) return trigger.toISOString()
  }
  // Aucune occurrence trouvée dans la fenêtre de recherche : `null`, jamais
  // une date devinée au-delà de ce qui a été vérifié.
  return null
}

/** Le jour local d'une occurrence — la moitié variable de la clé d'idempotence. */
export function occurrenceKey(timeZone: string, now: Date): string {
  return zonedDateKey(now, timeZone)
}

/**
 * La clé d'unicité complète, telle qu'elle est écrite en base.
 *
 * Volontairement lisible : quand quelqu'un doit comprendre pourquoi une routine
 * n'est pas partie, il lit une ligne, pas un hachage.
 */
export function routineRunKey(userId: string, routineKey: string, timeZone: string, now: Date): string {
  return `${userId}:${routineKey}:${occurrenceKey(timeZone, now)}`
}

/**
 * La clé d'une occurrence attachée à un OBJET (routine continue).
 *
 * Pas de date dedans, volontairement : « le rendez-vous X a été annoncé » est
 * vrai pour toujours. Y mettre le jour ferait re-notifier le même rendez-vous
 * le lendemain matin.
 */
export function routineObjectKey(userId: string, routineKey: string, objectId: string): string {
  return `${userId}:${routineKey}:obj:${objectId}`
}
