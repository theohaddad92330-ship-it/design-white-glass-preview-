import { ForbiddenException, type ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { Request, Response } from 'express'
import { WorkspaceContextService } from './workspace-context.service'
import { WorkspacePermissionGuard } from './workspace-permission.guard'
import { REQUIRE_PERMISSION_KEY } from './require-permission.decorator'
import { requestMemoMiddleware, runWithRequestMemo, REQUEST_MEMO_MAX_AGE_MS } from '../../common/request-memo'

/**
 * Perf P2 (29/09/2026) — le coût SQL FIXE de chaque appel d'API.
 *
 * `resolveActiveWorkspace` a ~750 appelants ; un même endpoint GET l'appelait
 * par le guard PUIS par le service (parfois 3-4 fois), et chaque appel
 * repayait 1 à 3 requêtes en série sur un pool de 10. Ces gardes COMPTENT les
 * lectures de dépôt : dans UNE requête HTTP, trois appels coûtent exactement
 * ce que coûte un seul. Et une révocation reste effective à la requête
 * SUIVANTE — le mémo ne survit jamais à sa requête.
 */
function repos() {
  const workspaces = { findOne: jest.fn(), find: jest.fn() }
  const members = { findOne: jest.fn(), find: jest.fn() }
  const selections = { findOne: jest.fn(), delete: jest.fn(), upsert: jest.fn() }
  const permissions = { find: jest.fn() }
  const rules = { findOne: jest.fn() }
  const service = new WorkspaceContextService(
    workspaces as never,
    members as never,
    selections as never,
    permissions as never,
    rules as never,
  )
  return { workspaces, members, selections, permissions, rules, service }
}

function totalReads(r: ReturnType<typeof repos>): number {
  return (
    r.workspaces.findOne.mock.calls.length +
    r.members.findOne.mock.calls.length +
    r.selections.findOne.mock.calls.length +
    r.permissions.find.mock.calls.length +
    r.rules.findOne.mock.calls.length
  )
}

/** Un utilisateur qui a CHOISI un espace d'équipe (le cas des commerciaux invités). */
function asJoinedSales(r: ReturnType<typeof repos>, role = 'sales'): void {
  r.selections.findOne.mockResolvedValue({ user_id: 'user-1', workspace_id: 'ws-esn' })
  r.members.findOne.mockResolvedValue({ user_id: 'user-1', workspace_id: 'ws-esn', role })
  r.workspaces.findOne.mockResolvedValue(null)
  r.permissions.find.mockResolvedValue([])
  r.rules.findOne.mockResolvedValue(null)
}

function guardContext(): ExecutionContext {
  const request = { user: { userId: 'user-1' } }
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext
}

function guardFor(service: WorkspaceContextService): WorkspacePermissionGuard {
  const reflector = new Reflector()
  jest
    .spyOn(reflector, 'getAllAndOverride')
    .mockImplementation((key: unknown) => (key === REQUIRE_PERMISSION_KEY ? 'analysis:run' : undefined))
  return new WorkspacePermissionGuard(reflector, service)
}

describe('WorkspaceContextService — mémo par requête (perf P2)', () => {
  it('trois appels dans UNE requête coûtent exactement les lectures d’un seul', async () => {
    const single = repos()
    asJoinedSales(single)
    await runWithRequestMemo(() => single.service.resolveActiveWorkspace('user-1'))
    const oneCall = totalReads(single)
    expect(oneCall).toBeGreaterThan(0)

    const triple = repos()
    asJoinedSales(triple)
    const results = await runWithRequestMemo(async () => {
      const first = await triple.service.resolveActiveWorkspace('user-1')
      // deux appelants simultanés (Promise.all d'un service) partagent la même lecture
      const [second, third] = await Promise.all([
        triple.service.resolveActiveWorkspace('user-1'),
        triple.service.resolveActiveWorkspace('user-1'),
      ])
      return [first, second, third]
    })
    expect(totalReads(triple)).toBe(oneCall)
    for (const result of results) expect(result).toEqual({ workspaceId: 'ws-esn', role: 'sales' })
  })

  it('guard + service de la même requête : l’espace et les permissions ne se lisent qu’une fois', async () => {
    const r = repos()
    asJoinedSales(r)
    await runWithRequestMemo(async () => {
      await guardFor(r.service).canActivate(guardContext())
      await r.service.resolveActiveWorkspace('user-1')
      await r.service.extraPermissionsOf('ws-esn', 'user-1')
    })
    expect(r.selections.findOne).toHaveBeenCalledTimes(1)
    expect(r.members.findOne).toHaveBeenCalledTimes(1)
    expect(r.permissions.find).toHaveBeenCalledTimes(1)
  })

  it('la clé porte l’utilisateur : deux utilisateurs dans la même requête ne se partagent rien', async () => {
    const r = repos()
    r.selections.findOne.mockResolvedValue(null)
    r.workspaces.findOne.mockImplementation(({ where }: { where: { owner_user_id: string } }) =>
      Promise.resolve({ id: `ws-of-${where.owner_user_id}` }),
    )
    const [a, b] = await runWithRequestMemo(() =>
      Promise.all([r.service.resolveActiveWorkspace('user-a'), r.service.resolveActiveWorkspace('user-b')]),
    )
    expect(a.workspaceId).toBe('ws-of-user-a')
    expect(b.workspaceId).toBe('ws-of-user-b')
  })

  it('hors requête HTTP (job, cron) : aucun mémo, chaque appel relit', async () => {
    const r = repos()
    asJoinedSales(r)
    await r.service.resolveActiveWorkspace('user-1')
    await r.service.resolveActiveWorkspace('user-1')
    expect(r.selections.findOne).toHaveBeenCalledTimes(2)
  })

  it('RÉVOCATION : membre retiré → la requête SUIVANTE est refusée, sans attendre aucun TTL', async () => {
    const r = repos()
    asJoinedSales(r)
    const guard = guardFor(r.service)
    await expect(runWithRequestMemo(() => guard.canActivate(guardContext()))).resolves.toBe(true)

    // L'administrateur retire le siège : la ligne de membre disparaît, il ne
    // reste que l'espace personnel en lecture seule (viewer d'un autre espace).
    r.members.findOne.mockReset()
    r.members.findOne.mockResolvedValueOnce(null) // la sélection n'est plus adossée
    r.members.findOne.mockResolvedValueOnce({ user_id: 'user-1', workspace_id: 'ws-other', role: 'viewer' })

    await expect(runWithRequestMemo(() => guard.canActivate(guardContext()))).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('un changement d’espace DANS la requête oublie le mémo de cet utilisateur', async () => {
    const r = repos()
    asJoinedSales(r)
    await runWithRequestMemo(async () => {
      await r.service.resolveActiveWorkspace('user-1')
      r.workspaces.findOne.mockResolvedValue({ id: 'ws-perso', name: 'Perso' })
      r.members.findOne.mockResolvedValue({ user_id: 'user-1', workspace_id: 'ws-perso', role: 'owner' })
      r.selections.findOne.mockResolvedValue({ user_id: 'user-1', workspace_id: 'ws-perso' })
      await r.service.switchWorkspace('user-1', 'ws-perso')
      await expect(r.service.resolveActiveWorkspace('user-1')).resolves.toEqual({
        workspaceId: 'ws-perso',
        role: 'owner',
      })
    })
  })

  it('une lecture en échec n’est pas mémorisée : l’appel suivant retente', async () => {
    const r = repos()
    asJoinedSales(r)
    r.selections.findOne.mockRejectedValueOnce(new Error('pool épuisé'))
    await runWithRequestMemo(async () => {
      await expect(r.service.resolveActiveWorkspace('user-1')).rejects.toThrow('pool épuisé')
      await expect(r.service.resolveActiveWorkspace('user-1')).resolves.toEqual({
        workspaceId: 'ws-esn',
        role: 'sales',
      })
    })
  })

  it('une requête longue (flux) relit au-delà de l’âge maximal du mémo', async () => {
    const r = repos()
    asJoinedSales(r)
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000_000)
    try {
      await runWithRequestMemo(async () => {
        await r.service.resolveActiveWorkspace('user-1')
        now.mockReturnValue(1_000_000 + REQUEST_MEMO_MAX_AGE_MS + 1)
        await r.service.resolveActiveWorkspace('user-1')
      })
    } finally {
      now.mockRestore()
    }
    expect(r.selections.findOne).toHaveBeenCalledTimes(2)
  })

  it('le middleware n’ouvre un mémo que pour une requête SÛRE (GET/HEAD), jamais pour une écriture', async () => {
    const r = repos()
    asJoinedSales(r)
    const run = (method: string): Promise<void> =>
      new Promise<void>((resolve, reject) => {
        requestMemoMiddleware({ method } as Request, {} as Response, () => {
          Promise.all([r.service.resolveActiveWorkspace('user-1'), r.service.resolveActiveWorkspace('user-1')])
            .then(() => resolve())
            .catch(reject)
        })
      })
    await run('GET')
    expect(r.selections.findOne).toHaveBeenCalledTimes(1)
    await run('POST')
    expect(r.selections.findOne).toHaveBeenCalledTimes(3)
  })
})
