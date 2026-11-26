import { createMockRepository } from '../../database/test-utils'
import { PlaceholderEmailCatchupService } from './placeholder-email-catchup.service'

/**
 * #4599 — le rattrapage CIBLÉ des adresses gabarit déjà en base. Ce que ce test doit savoir dire NON : une vraie
 * adresse, une adresse posée à la main, une correction humaine arrivée entre la lecture et l'écriture, un espace
 * qu'on ne visait pas, et — par défaut — toute écriture (simulation d'abord).
 */
describe('PlaceholderEmailCatchupService', () => {
  let repo: ReturnType<typeof createMockRepository>
  let provenance: { currentSources: jest.Mock; commit: jest.Mock }
  let service: PlaceholderEmailCatchupService

  const rows = [
    { id: 'a', email: 'prenom.nom@exemple-societe.test', email_verified: false, email_confidence: null },
    { id: 'b', email: 'jeanne.durand@exemple-societe.test', email_verified: true, email_confidence: null },
    { id: 'c', email: 'prenom.nom@exemple-societe.test', email_verified: false, email_confidence: null },
  ]

  beforeEach(() => {
    repo = createMockRepository()
    provenance = { currentSources: jest.fn().mockResolvedValue({}), commit: jest.fn().mockResolvedValue(undefined) }
    service = new PlaceholderEmailCatchupService(repo as never, provenance as never)
    repo.find.mockResolvedValueOnce(rows).mockResolvedValue([])
  })

  it('simulation par défaut : compte, n’écrit RIEN', async () => {
    const out = await service.run({ workspaceId: 'ws-1' })
    expect(out).toEqual({ dry_run: true, examined: 3, cleared: 2, skipped: 0 })
    expect(repo._qb.execute).not.toHaveBeenCalled()
  })

  it('cible UN espace : la lecture est bornée par workspace_id', async () => {
    await service.run({ workspaceId: 'ws-1' })
    const where = repo.find.mock.calls[0]?.[0]?.where as Record<string, unknown>
    expect(where['workspace_id']).toBe('ws-1')
  })

  it('refuse de tourner sans espace', async () => {
    await expect(service.run({ workspaceId: '' })).rejects.toThrow(/espace/)
  })

  it('exécution : archive l’ancienne valeur avec sa date et vide le champ, la vraie adresse reste', async () => {
    const out = await service.run({ workspaceId: 'ws-1', dryRun: false })
    expect(out).toEqual({ dry_run: false, examined: 3, cleared: 2, skipped: 0 })
    expect(repo._qb.set).toHaveBeenCalledWith(
      expect.objectContaining({ email: null, email_verified: false, enrichment_archived_at: expect.any(Date) }),
    )
    const patch = JSON.parse(repo._qb.setParameter.mock.calls.find(([k]: [string]) => k === 'archivePatch')?.[1])
    expect(patch).toEqual(
      expect.objectContaining({
        email: 'prenom.nom@exemple-societe.test',
        email_placeholder_cleared_at: expect.any(String),
      }),
    )
    expect(repo._qb.andWhere).toHaveBeenCalledWith('email = :email', { email: 'prenom.nom@exemple-societe.test' })
    expect(repo._qb.andWhere).toHaveBeenCalledWith('workspace_id = :workspaceId', { workspaceId: 'ws-1' })
  })

  it('une adresse posée à la main n’est jamais vidée', async () => {
    provenance.currentSources.mockImplementation(async (_t: string, id: string) =>
      id === 'a' ? { email: 'human' } : {},
    )
    const out = await service.run({ workspaceId: 'ws-1', dryRun: false })
    expect(out).toEqual({ dry_run: false, examined: 3, cleared: 1, skipped: 1 })
  })

  it('une correction posée entre la lecture et l’écriture n’est jamais écrasée', async () => {
    repo._qb.execute.mockResolvedValueOnce({ affected: 0 }).mockResolvedValueOnce({ affected: 1 })
    const out = await service.run({ workspaceId: 'ws-1', dryRun: false })
    expect(out).toEqual({ dry_run: false, examined: 3, cleared: 1, skipped: 1 })
  })

  it("#4599.7 — l'ancienne adresse est écrite au journal de la fiche (une ligne par fiche vidée, pas pour celle qui a changé)", async () => {
    repo._qb.execute.mockResolvedValueOnce({ affected: 1 }).mockResolvedValueOnce({ affected: 0 })
    await service.run({ workspaceId: 'ws-1', dryRun: false })
    expect(provenance.commit).toHaveBeenCalledTimes(1)
    expect(provenance.commit).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-1',
        entityType: 'contact',
        entityId: 'a',
        rule: 'placeholder_email_catchup',
        changes: [{ field: 'email', oldValue: 'prenom.nom@exemple-societe.test', newValue: null }],
      }),
    )
  })

  it("#4599.7 — la simulation n'écrit aucune ligne de journal", async () => {
    await service.run({ workspaceId: 'ws-1' })
    expect(provenance.commit).not.toHaveBeenCalled()
  })

  // #4599.4 — la porte d'ADMIN D'ESPACE exécute par lots bornés : la simulation compte TOUT, l'exécution s'arrête
  // à la borne et le dit (le reste attend le geste suivant, jamais un lot sans fin).
  it('#4599.4 — exécution bornée : au plus `limit` fiches vidées, la borne atteinte est dite', async () => {
    const out = await service.run({ workspaceId: 'ws-1', dryRun: false, limit: 1 })
    expect(out).toEqual({ dry_run: false, examined: 3, cleared: 1, skipped: 0, limit_reached: true })
    expect(repo._qb.execute).toHaveBeenCalledTimes(1)
    expect(provenance.commit).toHaveBeenCalledTimes(1)
  })

  it('#4599.4 — la simulation ignore la borne : elle compte toutes les fiches concernées', async () => {
    const out = await service.run({ workspaceId: 'ws-1', limit: 1 })
    expect(out).toEqual({ dry_run: true, examined: 3, cleared: 2, skipped: 0, limit_reached: false })
  })

  it('#4599.4 — une borne au-delà de 100 est refusée', async () => {
    await expect(service.run({ workspaceId: 'ws-1', dryRun: false, limit: 101 })).rejects.toThrow(/100/)
  })
})
