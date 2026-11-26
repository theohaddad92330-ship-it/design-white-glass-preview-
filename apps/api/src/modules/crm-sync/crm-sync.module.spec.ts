import { OutboundWriteService } from '../crm/outbound-write.service'
import { CrmSyncModule } from './crm-sync.module'
import { CRM_SYNC_WRITE_GATE } from './crm-sync.service'

// #4714.3 — l'écrasement CRM (`CRM_SYNC_OVERWRITE`) ne part que par LA porte d'écriture.
// Le service la reçoit par jeton (GA-07) : si le module ne fournit pas ce jeton, `gate` vaut
// undefined en production et l'écrasement meurt en silence. Ce test sait dire NON.
describe('CrmSyncModule — la porte d’écriture CRM est fournie (#4714.3)', () => {
  it('fournit CRM_SYNC_WRITE_GATE en alias de OutboundWriteService', () => {
    const providers = (Reflect.getMetadata('providers', CrmSyncModule) ?? []) as unknown[]
    const gate = providers.find(
      (p): p is { provide: unknown; useExisting: unknown } =>
        typeof p === 'object' && p !== null && (p as { provide?: unknown }).provide === CRM_SYNC_WRITE_GATE,
    )
    expect(gate?.useExisting).toBe(OutboundWriteService)
  })
})
