import { describe, expect, it } from 'vitest'
import { filterByOwner, ownerOptions } from './pipeline-owner-filter'

// Théo C projects-pipeline.R8/N1 — « Tous les responsables » : un sélecteur de responsable sur le pipe.
const rows = [
  { id: 'a', owner_id: 'u1' },
  { id: 'b', owner_id: 'u2' },
  { id: 'c', owner_id: 'u1' },
  { id: 'd', owner_id: null },
]
const names: Record<string, string> = { u1: 'Louis', u2: 'Léa' }
const nameOf = (id: string | null) => (id ? (names[id] ?? null) : null)

describe('pipeline-owner-filter', () => {
  it('sans choix (« tous »), rien n’est filtré — y compris les affaires sans responsable', () => {
    expect(filterByOwner(rows, '')).toHaveLength(4)
  })

  it('un responsable choisi ne garde que ses affaires', () => {
    expect(filterByOwner(rows, 'u1').map(row => row.id)).toEqual(['a', 'c'])
  })

  it('une affaire sans responsable n’est celle de personne : aucun choix ne la garde', () => {
    expect(filterByOwner(rows, 'u2').map(row => row.id)).toEqual(['b'])
  })

  it('les options sont les responsables RÉELS du pipe, nommés, triés, sans doublon', () => {
    expect(ownerOptions(rows, nameOf)).toEqual([
      { value: 'u2', label: 'Léa' },
      { value: 'u1', label: 'Louis' },
    ])
  })

  it('un responsable dont on ne sait pas le nom n’apparaît pas — jamais un identifiant brut', () => {
    expect(ownerOptions([{ owner_id: 'zz' }], nameOf)).toEqual([])
  })
})
