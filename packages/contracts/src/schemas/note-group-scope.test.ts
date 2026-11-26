import { describe, expect, it } from 'vitest'
import { createNoteSchema, noteSchema, updateNoteSchema } from './note.js'

const ACCOUNT = '11111111-1111-4111-8111-111111111111'
const SIBLING = '22222222-2222-4222-8222-222222222222'

// #3895 — « note achats » qui vaut pour une autre entité du même groupe.
describe('#3895 — portée entité du groupe d’une note', () => {
  it('une note de compte peut valoir aussi pour d’autres entités du groupe', () => {
    const parsed = createNoteSchema.parse({
      entityType: 'account',
      entityId: ACCOUNT,
      body: 'Grille achats : 3 devis, 45 jours',
      alsoAppliesToAccountIds: [SIBLING],
    })
    expect(parsed.alsoAppliesToAccountIds).toEqual([SIBLING])
  })

  it('sans portée déclarée, la note reste celle de son compte (rien d’inféré)', () => {
    const parsed = createNoteSchema.parse({ entityType: 'account', entityId: ACCOUNT, body: 'x' })
    expect(parsed.alsoAppliesToAccountIds).toBeUndefined()
  })

  it('sait dire NON : un contact ne porte pas de portée de groupe', () => {
    const result = createNoteSchema.safeParse({
      entityType: 'contact',
      entityId: ACCOUNT,
      body: 'x',
      alsoAppliesToAccountIds: [SIBLING],
    })
    expect(result.success).toBe(false)
  })

  it('sait dire NON : ni doublon, ni le compte lui-même, ni plus de vingt entités', () => {
    const base = { entityType: 'account', entityId: ACCOUNT, body: 'x' }
    expect(createNoteSchema.safeParse({ ...base, alsoAppliesToAccountIds: [SIBLING, SIBLING] }).success).toBe(false)
    expect(createNoteSchema.safeParse({ ...base, alsoAppliesToAccountIds: [ACCOUNT] }).success).toBe(false)
    const many = Array.from({ length: 21 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`)
    expect(createNoteSchema.safeParse({ ...base, alsoAppliesToAccountIds: many }).success).toBe(false)
  })

  it('la modification peut changer la portée seule, et la vider', () => {
    expect(updateNoteSchema.safeParse({ alsoAppliesToAccountIds: [SIBLING] }).success).toBe(true)
    expect(updateNoteSchema.safeParse({ alsoAppliesToAccountIds: [] }).success).toBe(true)
  })

  it('la note servie nomme sa portée et, si elle vient d’une autre entité, son origine', () => {
    const wire = noteSchema.parse({
      id: ACCOUNT,
      entityType: 'account',
      entityId: SIBLING,
      body: 'x',
      authorId: null,
      authorName: null,
      pinned: false,
      createdAt: '2026-10-11T00:00:00.000Z',
      updatedAt: '2026-10-11T00:00:00.000Z',
      alsoAppliesTo: [{ id: ACCOUNT, name: 'Sanofi Pasteur' }],
      inheritedFrom: { id: SIBLING, name: 'Sanofi' },
    })
    expect(wire.inheritedFrom?.name).toBe('Sanofi')
  })
})
