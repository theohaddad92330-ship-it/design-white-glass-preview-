import { ForbiddenException } from '@nestjs/common'
import type { WorkspaceRole } from '@bellum/contracts'
import { DealStageSlaController } from './deal-stage-sla.controller'

/**
 * #2170.43 — LES SEUILS D'ÉTAPE DU PIPE : un réglage d'ESPACE.
 *
 * Arbitrage Louis (31/10/2026, QCM) : « seuils de stagnation = réglage d'espace
 * modifiable par admin/owner seulement ». Lire : tout membre (le board en a
 * besoin). Changer : propriétaire, administrateur ou `sales_ops`.
 * Arbitrage Louis 01/11/2026 : `sales_ops` GARDE le réglage des durées cibles
 * (il l'avait par `team:manage`) ; `member`, `sales`, `viewer` restent refusés.
 *
 * ⚠️ Ce test SAIT DIRE NON : retirer le contrôle de rôle du `PUT` laisse passer
 * `member` et `sales_ops`, et l'écriture part en base.
 */
const USER = { userId: 'user-1' } as never

function build(role: WorkspaceRole) {
  const setStageSla = jest.fn().mockResolvedValue([{ stage: 'negotiation', slaDays: 20, isDefault: false }])
  const effectiveFor = jest.fn().mockResolvedValue([{ stage: 'negotiation', slaDays: 21, isDefault: true }])
  const resolveActiveWorkspace = jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role })
  const controller = new DealStageSlaController(
    { setStageSla, effectiveFor } as never,
    {
      resolveActiveWorkspace,
    } as never,
  )
  return { controller, setStageSla }
}

describe('PUT /pipeline/stage-sla/:stage — propriétaire ou administrateur seulement', () => {
  it.each<WorkspaceRole>(['member', 'sales', 'viewer'])('%s → 403, et rien n’est écrit', async role => {
    const { controller, setStageSla } = build(role)
    await expect(controller.set(USER, 'negotiation', { slaDays: 20 })).rejects.toBeInstanceOf(ForbiddenException)
    expect(setStageSla).not.toHaveBeenCalled()
  })

  it.each<WorkspaceRole>(['owner', 'admin', 'sales_ops'])('%s → le seuil est enregistré', async role => {
    const { controller, setStageSla } = build(role)
    await expect(controller.set(USER, 'negotiation', { slaDays: 20 })).resolves.toMatchObject({
      items: [{ stage: 'negotiation', slaDays: 20 }],
    })
    expect(setStageSla).toHaveBeenCalledWith('ws-1', 'negotiation', 20)
  })
})

describe('GET /pipeline/stage-sla — tout membre lit, et l’écran sait s’il peut modifier', () => {
  it('un membre lit les seuils, sans le droit de les changer', async () => {
    const { controller } = build('member')
    await expect(controller.list(USER)).resolves.toMatchObject({ canEdit: false })
  })

  it('un administrateur lit les seuils, avec le droit de les changer', async () => {
    const { controller } = build('admin')
    await expect(controller.list(USER)).resolves.toMatchObject({ canEdit: true })
  })
})
