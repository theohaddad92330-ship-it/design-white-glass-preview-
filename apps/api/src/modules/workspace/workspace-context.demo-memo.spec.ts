import { runWithRequestMemo } from '../../common/request-memo'
import { countQueries, QueryCounter } from '../../database/query-counter'
import { WorkspaceContextService } from './workspace-context.service'

/**
 * #4450 (BELLUM-API-14 / -B / -11) — GET /crm/write-requests interroge `isDemoWorkspace` depuis le contrôleur
 * PUIS depuis le statut de chaque fournisseur : la même lecture `workspaces WHERE id = $1` rejouée, ce que
 * Sentry nomme « N+1 Query ». Le test COMPTE les requêtes émises par les dépôts (pas un mock lu) : dans UNE
 * requête GET, N appels ne coûtent qu'une lecture de l'espace.
 */
describe('WorkspaceContextService.isDemoWorkspace — une lecture par requête GET (#4450)', () => {
  function build(isDemo: boolean) {
    const counter = new QueryCounter()
    const workspaces = countQueries(
      {
        findOne: jest.fn(async () => ({ id: 'ws-1', is_demo: isDemo, owner_user_id: 'u1' })),
      },
      counter,
      'Workspace',
    )
    const members = countQueries(
      { findOne: jest.fn(async () => ({ workspace_id: 'ws-1', role: 'owner' })) },
      counter,
      'Member',
    )
    const selections = countQueries({ findOne: jest.fn(async () => ({ workspace_id: 'ws-1' })) }, counter, 'Selection')
    const service = new WorkspaceContextService(workspaces as never, members as never, selections as never)
    return { service, counter }
  }

  it('six appels dans une même requête GET : UNE seule lecture de la table des espaces', async () => {
    const { service, counter } = build(false)
    await runWithRequestMemo(async () => {
      for (let i = 0; i < 6; i++) expect(await service.isDemoWorkspace('u1')).toBe(false)
    })
    expect(counter.countFor('Workspace')).toBe(1)
  })

  it('un espace de démonstration reste reconnu', async () => {
    const { service } = build(true)
    await runWithRequestMemo(async () => {
      expect(await service.isDemoWorkspace('u1')).toBe(true)
      expect(await service.isDemoWorkspace('u1')).toBe(true)
    })
  })

  it('hors requête HTTP (job, cron) : aucun mémo, chaque appel relit', async () => {
    const { service, counter } = build(false)
    await service.isDemoWorkspace('u1')
    await service.isDemoWorkspace('u1')
    expect(counter.countFor('Workspace')).toBe(2)
  })
})
