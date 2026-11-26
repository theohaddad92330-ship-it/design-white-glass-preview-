import { GUARDS_METADATA } from '@nestjs/common/constants'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { adminGroupHeadBackfillSchema } from './dto/admin-group-head-backfill.dto'
import { AdminGroupHeadBackfillController } from './admin-group-head-backfill.controller'

describe('AdminGroupHeadBackfillController (#3917)', () => {
  it('est derrière InternalSecretGuard — jamais une route publique', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, AdminGroupHeadBackfillController) as unknown[]).toContain(
      InternalSecretGuard,
    )
  })

  it('délègue au service avec le corps validé', async () => {
    const run = jest.fn().mockResolvedValue({ processed: 0 })
    const dto = { workspaceId: '11111111-1111-4111-8111-111111111111', limit: 5 }
    await new AdminGroupHeadBackfillController({ run } as never).run(dto as never)
    expect(run).toHaveBeenCalledWith(dto)
  })

  it('le corps exige un espace (UUID) et plafonne limit à 100', () => {
    const ws = '11111111-1111-4111-8111-111111111111'
    expect(adminGroupHeadBackfillSchema.safeParse({}).success).toBe(false)
    expect(adminGroupHeadBackfillSchema.safeParse({ workspaceId: ws, limit: 101 }).success).toBe(false)
    expect(adminGroupHeadBackfillSchema.safeParse({ workspaceId: ws }).success).toBe(true)
  })
})
