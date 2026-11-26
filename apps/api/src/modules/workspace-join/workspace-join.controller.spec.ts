import { PERSONAL_SCOPE_KEY } from '../../common/decorator/personal-scope.decorator'
import { REQUIRE_PERMISSION_KEY } from '../workspace/require-permission.decorator'
import { WorkspaceJoinController } from './workspace-join.controller'

/**
 * #2016 — les deux familles de routes et leur déclaration : le non-membre ne
 * touche qu'à SES demandes, l'administrateur tranche avec `team:manage`.
 */
describe('WorkspaceJoinController (#2016)', () => {
  const proto = WorkspaceJoinController.prototype as unknown as Record<string, object>
  const meta = (key: string, method: string): unknown => Reflect.getMetadata(key, proto[method]!)

  it.each(['overview', 'requestAccess', 'dismiss'])(
    '%s est une route PERSONNELLE, sans permission d’espace',
    method => {
      expect(meta(PERSONAL_SCOPE_KEY, method)).toBe(true)
      expect(meta(REQUIRE_PERMISSION_KEY, method)).toBeUndefined()
    },
  )

  it.each(['listPending', 'accept', 'refuse'])('%s exige team:manage', method => {
    expect(meta(REQUIRE_PERMISSION_KEY, method)).toEqual(['team:manage'])
    expect(meta(PERSONAL_SCOPE_KEY, method)).toBeUndefined()
  })

  it('accepter orchestre l’entrée dans l’équipe sur l’espace ACTIF de l’administrateur', async () => {
    const join = {
      decide: jest.fn(
        async (_admin: string, _ws: string, id: string, _decision: string, admit: (u: string) => Promise<unknown>) => {
          await admit('u-new')
          return { id, status: 'accepted' }
        },
      ),
    }
    const workspaceContext = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'w-1' }) }
    const team = { admitJoinRequester: jest.fn().mockResolvedValue({}) }
    const controller = new WorkspaceJoinController(join as never, workspaceContext as never, team as never)
    const user = { userId: 'u-admin', email: 'admin@comet.fr' } as never
    await controller.accept(user, 'r-1')
    expect(join.decide).toHaveBeenCalledWith('u-admin', 'w-1', 'r-1', 'accept', expect.any(Function))
    expect(team.admitJoinRequester).toHaveBeenCalledWith('u-admin', 'w-1', 'u-new')
  })
})
