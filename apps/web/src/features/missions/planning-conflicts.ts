import { toDayNumber } from './planning'

/**
 * LES CONFLITS DU GANTT — #2194.6, #2194.38, #2194.40, #2194.41, #2194.42.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EST SÉPARÉ DE `planning.ts`
 * ─────────────────────────────────────────────────────────────────────────────
 * `planning.ts` place UNE mission sur UNE frise. Un conflit compare TOUJOURS
 * au moins DEUX missions entre elles (le plus souvent les missions d'UNE
 * personne) — c'est une question différente, avec ses propres règles, et la
 * mélanger au placement aurait fait grossir un fichier déjà dense de raisons
 * sans rapport.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CHAQUE TYPE DE CONFLIT VEUT DIRE, ET CE QU'IL NE PRÉTEND PAS SAVOIR
 * ─────────────────────────────────────────────────────────────────────────────
 *  - `overlap` (#2194.38, chevauchement) — la MÊME personne, deux missions
 *    dont les dates connues se recouvrent. Les deux dates (début ET fin)
 *    doivent être connues des deux côtés : une mission ouverte ne se compare
 *    pas, elle ne PROMET rien au-delà de ce qui est saisi.
 *  - `gap` (#2194.40, trou) — la MÊME personne, deux missions CONSÉCUTIVES
 *    (triées par début) dont les dates connues laissent un intervalle libre.
 *    Ce n'est PAS l'intercontrat général (#2194.7, qui demande le roster
 *    complet des consultants, hors périmètre de cet écran) : c'est un trou
 *    ENTRE deux missions déjà connues de cet écran, rien de plus.
 *  - `unstaffedStart` (#2194.41, démarrage sans consultant) — une mission
 *    ENGAGÉE (statut non terminé) dont le début est déjà passé ou dans la
 *    fenêtre, et dont les affectations sont EXPLICITEMENT vides (`[]`, pas
 *    `null`/`undefined` — une lecture qui a échoué n'est PAS une absence
 *    constatée, même règle que `TimelineRow`, #1371).
 *  - `undated` (#2194.42, mission sans date) — aucune date exploitable.
 *    L'AFFICHAGE existe déjà (#2194.29, bloc nommé sous la frise) ; ce fichier
 *    ne fait que le NOMMER aussi comme un conflit, pour le résumé (#2194.6).
 *  - `overallocation` (#2194.39, surallocation) — la MÊME personne, chargée
 *    au-delà de 100 % AUJOURD'HUI sur ses missions ACTIVES (démarrées, pas
 *    encore finies). Portée délibérément AUJOURD'HUI et non une fenêtre
 *    future : un calcul d'intervalles glissants serait une PROJECTION, que la
 *    doctrine refuse (aucune probabilité, aucun prévisionnel).
 *
 * ⚠️ **Portée délibérée : le PORTEFEUILLE, pas la fenêtre affichée.** Comme
 * {@link "./planning".consultantsAvailableSoon}, ces cinq types se calculent
 * sur les missions ACTIVES du compte, indépendamment de la fenêtre temporelle
 * et des filtres de recherche — un chevauchement ne disparaît pas parce qu'on
 * a changé l'échelle du Gantt de 4 à 6 mois.
 */

export type ConflictAssignment = {
  missionId: string
  assigneeNames: readonly string[]
  startedOn: string | null
  endsOn: string | null
  /** `null`/`undefined` = lecture non aboutie, `[]` = personne affectée —
   *  les deux ne se confondent jamais (#1371). */
  assigneesCount: number | null
  /** #2194.39 — la charge de CHAQUE affectation, pour {@link overallocations}.
   *  `loadPercent: null` = l'affectation existe, sa charge n'est pas connue —
   *  jamais comptée comme 0 (une somme ne porte que sur ce qui EST connu). */
  assigneeLoads: readonly { name: string; loadPercent: number | null }[]
  /** #3547 — `false` pour un forfait encadré (consultants facultatifs). Absent =
   *  attendus : le comportement historique reste celui d'une régie. */
  consultantsExpected?: boolean
}

