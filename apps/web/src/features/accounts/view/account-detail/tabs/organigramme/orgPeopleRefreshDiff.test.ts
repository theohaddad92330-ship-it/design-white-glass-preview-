import { describe, expect, it } from 'vitest'
import { readOrgPeopleRefreshDiff } from './orgPeopleRefreshDiff'

// #2554.1/#2554.2 — l'écran doit pouvoir dire ce qu'une actualisation a
// revérifié, sans réinventer un second parseur du blob que l'API écrit.

describe('readOrgPeopleRefreshDiff', () => {
  it('rend null quand le dossier n’a jamais été actualisé (rien à dire)', () => {
    expect(readOrgPeopleRefreshDiff({})).toBeNull()
    expect(readOrgPeopleRefreshDiff({ org: {} })).toBeNull()
    expect(readOrgPeopleRefreshDiff(null)).toBeNull()
  })

  it('lit les quatre seaux nommés et la date du run', () => {
    const diff = readOrgPeopleRefreshDiff({
      org: {
        peopleRefreshDiff: {
          asOf: '2026-09-18T10:00:00.000Z',
          reverified: [{ personId: 'p-claire', fullName: 'Claire Perrin', kind: 'reverified' }],
          changedPosition: [
            {
              personId: 'p-marc',
              fullName: 'Marc Dubois',
              kind: 'changedPosition',
              previousTitle: 'Achats',
              nextTitle: 'Directeur Achats',
            },
          ],
          new: [],
          notConfirmed: [{ personId: 'p-jean', fullName: 'Jean Petit', kind: 'notConfirmed' }],
        },
      },
    })
    expect(diff?.asOf).toBe('2026-09-18T10:00:00.000Z')
    expect(diff?.reverified).toHaveLength(1)
    expect(diff?.changedPosition[0]).toEqual({
      personId: 'p-marc',
      fullName: 'Marc Dubois',
      kind: 'changedPosition',
      previousTitle: 'Achats',
      nextTitle: 'Directeur Achats',
    })
    expect(diff?.notConfirmed).toHaveLength(1)
  })

  it('écarte une entrée sans personId/fullName plutôt que de l’inventer', () => {
    const diff = readOrgPeopleRefreshDiff({
      org: {
        peopleRefreshDiff: {
          asOf: '2026-09-18T10:00:00.000Z',
          reverified: [
            { personId: 'p-1' },
            { fullName: 'Sans id' },
            { personId: 'p-2', fullName: 'OK', kind: 'reverified' },
          ],
          changedPosition: [],
          new: [],
          notConfirmed: [],
        },
      },
    })
    expect(diff?.reverified).toEqual([{ personId: 'p-2', fullName: 'OK', kind: 'reverified' }])
  })

  // #2318.4 — « nouvelles entités », le cinquième seau, ajouté à ce chantier.
  it('lit les nouvelles entités, et rend [] plutôt que d’en inventer sur un blob antérieur au lot', () => {
    const withEntities = readOrgPeopleRefreshDiff({
      org: {
        peopleRefreshDiff: {
          asOf: '2026-09-18T10:00:00.000Z',
          reverified: [],
          changedPosition: [],
          new: [],
          notConfirmed: [],
          newEntities: [{ entityId: 'e2', name: 'ACME Digital' }, { entityId: '' }, { name: 'sans id' }],
        },
      },
    })
    expect(withEntities?.newEntities).toEqual([{ entityId: 'e2', name: 'ACME Digital' }])

    const legacyBlob = readOrgPeopleRefreshDiff({
      org: {
        peopleRefreshDiff: {
          asOf: '2026-09-18T10:00:00.000Z',
          reverified: [],
          changedPosition: [],
          new: [],
          notConfirmed: [],
        },
      },
    })
    expect(legacyBlob?.newEntities).toEqual([])
  })
})
