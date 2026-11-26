import { ProjectsService } from './projects.service'

/**
 * #2320.7/.23 (épopée #2967) — le pivot canonique de la chaîne commerciale
 * (`opportunities`, compte/périmètre/porteur/étape/valeur) rejoint enfin le
 * journal APPEND-ONLY que #2320.23 tenait déjà pour need/shortlist/submission/
 * mission — même défaut que `stage_change` (`projects.stage-trace.spec.ts`) :
 * la table existe, la contrainte SQL est élargie (migration `1796322820001`),
 * et jusqu'ici aucun code n'écrivait la cinquième valeur.
 */
describe('ProjectsService — le pivot de la chaîne rejoint le journal (#2320.7/.23)', () => {
  const row = { id: 'p-1', account_id: 'acc-1', label: 'Migration Cloud', stage: 'confirmed' }

  const build = (overrides: { rows?: unknown[]; history?: unknown[]; record?: jest.Mock } = {}) => {
    const query = jest.fn().mockResolvedValue(overrides.rows ?? [row])
    const repo = { manager: { query } }
    const record = overrides.record ?? jest.fn().mockResolvedValue(undefined)
    const commercialTransitions = { history: jest.fn().mockResolvedValue(overrides.history ?? []), record }
    const service = new ProjectsService(repo as never, undefined, commercialTransitions as never)
    return { service, query, commercialTransitions, record }
  }

  it('journalise le déplacement sous le sujet `opportunity`', async () => {
    const { service, commercialTransitions } = build()

    await service.updateStage('p-1', 'w-1', 'confirmed', null, 'u-1')

    expect(commercialTransitions.history).toHaveBeenCalledWith('opportunity', 'p-1', 'w-1')
    expect(commercialTransitions.record).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'w-1',
        subjectType: 'opportunity',
        subjectId: 'p-1',
        toState: 'confirmed',
        actorId: 'u-1',
      }),
    )
  })

  it('`fromState` est le DERNIER `to_state` déjà journalisé — jamais une seconde lecture de `opportunities`', async () => {
    const { service, commercialTransitions } = build({
      history: [
        { toState: 'qualified', occurredAt: '2026-09-20T00:00:00.000Z' },
        { toState: 'confirmed', occurredAt: '2026-09-25T00:00:00.000Z' },
      ],
    })

    await service.updateStage('p-1', 'w-1', 'negotiation', null, 'u-1')

    expect(commercialTransitions.record).toHaveBeenCalledWith(expect.objectContaining({ fromState: 'confirmed' }))
  })

  it('`fromState` est `null` pour la toute première ligne d’un projet — comme les quatre autres sujets', async () => {
    const { service, commercialTransitions } = build({ history: [] })

    await service.updateStage('p-1', 'w-1', 'qualified', null, 'u-1')

    expect(commercialTransitions.record).toHaveBeenCalledWith(expect.objectContaining({ fromState: null }))
  })

  it('reprend le motif de perte comme PREUVE de la transition', async () => {
    const { service, commercialTransitions } = build({
      rows: [{ ...row, stage: 'lost', loss_reason: 'Budget gelé côté client' }],
    })

    await service.updateStage('p-1', 'w-1', 'lost', 'Budget gelé côté client', 'u-1')

    expect(commercialTransitions.record).toHaveBeenCalledWith(
      expect.objectContaining({ proof: 'Budget gelé côté client' }),
    )
  })

  it('best-effort — un journal indisponible ne fait PAS échouer le déplacement', async () => {
    const record = jest.fn().mockRejectedValue(new Error('boom'))
    const { service } = build({ record })

    const result = await service.updateStage('p-1', 'w-1', 'confirmed', null, 'u-1')

    expect(result).toEqual(row)
  })

  it('n’écrit RIEN sans service de journal (`@Optional()`, comme `activities`) — le déplacement se comporte comme avant', async () => {
    const query = jest.fn().mockResolvedValue([row])
    const repo = { manager: { query } }
    const service = new ProjectsService(repo as never)

    await expect(service.updateStage('p-1', 'w-1', 'confirmed', null, 'u-1')).resolves.toEqual(row)
  })

  it('n’écrit RIEN quand le projet est introuvable ou hors de l’espace', async () => {
    const { service, commercialTransitions } = build({ rows: [] })

    await service.updateStage('p-1', 'w-1', 'confirmed', null, 'u-1')

    expect(commercialTransitions.record).not.toHaveBeenCalled()
  })
})
