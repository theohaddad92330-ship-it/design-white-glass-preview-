import { IGNORED_AFTER_HOURS } from './interruption-budget.js'
import { surfaceAcceptanceOutcome } from './laura-interventions.js'

/**
 * #2403.40-.47 — LES HUIT NOMS DE LA §5.3, ET CE QU'ON SAIT VRAIMENT COMPTER.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE MANQUE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le §5.3 nomme huit événements — `offered`, `viewed`, `accepted`, `dismissed`,
 * `ignored`, `converted_to_action`, `false_positive`, `disabled` — et aucun
 * n'existait sous ce nom : `laura_interventions` porte les FAITS bruts
 * (`reaction`, `created_at`), jamais leur agrégat nommé.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Trois des huit noms n'ont AUCUN signal à lire aujourd'hui :
 *
 *  · `viewed` — rien ne distingue « la carte a été RENDUE à l'écran » de
 *    « le serveur a décidé de parler » (`offered`) ni d'une réaction : aucun
 *    accusé de réception n'existe entre les deux.
 *  · `converted_to_action` — chaque clé du catalogue mène à un écran
 *    DIFFÉRENT (compléter un profil, connecter un CRM, écrire un message…) ;
 *    savoir si l'action AVAL a réellement été menée à son terme suppose un
 *    suivi par FAMILLE que rien ne fait aujourd'hui.
 *  · `false_positive` — la taxonomie des réactions ne porte que quatre
 *    valeurs (`acted`/`ignored`/`closed_unread`/`refused`) ; « la donnée
 *    montrée était fausse » n'est un geste distinct nulle part.
 *
 * Plutôt que d'inventer un calcul, ces trois-là restent `unmeasured`, avec
 * leur raison — la même discipline que `SurfaceAcceptanceMeasure`
 * (`laura-interventions.ts`) : « non mesuré » n'est JAMAIS un zéro déguisé.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'IL RÉUTILISE PLUTÔT QUE DE RECALCULER (GA-26)
 * ─────────────────────────────────────────────────────────────────────────────
 * `accepted`/`dismissed` délèguent à `surfaceAcceptanceOutcome`, la fonction
 * qui sert déjà le taux d'acceptation par surface — `dismissed` y réunit
 * `refused` ET `closed_unread`, une lecture déjà tranchée qu'il n'y avait
 * aucune raison de retrancher ici. `ignored` reprend le même seuil que
 * `LauraService.streak()` (`IGNORED_AFTER_HOURS`), désormais partagé
 * (`interruption-budget.ts`).
 */

export type LauraAnalyticsMetric = { state: 'measured'; count: number } | { state: 'unmeasured'; reason: string }

export type LauraAnalyticsSummary = {
  offered: LauraAnalyticsMetric
  viewed: LauraAnalyticsMetric
  accepted: LauraAnalyticsMetric
  dismissed: LauraAnalyticsMetric
  ignored: LauraAnalyticsMetric
  converted_to_action: LauraAnalyticsMetric
  false_positive: LauraAnalyticsMetric
  disabled: LauraAnalyticsMetric
}

/** Ce qu'une trace porte, réduit à ce que ce calcul a besoin de lire. */
export type LauraAnalyticsTrace = {
  reaction: string | null
  /** Millisecondes epoch — l'appelant convertit `created_at` (`Date`). */
  created_at: number
}

const VIEWED_UNMEASURED_REASON =
  'aucun accusé de réception ne distingue une carte affichée d’une carte simplement décidée par le serveur (`offered`)'
const CONVERTED_UNMEASURED_REASON =
  'chaque clé du catalogue mène à une action AVAL différente ; aucun suivi par famille ne confirme son achèvement'
const FALSE_POSITIVE_UNMEASURED_REASON =
  'la taxonomie des réactions ne porte que quatre valeurs (acted/ignored/closed_unread/refused) ; « donnée fausse » n’est un geste distinct nulle part'

/**
 * Réduit une liste de traces (et un décompte d'utilisateurs coupés) aux huit
 * noms du §5.3.
 *
 * `disabledUserCount` est transmis tel quel par l'appelant — DÉCOMPTE d'une
 * table différente (`notification_preferences`), pas dérivé des traces : le
 * confondre romprait la parité avec les cinq autres colonnes, qui portent
 * toutes une fenêtre GLISSANTE de traces.
 */
export function computeLauraAnalytics(
  traces: readonly LauraAnalyticsTrace[],
  disabledUserCount: number,
  now: number,
): LauraAnalyticsSummary {
  const cutoff = now - IGNORED_AFTER_HOURS * 60 * 60 * 1000
  let accepted = 0
  let dismissed = 0
  let ignored = 0

  for (const trace of traces) {
    const outcome = surfaceAcceptanceOutcome(trace.reaction)
    if (outcome === 'accepted') accepted += 1
    else if (outcome === 'dismissed') dismissed += 1
    else if (trace.reaction === null && trace.created_at < cutoff) ignored += 1
  }

  return {
    offered: { state: 'measured', count: traces.length },
    viewed: { state: 'unmeasured', reason: VIEWED_UNMEASURED_REASON },
    accepted: { state: 'measured', count: accepted },
    dismissed: { state: 'measured', count: dismissed },
    ignored: { state: 'measured', count: ignored },
    converted_to_action: { state: 'unmeasured', reason: CONVERTED_UNMEASURED_REASON },
    false_positive: { state: 'unmeasured', reason: FALSE_POSITIVE_UNMEASURED_REASON },
    disabled: { state: 'measured', count: disabledUserCount },
  }
}
