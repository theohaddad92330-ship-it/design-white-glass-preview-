import { describe, expect, it } from 'vitest'
import {
  conflictedMissionIds,
  countConflicts,
  detectMissionConflicts,
  overallocatedPercentByPerson,
  type ConflictAssignment,
} from './planning-conflicts'

const today = '2026-09-04'

function assignment(over: Partial<ConflictAssignment> = {}): ConflictAssignment {
  return {
    missionId: 'm-1',
    assigneeNames: ['Léa Kaczmarek'],
    startedOn: '2026-08-01',
    endsOn: '2026-09-30',
    assigneesCount: 1,
    // Vide par défaut, à dessein : les tests d'`overlap`/`gap`/`unstaffedStart`
    // /`undated` ci-dessous ne portent pas sur la charge, et un défaut non vide
    // ferait apparaître une surallocation accidentelle dès que deux fixtures du
    // même nom se chevauchent aujourd'hui. `overallocations`, plus bas, pose la
    // sienne explicitement sur chaque fixture qu'elle exerce.
    assigneeLoads: [],
    ...over,
  }
}

describe('detectMissionConflicts — chevauchement (#2194.38)', () => {
  it('signale un chevauchement quand la mission suivante démarre AVANT la fin de la précédente', () => {
    const conflicts = detectMissionConflicts(
      [
        assignment({ missionId: 'a', startedOn: '2026-08-01', endsOn: '2026-09-10' }),
        assignment({ missionId: 'b', startedOn: '2026-09-05', endsOn: '2026-10-01' }),
      ],
      today,
    )
    expect(conflicts).toContainEqual({ kind: 'overlap', personName: 'Léa Kaczmarek', missionIds: ['a', 'b'] })
  })

  it('ne signale RIEN quand deux missions se suivent bout à bout, sans se chevaucher', () => {
    const conflicts = detectMissionConflicts(
      [
        assignment({ missionId: 'a', startedOn: '2026-08-01', endsOn: '2026-09-10' }),
        assignment({ missionId: 'b', startedOn: '2026-09-11', endsOn: '2026-10-01' }),
      ],
      today,
    )
    expect(conflicts.filter(c => c.kind === 'overlap')).toHaveLength(0)
    expect(conflicts.filter(c => c.kind === 'gap')).toHaveLength(0)
  })

  it('ne compare jamais deux personnes DIFFÉRENTES entre elles', () => {
    const conflicts = detectMissionConflicts(
      [
        assignment({ missionId: 'a', assigneeNames: ['Léa Kaczmarek'], startedOn: '2026-08-01', endsOn: '2026-09-10' }),
        assignment({ missionId: 'b', assigneeNames: ['Sam Bertrand'], startedOn: '2026-08-05', endsOn: '2026-10-01' }),
      ],
      today,
    )
    expect(conflicts.filter(c => c.kind === 'overlap' || c.kind === 'gap')).toHaveLength(0)
  })

  it('ignore une mission dont une date est absente — elle ne se compare pas', () => {
    const conflicts = detectMissionConflicts(
      [
        assignment({ missionId: 'a', startedOn: '2026-08-01', endsOn: null }),
        assignment({ missionId: 'b', startedOn: '2026-09-05', endsOn: '2026-10-01' }),
      ],
      today,
    )
    expect(conflicts.filter(c => c.kind === 'overlap' || c.kind === 'gap')).toHaveLength(0)
  })
})

describe('detectMissionConflicts — trou (#2194.40)', () => {
  it('signale un trou entre deux missions consécutives de la même personne', () => {
    const conflicts = detectMissionConflicts(
      [
        assignment({ missionId: 'a', startedOn: '2026-08-01', endsOn: '2026-09-10' }),
        assignment({ missionId: 'b', startedOn: '2026-09-15', endsOn: '2026-10-01' }),
      ],
      today,
    )
    // 11, 12, 13, 14 septembre : 4 jours libres.
    expect(conflicts).toContainEqual({
      kind: 'gap',
      personName: 'Léa Kaczmarek',
      afterMissionId: 'a',
      beforeMissionId: 'b',
      gapDays: 4,
    })
  })
})

