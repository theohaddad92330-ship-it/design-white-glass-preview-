import { GUARDS_METADATA } from '@nestjs/common/constants'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { PlanItemContactBackfillController } from './plan-item-contact-backfill.controller'
import type { PlanItemContactBackfillService } from './plan-item-contact-backfill.service'

describe('PlanItemContactBackfillController — #4521.1', () => {
  it('est gardé par le secret interne (back-office seul)', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, PlanItemContactBackfillController)).toContain(InternalSecretGuard)
  })

  it('transmet l’espace et le mode simulation tels quels', async () => {
    const run = jest
      .fn()
      .mockResolvedValue({ dryRun: true, examined: 0, attached: 0, ambiguous: 0, alreadyAttached: 0 })
    const controller = new PlanItemContactBackfillController({ run } as unknown as PlanItemContactBackfillService)
    await controller.run({ workspace_id: 'ws-1', dry_run: true })
    expect(run).toHaveBeenCalledWith('ws-1', { dryRun: true })
  })
})