/** Non exporté à dessein (même règle que `ActiveAssignment`, `planning.ts`) :
 *  seul `detectMissionConflicts` le produit, seul `countConflicts` le
 *  consomme, tous deux dans ce fichier — l'inférence suffit aux appelants. */
type MissionConflict =
  | { kind: 'overlap'; personName: string; missionIds: readonly [string, string] }
  | { kind: 'gap'; personName: string; afterMissionId: string; beforeMissionId: string; gapDays: number }
  | { kind: 'unstaffedStart'; missionId: string }
  | { kind: 'undated'; missionId: string }
  | { kind: 'overallocation'; personName: string; totalPercent: number }

/** Non exportée : seule `countConflicts` la produit, dans ce fichier — même
 *  règle que `MissionConflict` ci-dessus. */
type ConflictCounts = {
  overlap: number
  gap: number
  unstaffedStart: number
  undated: number
  overallocation: number
  total: number
}

/**
 * Chevauchements et trous — #2194.38, #2194.40.
 *
 * ⚠️ Seules les paires CONSÉCUTIVES (triées par début) sont comparées : au-delà
 * de deux missions qui se suivent, un chevauchement entre la 1re et la 3e
 * suppose déjà un chevauchement avec la 2e — le signaler une seconde fois
 * dupliquerait le même fait sous un autre nom.
 */
function overlapsAndGaps(missions: readonly ConflictAssignment[]): MissionConflict[] {
  const byPerson = new Map<string, ConflictAssignment[]>()
  for (const mission of missions) {
    if (mission.startedOn === null || mission.endsOn === null) continue
    for (const name of mission.assigneeNames) {
      const list = byPerson.get(name)
      if (list) list.push(mission)
      else byPerson.set(name, [mission])
    }
  }

  const conflicts: MissionConflict[] = []
  for (const [personName, personMissions] of byPerson) {
    const sorted = [...personMissions].sort((a, b) => {
      const left = toDayNumber(a.startedOn) ?? 0
      const right = toDayNumber(b.startedOn) ?? 0
      return left - right
    })
    for (let i = 0; i < sorted.length - 1; i += 1) {
      const current = sorted[i]
      const next = sorted[i + 1]
      if (!current || !next) continue
      const currentEnd = toDayNumber(current.endsOn)
      const nextStart = toDayNumber(next.startedOn)
      if (currentEnd === null || nextStart === null) continue
      if (nextStart <= currentEnd) {
        conflicts.push({ kind: 'overlap', personName, missionIds: [current.missionId, next.missionId] })
        continue
      }
      const gapDays = nextStart - currentEnd - 1
      if (gapDays >= 1) {
        conflicts.push({
          kind: 'gap',
          personName,
          afterMissionId: current.missionId,
          beforeMissionId: next.missionId,
          gapDays,
        })
      }
    }
  }
  return conflicts
}

/** Démarrage sans consultant — #2194.41. */
function unstaffedStarts(missions: readonly ConflictAssignment[], today: string): MissionConflict[] {
  const todayNumber = toDayNumber(today)
  return missions
    .filter(mission => {
      if (mission.assigneesCount !== 0) return false
      if (mission.consultantsExpected === false) return false
      const started = toDayNumber(mission.startedOn)
      if (started === null || todayNumber === null) return false
      return started <= todayNumber
    })
    .map(mission => ({ kind: 'unstaffedStart' as const, missionId: mission.missionId }))
}

/** Mission sans AUCUNE date — #2194.42 (déjà affichée par #2194.29, ici NOMMÉE
 *  comme conflit pour le résumé #2194.6). */
function undatedMissions(missions: readonly ConflictAssignment[]): MissionConflict[] {
  return missions
    .filter(mission => mission.startedOn === null && mission.endsOn === null)
    .map(mission => ({ kind: 'undated' as const, missionId: mission.missionId }))
}

