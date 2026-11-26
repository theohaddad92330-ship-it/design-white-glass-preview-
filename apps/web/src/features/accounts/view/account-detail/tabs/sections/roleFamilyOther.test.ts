import { describe, expect, it } from 'vitest'
import { otherRoleTitleDetail, splitOtherRoleFamily } from './roleFamilyOther'

describe('K.3 / #4325 — « Autre » n’est pas un métier', () => {
  it('sépare « Autre » des familles métier et garde son nombre', () => {
    const { families, other } = splitOtherRoleFamily([
      { family: 'Autre', persons: 225 },
      { family: 'Direction / Conseil', persons: 106 },
    ])
    expect(families).toEqual([{ family: 'Direction / Conseil', persons: 106 }])
    expect(other).toEqual({ persons: 225 })
  })

  it('sait dire NON : sans « Autre », rien n’est séparé', () => {
    expect(splitOtherRoleFamily([{ family: 'Data', persons: 4 }]).other).toBeNull()
  })

  it('détaille les intitulés que aucun métier ne range, regroupés et comptés', () => {
    const detail = otherRoleTitleDetail([
      { family: null, title: 'Chargé de mission' },
      { family: null, title: 'chargé de  mission' },
      { family: null, title: 'Responsable QHSE' },
      { family: 'Autre', title: 'Juriste' },
    ])
    expect(detail).toEqual([
      { title: 'Chargé de mission', count: 2 },
      { title: 'Juriste', count: 1 },
      { title: 'Responsable QHSE', count: 1 },
    ])
  })

  it('sait dire NON : un contact rangé dans un métier (famille ou intitulé) ou sans intitulé n’a pas de ligne', () => {
    expect(
      otherRoleTitleDetail([
        { family: 'IT', title: 'Chargé de mission' },
        { family: null, title: 'RSSI' },
        { family: null, title: '   ' },
        { family: null, title: null },
      ]),
    ).toEqual([])
  })
})
