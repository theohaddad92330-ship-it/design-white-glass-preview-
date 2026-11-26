import type { RoutineView } from '@bellum/contracts'

/**
 * Dire QUAND une automatisation tourne, sans jamais annoncer une date.
 *
 * La tentation était d'afficher « prochaine exécution : demain 08:30 ». On ne le
 * fait pas, et c'est délibéré : le calcul de la prochaine occurrence dépend du
 * fuseau de l'abonnement, du passage à l'heure d'été, des cadences qui tombent
 * sur le premier jour OUVRÉ, et il vit côté serveur (`isRoutineDue`). Le
 * recopier ici en produirait une seconde version, qui divergerait — et une date
 * fausse dans l'écran où l'on vérifie qu'une relance va partir est pire que pas
 * de date du tout.
 *
 * On affiche donc la RÈGLE (« tous les jours ouvrés à 8 h, heure de Paris »),
 * qui est vraie sans calcul, et la DERNIÈRE exécution, qui est un fait.
 */

type ScheduleDescriptor = {
  /** Clé i18n dans l'espace `actions`, sous `schedule.` */
  key: string
  params: { time: string; zone: string; weekday?: number }
}

/** `8` → `08:00`. Les minutes ne sont pas réglables : la cadence porte l'heure,
 *  pas la minute. Écrire `8 h` sans zéro donnerait une colonne bancale. */
export function formatRoutineHour(hour: number): string {
  const safe = Number.isFinite(hour) ? Math.max(0, Math.min(23, Math.trunc(hour))) : 0
  return `${String(safe).padStart(2, '0')}:00`
}

/**
 * La règle d'exécution d'une routine, en une clé traduisible.
 *
 * `continuous` est le cas qui mérite l'attention : ces routines sont attachées à
 * un OBJET (un rendez-vous, une annulation) et non à une heure. Leur donner une
 * heure d'affichage laisserait croire qu'elles ne passent qu'une fois par jour,
 * alors qu'elles regardent à chaque balayage.
 */
export function describeSchedule(routine: RoutineView): ScheduleDescriptor {
  const { definition, subscription } = routine
  const base = { time: formatRoutineHour(subscription.hour), zone: subscription.timeZone }
  switch (definition.cadence) {
    case 'continuous':
      return { key: 'schedule.continuous', params: base }
    case 'weekly':
      return { key: 'schedule.weekly', params: { ...base, weekday: subscription.weekday ?? 1 } }
    case 'weekdays':
      return { key: 'schedule.weekdays', params: base }
    case 'monthly':
      return { key: 'schedule.monthly', params: base }
    case 'quarterly':
      return { key: 'schedule.quarterly', params: base }
    default:
      return { key: 'schedule.daily', params: base }
  }
}

/**
 * Les routines qui vont RÉELLEMENT tourner, dans l'ordre où on veut les lire.
 *
 * Une routine désactivée n'est pas « planifiée » — l'afficher dans cet onglet
 * ferait croire qu'elle va passer. Une routine activée dont la capacité manque
 * (pas de messagerie branchée, pas d'ERP) est GARDÉE mais signalée : la retirer
 * la rendrait invisible, et personne ne comprendrait pourquoi le brief du matin
 * n'arrive jamais.
 */
export function partitionScheduled(routines: readonly RoutineView[]): {
  active: RoutineView[]
  blocked: RoutineView[]
} {
  const enabled = routines.filter(routine => routine.subscription.enabled)
  return {
    active: enabled.filter(routine => routine.blockers.length === 0),
    blocked: enabled.filter(routine => routine.blockers.length > 0),
  }
}
