import { GUARDS_METADATA } from '@nestjs/common/constants'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { adminCommercialBriefBackfillSchema } from './dto/admin-commercial-brief-backfill.dto'
import { AdminCommercialBriefBackfillController } from './admin-commercial-brief-backfill.controller'

/**
 * Point 45 (briefs comptes, 01/10/2026) — la porte du rattrapage : JAMAIS
 * publique (secret interne), espace obligatoire, plafond borné.
 */
describe('AdminCommercialBriefBackfillController', () => {
  it('est derrière InternalSecretGuard — jamais une route publique', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, AdminCommercialBriefBackfillController) as unknown[]
    expect(guards).toContain(InternalSecretGuard)
  })

  it('délègue au service avec le corps validé', async () => {
    const run = jest.fn().mockResolvedValue({ processed: 0 })
    const controller = new AdminCommercialBriefBackfillController({ run } as never)
    const dto = { workspaceId: '11111111-1111-4111-8111-111111111111', limit: 5 }
    await controller.run(dto as never)
    expect(run).toHaveBeenCalledWith(dto)
  })

  it('le corps exige un espace (UUID) et plafonne limit à 100', () => {
    const ws = '11111111-1111-4111-8111-111111111111'
    expect(adminCommercialBriefBackfillSchema.safeParse({}).success).toBe(false)
    expect(adminCommercialBriefBackfillSchema.safeParse({ workspaceId: 'pas-un-uuid' }).success).toBe(false)
    expect(adminCommercialBriefBackfillSchema.safeParse({ workspaceId: ws, limit: 101 }).success).toBe(false)
    expect(adminCommercialBriefBackfillSchema.safeParse({ workspaceId: ws }).success).toBe(true)
    expect(adminCommercialBriefBackfillSchema.safeParse({ workspaceId: ws, accountIds: [] }).success).toBe(false)
  })
})
