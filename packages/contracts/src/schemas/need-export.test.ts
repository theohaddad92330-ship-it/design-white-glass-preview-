import { describe, expect, it } from 'vitest'
import { NEED_EXPORT_FORMATS, NEED_EXPORT_MAX, needExportRequestSchema } from './need-export.js'

const ID = '11111111-1111-4111-8111-111111111111'

describe('#4016 L11 — la demande d’export de masse des besoins', () => {
  it('accepte une sélection et un format connu', () => {
    expect(needExportRequestSchema.parse({ needIds: [ID], format: 'csv' })).toEqual({ needIds: [ID], format: 'csv' })
    expect(needExportRequestSchema.parse({ needIds: [ID], format: 'json' }).format).toBe('json')
    expect([...NEED_EXPORT_FORMATS]).toEqual(['csv', 'json'])
  })

  it('refuse une sélection vide — un fichier vide se lirait « aucun besoin »', () => {
    expect(() => needExportRequestSchema.parse({ needIds: [], format: 'csv' })).toThrow()
  })

  it('borne la sélection — la même borne que la page du tableau', () => {
    const many = Array.from({ length: NEED_EXPORT_MAX + 1 }, () => ID)
    expect(() => needExportRequestSchema.parse({ needIds: many, format: 'csv' })).toThrow()
    expect(NEED_EXPORT_MAX).toBe(200)
  })

  it('refuse un format inconnu et un champ en trop (strict)', () => {
    expect(() => needExportRequestSchema.parse({ needIds: [ID], format: 'xlsx' })).toThrow()
    expect(() => needExportRequestSchema.parse({ needIds: [ID], format: 'csv', target: 'crm' })).toThrow()
  })

  it('refuse un identifiant qui n’est pas un uuid', () => {
    expect(() => needExportRequestSchema.parse({ needIds: ['abc'], format: 'csv' })).toThrow()
  })
})
