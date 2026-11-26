import { createMockRepository } from '../../database/test-utils'
import {
  LOCKED_EMAIL_CATCHUP_MAX_LIMIT,
  LOCKED_EMAIL_PLAN_SWITCH_AT,
  LockedEmailCatchupService,
} from './locked-email-catchup.service'

/**
 * Apollo Professional (02/11) — rattrapage des e-mails que le plan Basic masquait (« email_not_unlocked@ » écarté,
 * contact fini « aucun canal »). Aucune trace ne marque le verrou : le critère le plus étroit est lu sur la fiche.
 * Ce test doit savoir dire NON : par défaut rien n'est dépensé, un autre espace n'est pas visé, le parc n'est pas balayé.
 */
describe('LockedEmailCatchupService', () => {
  let repo: ReturnType<typeof createMockRepository>
  let enrichment: { enqueue: jest.Mock }
  let service: LockedEmailCatchupService

  const row = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    user_id: `u-${id}`,
    full_name: 'Jeanne Durand',
    entity: 'Acme',
    email: null,
    ...extra,
  })

  beforeEach(() => {
    repo = createMockRepository()
    enrichment = { enqueue: jest.fn().mockResolvedValue({ type: 'success', output: { job_id: 'j', state: 'queued' } }) }
    service = new LockedEmailCatchupService(repo as never, enrichment as never)
    repo.find.mockResolvedValueOnce([row('a'), row('b'), row('c')]).mockResolvedValue([])
  })

  it('simulation par défaut : COMPTE et ESTIME les crédits, ne met rien en file', async () => {
    const out = await service.run({ workspaceId: 'ws-1' })
    expect(out).toMatchObject({ dry_run: true, concerned: 3, estimated_credits: 3, enqueued: 0, skipped: 0 })
    expect(enrichment.enqueue).not.toHaveBeenCalled()
  })

  it('cible UN espace et le critère étroit : Apollo a répondu, e-mail absent, enrichi avant le passage en Professional', async () => {
    await service.run({ workspaceId: 'ws-1' })
    const where = repo.find.mock.calls[0]?.[0]?.where as Array<Record<string, unknown>>
    expect(where.length).toBeGreaterThan(0)
    for (const clause of where) {
      expect(clause['workspace_id']).toBe('ws-1')
      expect(clause['last_enrichment_provider']).toBe('apollo')
      expect(clause['last_enrichment_at']).toBeDefined()
    }
    expect(LOCKED_EMAIL_PLAN_SWITCH_AT).toBe('2026-11-01T00:00:00.000Z')
  })

  it('refuse de tourner sans espace', async () => {
    await expect(service.run({ workspaceId: ' ' })).rejects.toThrow(/espace/)
  })

  it('exécution : rejoue l’enrichissement E-MAIL de ces seuls contacts, au nom de leur propriétaire, forcé', async () => {
    const out = await service.run({ workspaceId: 'ws-1', dryRun: false })
    expect(out).toMatchObject({ dry_run: false, concerned: 3, enqueued: 3, skipped: 0 })
    expect(enrichment.enqueue).toHaveBeenCalledTimes(3)
    expect(enrichment.enqueue).toHaveBeenCalledWith('a', 'u-a', {
      first_name: 'Jeanne',
      last_name: 'Durand',
      organization_name: 'Acme',
      force: true,
      only: 'email',
      free: true,
    })
  })

  it('une fiche refusée (cooldown, panne) est comptée « skipped », jamais perdue ni propagée', async () => {
    enrichment.enqueue
      .mockResolvedValueOnce({ type: 'success', output: { job_id: 'j', state: 'queued' } })
      .mockResolvedValueOnce({ type: 'failure', problem: { code: 'cooldown' } })
      .mockRejectedValueOnce(new Error('redis'))
    const out = await service.run({ workspaceId: 'ws-1', dryRun: false })
    expect(out).toMatchObject({ concerned: 3, enqueued: 1, skipped: 2 })
  })

  it('la borne limite l’EXÉCUTION seule (la simulation compte tout) et dit qu’il en reste', async () => {
    const out = await service.run({ workspaceId: 'ws-1', dryRun: false, limit: 2 })
    expect(out).toMatchObject({ enqueued: 2, limit_reached: true })
    expect(enrichment.enqueue).toHaveBeenCalledTimes(2)
    await expect(service.run({ workspaceId: 'ws-1', limit: LOCKED_EMAIL_CATCHUP_MAX_LIMIT + 1 })).rejects.toThrow(
      /borne/,
    )
  })
})
