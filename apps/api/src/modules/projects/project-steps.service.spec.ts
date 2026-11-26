import { NotFoundException } from '@nestjs/common'
import { ProjectStepsService } from './project-steps.service'

/**
 * #2171.22 — Les « prochaines étapes » COCHABLES d'une opportunité — même
 * mécanisme que `NeedStepsService`, porté par l'opportunité. Voir le docblock
 * du service et `project-step.ts`.
 */
describe('ProjectStepsService', () => {
  const PROJECT_ID = '11111111-1111-4111-8111-111111111111'
  const PROJECT_ROW = { id: PROJECT_ID }

  function buildSteps(over: Partial<Record<'find' | 'findOne' | 'create' | 'save', unknown>> = {}) {
    return {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((row: object) => row),
      save: jest.fn(async (row: object) => ({
        id: 's-neuf',
        created_at: new Date('2026-09-25T09:00:00.000Z'),
        updated_at: new Date('2026-09-25T09:00:00.000Z'),
        ...row,
      })),
      ...over,
    }
  }

  it('refuse une opportunité hors de l’espace — avant toute lecture ou écriture', async () => {
    const steps = buildSteps()
    const projects = { findOne: jest.fn().mockResolvedValue(null) }
    const service = new ProjectStepsService(steps as never, projects as never)

    await expect(service.list('w-1', PROJECT_ID)).rejects.toBeInstanceOf(NotFoundException)
    await expect(service.create('w-1', PROJECT_ID, { label: 'Relancer le sponsor' })).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })

  it('pose une étape neuve APRÈS les autres — la position ne réordonne jamais celles qui existent', async () => {
    const steps = buildSteps({ findOne: jest.fn().mockResolvedValue({ position: 2 }) })
    const projects = { findOne: jest.fn().mockResolvedValue(PROJECT_ROW) }
    const service = new ProjectStepsService(steps as never, projects as never)

    const created = await service.create('w-1', PROJECT_ID, { label: 'Envoyer le devis' })

    expect(steps.create).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'Envoyer le devis', status: 'todo', position: 3, done_at: null }),
    )
    expect(created.status).toBe('todo')
  })

  it('la PREMIÈRE étape d’une opportunité part à la position 0', async () => {
    const steps = buildSteps({ findOne: jest.fn().mockResolvedValue(null) })
    const projects = { findOne: jest.fn().mockResolvedValue(PROJECT_ROW) }
    const service = new ProjectStepsService(steps as never, projects as never)

    await service.create('w-1', PROJECT_ID, { label: 'Qualifier le budget' })

    expect(steps.create).toHaveBeenCalledWith(expect.objectContaining({ position: 0 }))
  })

  it('cocher une étape pose `done_at` À MAINTENANT', async () => {
    const row = { id: 's-1', status: 'todo', done_at: null }
    const steps = buildSteps({ findOne: jest.fn().mockResolvedValue(row) })
    const projects = { findOne: jest.fn().mockResolvedValue(PROJECT_ROW) }
    const service = new ProjectStepsService(steps as never, projects as never)

    const updated = await service.updateStatus('w-1', PROJECT_ID, 's-1', { status: 'done' })

    expect(updated.status).toBe('done')
    expect(updated.doneAt).not.toBeNull()
  })

  it('décocher une étape EFFACE `done_at` — une date qui reste après un décochage mentirait', async () => {
    const row = { id: 's-1', status: 'done', done_at: new Date('2026-09-24T10:00:00.000Z') }
    const steps = buildSteps({ findOne: jest.fn().mockResolvedValue(row) })
    const projects = { findOne: jest.fn().mockResolvedValue(PROJECT_ROW) }
    const service = new ProjectStepsService(steps as never, projects as never)

    const updated = await service.updateStatus('w-1', PROJECT_ID, 's-1', { status: 'todo' })

    expect(updated.status).toBe('todo')
    expect(updated.doneAt).toBeNull()
  })

  it('refuse une étape introuvable sur CETTE opportunité', async () => {
    const steps = buildSteps({ findOne: jest.fn().mockResolvedValue(null) })
    const projects = { findOne: jest.fn().mockResolvedValue(PROJECT_ROW) }
    const service = new ProjectStepsService(steps as never, projects as never)

    await expect(service.updateStatus('w-1', PROJECT_ID, 's-x', { status: 'done' })).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })
})
