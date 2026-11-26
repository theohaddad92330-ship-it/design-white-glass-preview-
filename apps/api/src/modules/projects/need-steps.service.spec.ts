import { NotFoundException } from '@nestjs/common'
import { NeedStepsService } from './need-steps.service'

/**
 * Les « prochaines étapes » COCHABLES d'un besoin — le vrai chemin d'écriture
 * qui manquait (voir le docblock du service et `need-step.ts`).
 */
describe('NeedStepsService', () => {
  const NEED_ID = '11111111-1111-4111-8111-111111111111'
  const NEED_ROW = { id: NEED_ID }

  function buildSteps(over: Partial<Record<'find' | 'findOne' | 'create' | 'save', unknown>> = {}) {
    return {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((row: object) => row),
      save: jest.fn(async (row: object) => ({
        id: 's-neuf',
        created_at: new Date('2026-05-20T09:00:00.000Z'),
        updated_at: new Date('2026-05-20T09:00:00.000Z'),
        ...row,
      })),
      ...over,
    }
  }

  it('refuse un besoin hors de l’espace — avant toute lecture ou écriture', async () => {
    const steps = buildSteps()
    const needs = { findOne: jest.fn().mockResolvedValue(null) }
    const service = new NeedStepsService(steps as never, needs as never)

    await expect(service.list('w-1', NEED_ID)).rejects.toBeInstanceOf(NotFoundException)
    await expect(service.create('w-1', NEED_ID, { label: 'Organiser les entretiens' })).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })

  it('pose une étape neuve APRÈS les autres — la position ne réordonne jamais celles qui existent', async () => {
    const steps = buildSteps({ findOne: jest.fn().mockResolvedValue({ position: 2 }) })
    const needs = { findOne: jest.fn().mockResolvedValue(NEED_ROW) }
    const service = new NeedStepsService(steps as never, needs as never)

    const created = await service.create('w-1', NEED_ID, { label: 'Envoyer la proposition commerciale' })

    expect(steps.create).toHaveBeenCalledWith(
      expect.objectContaining({
        label: 'Envoyer la proposition commerciale',
        status: 'todo',
        position: 3,
        done_at: null,
      }),
    )
    expect(created.status).toBe('todo')
  })

  it('la PREMIÈRE étape d’un besoin part à la position 0', async () => {
    const steps = buildSteps({ findOne: jest.fn().mockResolvedValue(null) })
    const needs = { findOne: jest.fn().mockResolvedValue(NEED_ROW) }
    const service = new NeedStepsService(steps as never, needs as never)

    await service.create('w-1', NEED_ID, { label: 'Valider la short list des profils' })

    expect(steps.create).toHaveBeenCalledWith(expect.objectContaining({ position: 0 }))
  })

  it('cocher une étape pose `done_at` À MAINTENANT', async () => {
    const row = { id: 's-1', status: 'todo', done_at: null }
    const steps = buildSteps({ findOne: jest.fn().mockResolvedValue(row) })
    const needs = { findOne: jest.fn().mockResolvedValue(NEED_ROW) }
    const service = new NeedStepsService(steps as never, needs as never)

    const updated = await service.updateStatus('w-1', NEED_ID, 's-1', { status: 'done' })

    expect(updated.status).toBe('done')
    expect(updated.doneAt).not.toBeNull()
  })

  it('décocher une étape EFFACE `done_at` — une date qui reste après un décochage mentirait', async () => {
    const row = { id: 's-1', status: 'done', done_at: new Date('2026-05-21T10:00:00.000Z') }
    const steps = buildSteps({ findOne: jest.fn().mockResolvedValue(row) })
    const needs = { findOne: jest.fn().mockResolvedValue(NEED_ROW) }
    const service = new NeedStepsService(steps as never, needs as never)

    const updated = await service.updateStatus('w-1', NEED_ID, 's-1', { status: 'todo' })

    expect(updated.status).toBe('todo')
    expect(updated.doneAt).toBeNull()
  })

  it('refuse une étape introuvable dans CE besoin', async () => {
    const steps = buildSteps({ findOne: jest.fn().mockResolvedValue(null) })
    const needs = { findOne: jest.fn().mockResolvedValue(NEED_ROW) }
    const service = new NeedStepsService(steps as never, needs as never)

    await expect(service.updateStatus('w-1', NEED_ID, 's-x', { status: 'done' })).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })
})