describe('detectMissionConflicts — démarrage sans consultant (#2194.41)', () => {
  it('signale une mission déjà démarrée SANS AUCUN consultant affecté', () => {
    const conflicts = detectMissionConflicts(
      [assignment({ missionId: 'a', assigneeNames: [], assigneesCount: 0, startedOn: '2026-09-01', endsOn: null })],
      today,
    )
    expect(conflicts).toContainEqual({ kind: 'unstaffedStart', missionId: 'a' })
  })

  it('#3547 — ne signale RIEN sur un forfait encadré : il n’attend pas de consultant', () => {
    const conflicts = detectMissionConflicts(
      [
        assignment({
          missionId: 'a',
          assigneeNames: [],
          assigneesCount: 0,
          startedOn: '2026-09-01',
          endsOn: null,
          consultantsExpected: false,
        }),
      ],
      today,
    )
    expect(conflicts.filter(c => c.kind === 'unstaffedStart')).toHaveLength(0)
  })

  it('ne signale RIEN sur une mission qui n’a pas encore démarré', () => {
    const conflicts = detectMissionConflicts(
      [assignment({ missionId: 'a', assigneeNames: [], assigneesCount: 0, startedOn: '2026-12-01', endsOn: null })],
      today,
    )
    expect(conflicts.filter(c => c.kind === 'unstaffedStart')).toHaveLength(0)
  })

  it('ne confond JAMAIS `null` (lecture non aboutie) avec `[]` (personne affectée)', () => {
    const conflicts = detectMissionConflicts(
      [assignment({ missionId: 'a', assigneeNames: [], assigneesCount: null, startedOn: '2026-09-01', endsOn: null })],
      today,
    )
    expect(conflicts.filter(c => c.kind === 'unstaffedStart')).toHaveLength(0)
  })
})

describe('detectMissionConflicts — mission sans date (#2194.42)', () => {
  it('signale une mission sans AUCUNE date', () => {
    const conflicts = detectMissionConflicts([assignment({ missionId: 'a', startedOn: null, endsOn: null })], today)
    expect(conflicts).toContainEqual({ kind: 'undated', missionId: 'a' })
  })

  it('ne signale rien sur une mission qui a AU MOINS une date', () => {
    const conflicts = detectMissionConflicts(
      [assignment({ missionId: 'a', startedOn: '2026-08-01', endsOn: null })],
      today,
    )
    expect(conflicts.filter(c => c.kind === 'undated')).toHaveLength(0)
  })
})

describe('countConflicts (#2194.6)', () => {
  it('compte chaque type, et le TOTAL — jamais un score nu sans ses axes', () => {
    const conflicts = detectMissionConflicts(
      [
        assignment({ missionId: 'a', startedOn: '2026-08-01', endsOn: '2026-09-10' }),
        assignment({ missionId: 'b', startedOn: '2026-09-05', endsOn: '2026-10-01' }),
        assignment({ missionId: 'c', assigneeNames: [], assigneesCount: 0, startedOn: '2026-09-01', endsOn: null }),
        assignment({ missionId: 'd', startedOn: null, endsOn: null }),
      ],
      today,
    )
    expect(countConflicts(conflicts)).toEqual({
      overlap: 1,
      gap: 0,
      unstaffedStart: 1,
      undated: 1,
      overallocation: 0,
      total: 3,
    })
  })
})

