import { describe, expect, it } from 'vitest'
import { invalidBlockTableShape } from './reply-blocks.js'

// #3903 — « Plan d'actions commercial » rendu en liste à puces (0 <table>) : un bloc
// `file_export` refusé par le contrat strict doit rester un TABLEAU.
describe('invalidBlockTableShape (#3903)', () => {
  const columns = ['Geste', 'Compte', 'Sens', 'Pourquoi', 'Source et date']

  it('reconnaît les lignes `{ cells }` d’un bloc refusé (neuf colonnes : au-dessus du contrat)', () => {
    const shape = invalidBlockTableShape({
      type: 'file_export',
      title: 'Plan d’actions commercial',
      columns,
      rows: [{ cells: ['Relancer', 'Thales', 'Sortant', 'Sans réponse', null] }],
    })
    expect(shape?.columns).toEqual(columns)
    expect(shape?.rows[0]?.cells).toEqual(['Relancer', 'Thales', 'Sortant', 'Sans réponse', null])
  })

  it('reconnaît aussi une ligne écrite comme simple tableau de cellules', () => {
    const shape = invalidBlockTableShape({
      type: 'file_export',
      columns,
      rows: [['Répondre', 'SNCF', 'Entrant', 'Le client a écrit en dernier', '2026-09-01']],
    })
    expect(shape?.rows[0]?.cells).toHaveLength(5)
    expect(shape?.rows[0]?.cells[1]).toBe('SNCF')
  })

  // sait dire NON : ce qui n'est pas un tableau reste aplati, jamais une table inventée
  it('refuse une forme qui n’est pas un tableau', () => {
    expect(invalidBlockTableShape({ type: 'summary', columns, rows: [] })).toBeNull()
    expect(invalidBlockTableShape({ type: 'file_export', columns, rows: [{ cells: [{ a: 1 }] }] })).toBeNull()
  })
})