/**
 * Surallocation — #2194.39.
 *
 * ⚠️ Une charge INCONNUE n'est jamais comptée comme 0 : la somme ne porte que
 * sur les affectations dont `loadPercent` EST connu. Si cette somme dépasse
 * déjà 100, la surallocation est un FAIT — une autre affectation de la même
 * personne à charge non lue ne peut que l'aggraver, jamais l'annuler.
 */
function overallocations(missions: readonly ConflictAssignment[], today: string): MissionConflict[] {
  const todayNumber = toDayNumber(today)
  /* c8 ignore next -- `today` vient de l'horloge du lecteur, toujours lisible */
  if (todayNumber === null) return []

  const byPerson = new Map<string, number>()
  for (const mission of missions) {
    const started = toDayNumber(mission.startedOn)
    if (started === null || started > todayNumber) continue
    const ended = toDayNumber(mission.endsOn)
    if (ended !== null && ended < todayNumber) continue
    for (const assignee of mission.assigneeLoads) {
      if (assignee.loadPercent === null) continue
      byPerson.set(assignee.name, (byPerson.get(assignee.name) ?? 0) + assignee.loadPercent)
    }
  }

  const conflicts: MissionConflict[] = []
  for (const [personName, totalPercent] of byPerson) {
    if (totalPercent > 100) conflicts.push({ kind: 'overallocation', personName, totalPercent })
  }
  return conflicts
}

/** Les cinq types de conflit, calculés une seule fois — #2194.6. */
export function detectMissionConflicts(missions: readonly ConflictAssignment[], today: string): MissionConflict[] {
  return [
    ...overlapsAndGaps(missions),
    ...unstaffedStarts(missions, today),
    ...undatedMissions(missions),
    ...overallocations(missions, today),
  ]
}

/**
 * La surallocation, PAR PERSONNE — #2989.2.
 *
 * `countConflicts` ne rend qu'un COMPTE agrégé pour le résumé de l'écran ; une
 * ligne du Gantt a besoin de savoir QUI est concerné, et de combien — c'est ce
 * que cette fonction expose, sans dupliquer le calcul de {@link overallocations}.
 */
export function overallocatedPercentByPerson(conflicts: readonly MissionConflict[]): ReadonlyMap<string, number> {
  const byPerson = new Map<string, number>()
  for (const conflict of conflicts) {
    if (conflict.kind === 'overallocation') byPerson.set(conflict.personName, conflict.totalPercent)
  }
  return byPerson
}

/**
 * Théo C missions-planning.A8 — LES MISSIONS QUI PORTENT UN CONFLIT, pour la pastille « ! » de la barre.
 *
 * La surallocation n'y est pas : elle a déjà son badge nommé sur la ligne
 * (#2989.2). Un trou désigne la mission qui précède et celle qui suit.
 */
export function conflictedMissionIds(conflicts: readonly MissionConflict[]): ReadonlySet<string> {
  const ids = new Set<string>()
  for (const conflict of conflicts) {
    if (conflict.kind === 'overlap') conflict.missionIds.forEach(id => ids.add(id))
    else if (conflict.kind === 'gap') {
      ids.add(conflict.afterMissionId)
      ids.add(conflict.beforeMissionId)
    } else if (conflict.kind === 'unstaffedStart' || conflict.kind === 'undated') ids.add(conflict.missionId)
  }
  return ids
}

/** Le compte par type, pour un résumé qui ne se présente jamais nu — un total
 *  sans ses axes ne dit pas QUOI regarder en premier. */
export function countConflicts(conflicts: readonly MissionConflict[]): ConflictCounts {
  const counts: ConflictCounts = { overlap: 0, gap: 0, unstaffedStart: 0, undated: 0, overallocation: 0, total: 0 }
  for (const conflict of conflicts) {
    counts[conflict.kind] += 1
    counts.total += 1
  }
  return counts
}
