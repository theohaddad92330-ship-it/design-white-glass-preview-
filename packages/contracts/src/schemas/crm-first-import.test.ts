import { describe, expect, it } from 'vitest'
import { crmFirstImportObjectSchema, crmFirstImportStateSchema } from './crm-first-import.js'

describe('crmFirstImportStateSchema', () => {
  it('accepte une reprise en cours avec un objet non mesuré (null, jamais 0)', () => {
    const parsed = crmFirstImportStateSchema.parse({
      provider: 'pipedrive',
      state: 'running',
      startedAt: '2026-10-19T08:00:00.000Z',
      finishedAt: null,
      message: null,
      reconnectNeeded: false,
      objects: [{ object: 'contacts', status: 'running', count: null, conflicts: null, truncated: false, error: null }],
    })
    expect(parsed.objects[0]?.count).toBeNull()
  })

  it('refuse un état inconnu', () => {
    expect(() => crmFirstImportStateSchema.parse({ provider: 'attio', state: 'spinning', objects: [] })).toThrow()
  })
})

// #4290.19 — rejouée sur une base déjà écrite, une reprise dit ce qu'elle a RECONNU, pas seulement ce qu'elle a créé.
describe('crmFirstImportObjectSchema — créées / reconnues (#4290.19)', () => {
  const base = { object: 'accounts', status: 'done', count: 12, conflicts: 0, truncated: false, error: null } as const

  it('porte les fiches créées et les fiches reconnues', () => {
    const parsed = crmFirstImportObjectSchema.parse({ ...base, created: 0, recognized: 12 })
    expect(parsed).toMatchObject({ created: 0, recognized: 12 })
  })

  it('une reprise d’avant le compteur (sans les champs) reste lisible — absent, jamais 0', () => {
    const parsed = crmFirstImportObjectSchema.parse(base)
    expect(parsed.created).toBeUndefined()
    expect(parsed.recognized).toBeUndefined()
  })

  it('refuse un compte négatif', () => {
    expect(() => crmFirstImportObjectSchema.parse({ ...base, created: -1, recognized: 0 })).toThrow()
  })
})