describe('detectMissionConflicts — surallocation (#2194.39)', () => {
  it('signale une personne chargée au-delà de 100 % AUJOURD’HUI sur ses missions actives', () => {
    const conflicts = detectMissionConflicts(
      [
        assignment({
          missionId: 'a',
          startedOn: '2026-08-01',
          endsOn: '2026-10-01',
          assigneeLoads: [{ name: 'Léa Kaczmarek', loadPercent: 60 }],
        }),
        assignment({
          missionId: 'b',
          startedOn: '2026-08-15',
          endsOn: '2026-09-30',
          assigneeLoads: [{ name: 'Léa Kaczmarek', loadPercent: 70 }],
        }),
      ],
      today,
    )
    expect(conflicts).toContainEqual({ kind: 'overallocation', personName: 'Léa Kaczmarek', totalPercent: 130 })
  })

  it('ne signale RIEN à exactement 100 % — la charge PLEINE n’est pas une surallocation', () => {
    const conflicts = detectMissionConflicts(
      [assignment({ missionId: 'a', assigneeLoads: [{ name: 'Léa Kaczmarek', loadPercent: 100 }] })],
      today,
    )
    expect(conflicts.filter(c => c.kind === 'overallocation')).toHaveLength(0)
  })

  it('ignore une mission qui n’est plus ACTIVE aujourd’hui — déjà terminée', () => {
    const conflicts = detectMissionConflicts(
      [
        assignment({
          missionId: 'a',
          startedOn: '2026-06-01',
          endsOn: '2026-08-01',
          assigneeLoads: [{ name: 'Léa Kaczmarek', loadPercent: 80 }],
        }),
        assignment({
          missionId: 'b',
          startedOn: '2026-08-15',
          endsOn: '2026-10-01',
          assigneeLoads: [{ name: 'Léa Kaczmarek', loadPercent: 60 }],
        }),
      ],
      today,
    )
    expect(conflicts.filter(c => c.kind === 'overallocation')).toHaveLength(0)
  })

  it('ne compte JAMAIS une charge INCONNUE comme 0 — mais la somme des charges CONNUES suffit déjà', () => {
    const conflicts = detectMissionConflicts(
      [
        assignment({
          missionId: 'a',
          assigneeLoads: [{ name: 'Léa Kaczmarek', loadPercent: 120 }],
        }),
        assignment({
          missionId: 'b',
          assigneeLoads: [{ name: 'Léa Kaczmarek', loadPercent: null }],
        }),
      ],
      today,
    )
    // 120, jamais 120 + 0 : la charge inconnue de « b » ne participe pas à la
    // somme, mais celle de « a » seule dépasse déjà 100.
    expect(conflicts).toContainEqual({ kind: 'overallocation', personName: 'Léa Kaczmarek', totalPercent: 120 })
  })

  it('ne compare jamais deux personnes DIFFÉRENTES — chacune sa propre somme', () => {
    const conflicts = detectMissionConflicts(
      [
        assignment({
          missionId: 'a',
          assigneeNames: ['Léa Kaczmarek'],
          assigneeLoads: [{ name: 'Léa Kaczmarek', loadPercent: 60 }],
        }),
        assignment({
          missionId: 'b',
          assigneeNames: ['Sam Bertrand'],
          assigneeLoads: [{ name: 'Sam Bertrand', loadPercent: 60 }],
        }),
      ],
      today,
    )
    expect(conflicts.filter(c => c.kind === 'overallocation')).toHaveLength(0)
  })
})

describe('overallocatedPercentByPerson (#2989.2)', () => {
  it('donne le total PAR PERSONNE, pour un badge sur SA ligne', () => {
    const conflicts = detectMissionConflicts(
      [
        assignment({
          missionId: 'a',
          assigneeNames: ['Léa Kaczmarek'],
          assigneeLoads: [{ name: 'Léa Kaczmarek', loadPercent: 60 }],
        }),
        assignment({
          missionId: 'b',
          assigneeNames: ['Léa Kaczmarek'],
          assigneeLoads: [{ name: 'Léa Kaczmarek', loadPercent: 70 }],
        }),
      ],
      today,
    )
    const byPerson = overallocatedPercentByPerson(conflicts)
    expect(byPerson.get('Léa Kaczmarek')).toBe(130)
  })

  it('ne nomme AUCUNE personne quand personne n’est suralloué', () => {
    const conflicts = detectMissionConflicts(
      [assignment({ missionId: 'a', assigneeLoads: [{ name: 'Léa Kaczmarek', loadPercent: 60 }] })],
      today,
    )
    expect(overallocatedPercentByPerson(conflicts).size).toBe(0)
  })
})

// Théo C missions-planning.A8 — la pastille « ! » sur la barre : quelles missions portent un conflit.
describe('conflictedMissionIds', () => {
  it('nomme les deux missions d’un chevauchement', () => {
    const conflicts = detectMissionConflicts(
      [
        assignment({ missionId: 'a', startedOn: '2026-08-01', endsOn: '2026-09-30' }),
        assignment({ missionId: 'b', startedOn: '2026-09-15', endsOn: '2026-12-31' }),
      ],
      today,
    )
    expect([...conflictedMissionIds(conflicts)].sort()).toEqual(['a', 'b'])
  })

  it('nomme la mission d’un démarrage sans consultant et celle d’une mission sans date', () => {
    const conflicts = detectMissionConflicts(
      [
        assignment({ missionId: 'u', startedOn: '2026-09-01', endsOn: null, assigneesCount: 0, assigneeNames: [] }),
        assignment({ missionId: 'd', startedOn: null, endsOn: null, assigneeNames: ['Autre Personne'] }),
      ],
      today,
    )
    expect(conflictedMissionIds(conflicts).has('u')).toBe(true)
    expect(conflictedMissionIds(conflicts).has('d')).toBe(true)
  })

  it('ne marque aucune mission quand rien ne se chevauche', () => {
    const conflicts = detectMissionConflicts([assignment({ missionId: 'a' })], today)
    expect(conflictedMissionIds(conflicts).size).toBe(0)
  })
})
