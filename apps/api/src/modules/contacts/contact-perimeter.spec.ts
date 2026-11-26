import { applyContactPerimeter } from './contact-perimeter'

const row = (id: string, entity_id: string | null) => ({ id, entity_id })
const rows = [row('a', 'e-bnp'), row('b', 'e-sg'), row('c', null), row('d', 'e-def'), row('e', 'e-sg')]

describe('applyContactPerimeter (#4996 L4)', () => {
  it('sans zone d’entité : aucun filtre, aucun compteur, ordre inchangé', () => {
    for (const mode of ['mine', 'all'] as const) {
      const out = applyContactPerimeter(rows, { mode, zoneEntityIds: [], defaultEntityIds: ['e-def'] })
      expect(out.contacts.map(r => r.id)).toEqual(['a', 'b', 'c', 'd', 'e'])
      expect(out.outside_perimeter_count).toBeNull()
    }
  })

  it('mine : garde ma zone, les sans-entité et l’entité par défaut ; compte exactement le reste', () => {
    const out = applyContactPerimeter(rows, { mode: 'mine', zoneEntityIds: ['e-sg'], defaultEntityIds: ['e-def'] })
    expect(out.contacts.map(r => r.id)).toEqual(['b', 'e', 'c', 'd'])
    expect(out.outside_perimeter_count).toBe(1)
  })

  it('all : tout le monde, ma zone d’abord, le compteur reste exact', () => {
    const out = applyContactPerimeter(rows, { mode: 'all', zoneEntityIds: ['e-sg'], defaultEntityIds: ['e-def'] })
    expect(out.contacts.map(r => r.id)).toEqual(['b', 'e', 'a', 'c', 'd'])
    expect(out.outside_perimeter_count).toBe(1)
  })

  it('un contact sans entité n’est jamais caché ni compté hors périmètre', () => {
    const out = applyContactPerimeter([row('x', null)], { mode: 'mine', zoneEntityIds: ['e-sg'], defaultEntityIds: [] })
    expect(out.contacts).toHaveLength(1)
    expect(out.outside_perimeter_count).toBe(0)
  })
})
