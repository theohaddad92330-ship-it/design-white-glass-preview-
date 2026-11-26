import { describe, expect, it } from 'vitest'
import { createMissionExpenseSchema, missionExpenseSchema, updateMissionExpenseSchema } from './mission-expense.js'

const VALID = {
  id: '00000000-0000-4000-8000-000000000001',
  missionId: '00000000-0000-4000-8000-000000000002',
  label: 'Billets de train',
  amountCents: 12_000,
  expenseDate: '2026-08-15',
  enteredByUserId: '00000000-0000-4000-8000-000000000003',
  source: 'human',
  createdAt: '2026-08-15T09:00:00.000Z',
  updatedAt: '2026-08-15T09:00:00.000Z',
}

describe('missionExpenseSchema', () => {
  it('accepte une ligne valide', () => {
    expect(missionExpenseSchema.parse(VALID)).toMatchObject({ label: 'Billets de train', amountCents: 12_000 })
  })

  it('refuse un montant à zéro — une ligne de frais à 0 ne veut rien dire', () => {
    expect(() => missionExpenseSchema.parse({ ...VALID, amountCents: 0 })).toThrow()
  })

  it('refuse un montant négatif — un avoir n’est pas une dépense', () => {
    expect(() => missionExpenseSchema.parse({ ...VALID, amountCents: -100 })).toThrow()
  })

  it('accepte les quatre sources déjà en place dans le dépôt (`FieldSource`)', () => {
    for (const source of ['human', 'connector', 'pipeline', 'model']) {
      expect(missionExpenseSchema.parse({ ...VALID, source }).source).toBe(source)
    }
  })

  it('refuse une source qui n’existe pas dans le vocabulaire déjà en place', () => {
    expect(() => missionExpenseSchema.parse({ ...VALID, source: 'imported' })).toThrow()
  })
})

describe('createMissionExpenseSchema', () => {
  it('accepte le strict minimum', () => {
    const parsed = createMissionExpenseSchema.parse({
      label: 'Hôtel',
      amountCents: 8_500,
      expenseDate: '2026-08-20',
    })
    expect(parsed.amountCents).toBe(8_500)
  })

  it('refuse un champ hors contrat — `.strict()`', () => {
    expect(() =>
      createMissionExpenseSchema.parse({
        label: 'Hôtel',
        amountCents: 8_500,
        expenseDate: '2026-08-20',
        source: 'human',
      }),
    ).toThrow()
  })

  it('recadre un libellé fait uniquement d’espaces', () => {
    expect(() =>
      createMissionExpenseSchema.parse({ label: '   ', amountCents: 1_000, expenseDate: '2026-08-20' }),
    ).toThrow()
  })
})

describe('updateMissionExpenseSchema', () => {
  it('accepte un objet vide — rien ne change', () => {
    expect(updateMissionExpenseSchema.parse({})).toEqual({})
  })

  it('accepte une édition partielle du seul montant', () => {
    expect(updateMissionExpenseSchema.parse({ amountCents: 5_000 })).toEqual({ amountCents: 5_000 })
  })
})
