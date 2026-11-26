import { ForbiddenException } from '@nestjs/common'
import { workspaceMergeHashInputSchema, workspaceMergePreviewInputSchema } from '@bellum/contracts'
import { PERSONAL_SCOPE_KEY } from '../../common/decorator/personal-scope.decorator'
import { REQUIRE_PERMISSION_KEY } from '../workspace/require-permission.decorator'
import { WorkspaceMergeController } from './workspace-merge.controller'

/**
 * #4158.57 — les droits du rapatriement : le demandeur ne touche qu'à SA demande, seul un admin de
 * l'espace cible accepte ou refuse.
 */
describe('WorkspaceMergeController (#4158.57)', () => {
  const proto = WorkspaceMergeController.prototype as unknown as Record<string, object>
  const meta = (key: string, method: string): unknown => Reflect.getMetadata(key, proto[method]!)

  it.each(['preview', 'mine', 'confirm', 'cancel', 'resume'])(
    '%s est une route PERSONNELLE du demandeur, sans permission d’espace',
    method => {
      expect(meta(PERSONAL_SCOPE_KEY, method)).toBe(true)
      expect(meta(REQUIRE_PERMISSION_KEY, method)).toBeUndefined()
    },
  )

  it.each(['pending', 'approve', 'reject'])('%s exige team:manage sur l’espace actif', method => {
    expect(meta(REQUIRE_PERMISSION_KEY, method)).toEqual(['team:manage'])
    expect(meta(PERSONAL_SCOPE_KEY, method)).toBeUndefined()
  })

  it('les demandes en attente sont celles de l’espace ACTIF de l’admin', async () => {
    const merge = { pendingFor: jest.fn().mockResolvedValue([]) }
    const workspaceContext = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'w-esn' }) }
    const controller = new WorkspaceMergeController(merge as never, workspaceContext as never)
    await controller.pending({ userId: 'u-admin' } as never)
    expect(merge.pendingFor).toHaveBeenCalledWith('u-admin', 'w-esn')
  })

  it('approuver transmet l’empreinte reçue, et le refus du service (non-admin) remonte en 403', async () => {
    const merge = { approve: jest.fn().mockRejectedValue(new ForbiddenException()) }
    const controller = new WorkspaceMergeController(merge as never, {} as never)
    const hash = 'a'.repeat(64)
    await expect(controller.approve({ userId: 'u-sales' } as never, 'r-1', { hash })).rejects.toBeInstanceOf(
      ForbiddenException,
    )
    expect(merge.approve).toHaveBeenCalledWith('u-sales', 'r-1', hash)
  })

  it('les corps sont stricts : une empreinte qui n’en est pas une, ou un champ en plus, est refusé', () => {
    expect(workspaceMergeHashInputSchema.safeParse({ hash: 'a'.repeat(64) }).success).toBe(true)
    expect(workspaceMergeHashInputSchema.safeParse({ hash: 'pas-un-hash' }).success).toBe(false)
    expect(workspaceMergeHashInputSchema.safeParse({ hash: 'a'.repeat(64), write: true }).success).toBe(false)
    expect(workspaceMergePreviewInputSchema.safeParse({ targetWorkspaceId: 'nope' }).success).toBe(false)
  })
})
