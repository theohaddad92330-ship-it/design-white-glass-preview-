import { NotFoundException } from '@nestjs/common'
import type { Socket } from 'socket.io'
import { UniversalImportGateway, roomOf } from './universal-import.gateway'
import type { UniversalImportService } from './universal-import.service'

jest.mock('../../common/auth/socket-identity', () => ({
  attachSocketAuthOnce: jest.fn(),
  socketPrincipal: (client: { data?: { userId?: string } }) =>
    client.data?.userId ? { userId: client.data.userId } : null,
}))

/** Entrer dans la salle d'un job pose la MÊME question que le HTTP : ce job est-il dans MON espace ? */
function setup(jobWorkspace: string) {
  const state = jest.fn(async (workspaceId: string) => {
    if (workspaceId !== jobWorkspace) throw new NotFoundException()
    return {} as never
  })
  const gateway = new UniversalImportGateway(
    { resolveActiveWorkspace: async (userId: string) => ({ workspaceId: userId === 'alice' ? 'ws-a' : 'ws-b' }) },
    { state } as unknown as UniversalImportService,
  )
  const client = (userId: string | null) =>
    ({ data: { userId }, join: jest.fn(async () => undefined), leave: jest.fn() }) as unknown as Socket & {
      join: jest.Mock
    }
  return { gateway, client, state }
}

describe('UniversalImportGateway — la salle d’un job', () => {
  it('ouvre la salle à un membre de l’espace du job', async () => {
    const { gateway, client } = setup('ws-a')
    const alice = client('alice')
    await gateway.handleJoin('job-1', alice)
    expect(alice.join).toHaveBeenCalledWith(roomOf('job-1'))
  })

  it('dit NON à un autre espace, et à un socket non authentifié', async () => {
    const { gateway, client, state } = setup('ws-a')
    const bob = client('bob')
    await gateway.handleJoin('job-1', bob)
    expect(bob.join).not.toHaveBeenCalled()
    expect(state).toHaveBeenCalledWith('ws-b', 'job-1')

    const anonymous = client(null)
    await gateway.handleJoin('job-1', anonymous)
    expect(anonymous.join).not.toHaveBeenCalled()
  })
})
