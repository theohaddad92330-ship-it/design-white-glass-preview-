import { ROUTINE_CATALOG } from './routine-catalog'
import { ROUTINE_VERSION_NOTES, routineVersionNotesSince } from './routine-version-notes'

/**
 * #2916 (#2399.6/.7) — une mise à jour ne modifie JAMAIS silencieusement :
 * toute routine dont la version a avancé porte, pour CHAQUE version, ce qui a
 * changé et ce que devient la configuration déjà posée.
 */
describe('routine-version-notes', () => {
  it('toute version > 1 du catalogue a sa note (aucune mise à jour silencieuse)', () => {
    for (const definition of ROUTINE_CATALOG) {
      for (let version = 2; version <= definition.version; version += 1) {
        const note = (ROUTINE_VERSION_NOTES[definition.key] ?? []).find(n => n.version === version)
        expect({ key: definition.key, version, noted: Boolean(note) }).toEqual({
          key: definition.key,
          version,
          noted: true,
        })
      }
    }
  })

  it('aucune note ne décrit une version que le catalogue ne porte pas', () => {
    for (const [key, notes] of Object.entries(ROUTINE_VERSION_NOTES)) {
      const definition = ROUTINE_CATALOG.find(d => d.key === key)
      expect(definition).toBeDefined()
      for (const note of notes ?? []) {
        expect(note.version).toBeGreaterThan(1)
        expect(note.version).toBeLessThanOrEqual(definition?.version ?? 0)
      }
    }
  })

  it('no_reply_follow_up est en version 2 : le plafond de destinataires (#2205.45) est le vrai changement', () => {
    const definition = ROUTINE_CATALOG.find(d => d.key === 'no_reply_follow_up')
    expect(definition?.version).toBe(2)
    const [note] = routineVersionNotesSince('no_reply_follow_up', 1)
    expect(note?.version).toBe(2)
    expect(note?.changes.fr).toMatch(/destinataires/)
    expect(note?.migration.fr).toMatch(/conserv/)
  })

  it('#2399.7 — les routines dont la fiche a gagné sa condition d\u2019arrêt sont en v2, avec une note qui le dit', () => {
    // #2398.5 — `>= 2` : `mission_ending` est passée en v3 (cascade T-45/T-30/T-15), sa note v2 reste la première.
    const bumped = ROUTINE_CATALOG.filter(d => d.version >= 2 && d.key !== 'no_reply_follow_up')
    expect(bumped.length).toBeGreaterThanOrEqual(38)
    for (const definition of bumped) {
      expect(definition.stopCondition).not.toBeNull()
      const [note] = routineVersionNotesSince(definition.key, 1)
      expect(note?.version).toBe(2)
      expect(note?.changes.fr).toMatch(/condition d’arrêt/)
      expect(note?.migration.fr).toMatch(/conserv/)
      expect(note?.changes.fr).not.toMatch(/\bvous\b/i)
    }
  })

  it('ne rend que les versions POSTÉRIEURES à celle déjà vue', () => {
    expect(routineVersionNotesSince('no_reply_follow_up', 2)).toEqual([])
    expect(routineVersionNotesSince('daily_briefing', 2)).toEqual([])
  })
})

// #2916.7 — « Ce qui change en v2 » est un DIFF par champ modifié (ancienne ↔ nouvelle valeur), pas une note.
describe('routine-version-notes — diff par champ (#2916.7)', () => {
  it('condition d’arrêt : avant null (jamais renseignée), après = la valeur de la fiche', () => {
    const definition = ROUTINE_CATALOG.find(d => d.key === 'daily_briefing')
    const [note] = routineVersionNotesSince('daily_briefing', 1, definition)
    expect(note?.fieldChanges).toEqual([{ field: 'stopCondition', before: null, after: definition?.stopCondition }])
    expect(note?.fieldChanges?.[0]?.after).not.toBeNull()
  })

  it('une fiche qui ne nomme toujours pas sa condition : aucune ligne de diff, jamais un après vide', () => {
    const definition = ROUTINE_CATALOG.find(d => d.key === 'daily_briefing')
    const [note] = routineVersionNotesSince('daily_briefing', 1, { ...definition!, stopCondition: null })
    expect(note?.fieldChanges ?? []).toEqual([])
  })

  it('relances par passage : de « un seul brouillon » à « de 1 à 5 »', () => {
    const [note] = routineVersionNotesSince('no_reply_follow_up', 1)
    const change = note?.fieldChanges?.[0]
    expect(change?.field).toBe('maxItemsPerRun')
    expect(change?.before?.fr).toMatch(/un seul/i)
    expect(change?.after?.fr).toMatch(/1 à 5/)
  })
})
