import { describe, expect, it } from 'vitest'
import { createNeedStepSchema, needStepSchema, updateNeedStepSchema, NEED_STEP_STATUSES } from './need-step.js'

const STEP = {
  id: '11111111-1111-4111-8111-111111111111',
  needId: '22222222-2222-4222-8222-222222222222',
  label: 'Valider la short list des profils',
  status: 'todo' as const,
  position: 0,
  doneAt: null,
  createdAt: '2026-05-20T09:00:00.000Z',
  updatedAt: '2026-05-20T09:00:00.000Z',
}

describe('needStepSchema', () => {
  it('accepte une étape non commencée, sans date de complétion', () => {
    expect(needStepSchema.parse(STEP)).toEqual(STEP)
  })

  it('accepte une étape cochée, AVEC sa date — jamais une date inventée sur une étape non terminée', () => {
    const done = { ...STEP, status: 'done' as const, doneAt: '2026-05-21T10:00:00.000Z' }
    expect(needStepSchema.parse(done)).toEqual(done)
  })

  it('porte trois statuts, pas un booléen — « à faire » et « en attente » sont deux choses distinctes', () => {
    expect(NEED_STEP_STATUSES).toEqual(['todo', 'pending', 'done'])
  })

  it('refuse un statut hors de la liste FERMÉE', () => {
    expect(() => needStepSchema.parse({ ...STEP, status: 'annulé' })).toThrow()
  })
})

describe('createNeedStepSchema', () => {
  it('exige un libellé non vide', () => {
    expect(() => createNeedStepSchema.parse({ label: '' })).toThrow()
  })

  it('n’accepte aucun champ hors du libellé — la création ne préjuge pas du statut', () => {
    expect(() => createNeedStepSchema.parse({ label: 'Organiser les entretiens', status: 'done' })).toThrow()
  })
})

describe('updateNeedStepSchema', () => {
  it('ne fait qu’une chose — changer le statut, pas réécrire le libellé', () => {
    expect(updateNeedStepSchema.parse({ status: 'done' })).toEqual({ status: 'done' })
    expect(() => updateNeedStepSchema.parse({ status: 'done', label: 'Autre chose' })).toThrow()
  })
})
