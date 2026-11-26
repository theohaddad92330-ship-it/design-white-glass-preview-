import { isWithinDaysFromToday, SOON_WINDOW_DAYS, toDayNumber } from './planning'

/** Ce que les tuiles et les cartes d'échéance lisent d'une mission — jamais l'entité complète. */
export type DeadlineMission = {
  id: string
  label: string
  accountName: string | null
  personNames: readonly string[]
  startedOn: string | null
  endsOn: string | null
}

type DeadlineTiles = {
  /** Missions en cours ou à venir dans le portefeuille affiché. */
  toAccompany: number
  /** Fin prévue entre aujourd'hui et J+30. */
  endingSoon: number
  /** Démarrage prévu strictement après aujourd'hui, sous 30 jours. */
  starting: number
  /** Aucune fin saisie : jamais une date supposée. */
  endUnset: number
}

/**
 * Théo C missions-planning.R2 — LES QUATRE TUILES D'ÉCHÉANCE, SANS MONTANT.
 *
 * ⚠️ Une date absente ou illisible n'est JAMAIS « bientôt » (même règle que
 * `isWithinDaysFromToday`) : la tuile « Fins non renseignées » compte les
 * absences, elle ne les range pas dans une autre.
 */
export function deadlineTiles(missions: readonly DeadlineMission[], today: string): DeadlineTiles {
  return {
    toAccompany: missions.length,
    endingSoon: missions.filter(mission => isWithinDaysFromToday(mission.endsOn, today, SOON_WINDOW_DAYS)).length,
    starting: missions.filter(mission => startsAfterToday(mission, today)).length,
    endUnset: missions.filter(mission => toDayNumber(mission.endsOn) === null).length,
  }
}

type DeadlineCard = {
  missionId: string
  kind: 'ending' | 'starting'
  label: string
  accountName: string | null
  personNames: readonly string[]
  /** La date de l'échéance (fin ou démarrage), ISO. */
  date: string
  daysUntil: number
}

/**
 * Théo C missions-planning.N1 — « LES ÉCHÉANCES À PRÉPARER ».
 *
 * Les échéances du planning, pas un deuxième gestionnaire de tâches : la carte
 * nomme l'échéance et mène à l'action, elle ne porte aucun état de tâche.
 */
export function deadlineCards(missions: readonly DeadlineMission[], today: string): DeadlineCard[] {
  const base = toDayNumber(today)
  if (base === null) return []
  const cards: DeadlineCard[] = []
  for (const mission of missions) {
    const startDay = toDayNumber(mission.startedOn)
    if (mission.startedOn && startDay !== null && startsAfterToday(mission, today)) {
      cards.push(card(mission, 'starting', mission.startedOn, startDay - base))
    }
    const endDay = toDayNumber(mission.endsOn)
    if (mission.endsOn && endDay !== null && isWithinDaysFromToday(mission.endsOn, today, SOON_WINDOW_DAYS)) {
      cards.push(card(mission, 'ending', mission.endsOn, endDay - base))
    }
  }
  // Ordre stable : le plus proche d'abord, un démarrage avant une fin à égalité.
  return cards.sort((a, b) => a.daysUntil - b.daysUntil)
}

function card(mission: DeadlineMission, kind: DeadlineCard['kind'], date: string, daysUntil: number): DeadlineCard {
  return {
    missionId: mission.id,
    kind,
    label: mission.label,
    accountName: mission.accountName,
    personNames: mission.personNames,
    date,
    daysUntil,
  }
}

function startsAfterToday(mission: DeadlineMission, today: string): boolean {
  const start = toDayNumber(mission.startedOn)
  const base = toDayNumber(today)
  if (start === null || base === null) return false
  return start > base && start - base <= SOON_WINDOW_DAYS
}
