import { isFailure, isSuccess } from '@bellum/utils'
import type { AttioService } from '../attio/attio.service'
import type { ZohoService } from '../zoho/zoho.service'
import type { OdooService } from '../odoo/odoo.service'
import type { PipedriveService } from '../pipedrive/pipedrive.service'
import type { SalesforceService } from '../salesforce/salesforce.service'
import { CrmAdapterRegistry } from './adapter/crm-adapter.registry'
import type { CrmDepthService } from './crm-depth.service'
import type { CrmService } from './crm.service'
import { CrmWriteService } from './crm-write.service'
import type { OutboundWriteService } from './outbound-write.service'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import { CrmTaskService } from './crm-task.service'
import type { CrmObjectKind, CrmTaskInput } from './crm-task'

const disconnected = { getStatus: jest.fn().mockResolvedValue({ configured: false, connected: false }) }
const input: CrmTaskInput = { subject: 'Besoin — TF1', body: 'x', company: 'TF1' }

function build(overrides: {
  hubspot?: Record<string, unknown>
  salesforce?: Record<string, unknown>
  pipedrive?: Record<string, unknown>
  attio?: Record<string, unknown>
}) {
  const hubspot = { ...disconnected, exportNeed: jest.fn(), ...overrides.hubspot }
  const salesforce = { ...disconnected, exportNeed: jest.fn(), ...overrides.salesforce }
  const pipedrive = { ...disconnected, exportNeed: jest.fn(), ...overrides.pipedrive }
  const attio = { ...disconnected, exportNeed: jest.fn(), ...overrides.attio }
  // #4185 — le service lit le REGISTRE des adaptateurs, construit sur les vrais services.
  const odoo = { ...disconnected, exportContact: jest.fn() }
  const registry = new CrmAdapterRegistry(
    hubspot as unknown as CrmService,
    {} as CrmDepthService,
    salesforce as unknown as SalesforceService,
    pipedrive as unknown as PipedriveService,
    attio as unknown as AttioService,
    odoo as unknown as OdooService,
    { ...disconnected, exportNeed: jest.fn() } as unknown as ZohoService,
  )
  // #4186 — la VRAIE porte commune, sur une file en mémoire.
  const outbound = {
    request: jest.fn().mockResolvedValue({ decision: 'write_now', request: { id: 'owr-1', state: 'approved' } }),
    recordOutcome: jest.fn().mockResolvedValue(undefined),
    recordUnknown: jest.fn().mockResolvedValue(undefined),
  }
  const workspace = {
    isDemoWorkspace: jest.fn().mockResolvedValue(false),
    resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1' }),
  }
  const writes = new CrmWriteService(
    registry,
    outbound as unknown as OutboundWriteService,
    workspace as unknown as WorkspaceContextService,
    {} as CrmService,
  )
  const service = new CrmTaskService(registry, writes)
  return { service, hubspot, salesforce, pipedrive, attio, outbound }
}

const connected = (id: string, object: CrmObjectKind) => ({
  getStatus: jest.fn().mockResolvedValue({ configured: true, connected: true }),
  exportNeed: jest.fn().mockResolvedValue({ id, object }),
})

describe('CrmTaskService.exportTask', () => {
  it('crée le besoin dans le PREMIER CRM connecté et remonte l’objet créé', async () => {
    // HubSpot déconnecté, Salesforce connecté → Salesforce gagne (un Task), Pipedrive/Attio non sollicités.
    const { service, salesforce, pipedrive } = build({ salesforce: connected('sf-1', 'task') })

    const result = await service.exportTask('u-1', input)

    expect(isSuccess(result)).toBe(true)
    if (isSuccess(result)) expect(result.output).toEqual({ provider: 'salesforce', object: 'task', id: 'sf-1' })
    expect(salesforce.exportNeed as jest.Mock).toHaveBeenCalledWith('u-1', input)
    // Un provider plus bas dans l'ordre n'est jamais appelé une fois qu'un connecté a répondu.
    expect(pipedrive.exportNeed as jest.Mock).not.toHaveBeenCalled()
  })

  it('privilégie HubSpot (un Deal) quand plusieurs sont connectés', async () => {
    const { service } = build({ hubspot: connected('hs-1', 'deal'), salesforce: connected('sf-1', 'task') })
    const result = await service.exportTask('u-1', input)
    if (isSuccess(result)) expect(result.output).toEqual({ provider: 'hubspot', object: 'deal', id: 'hs-1' })
  })

  it('renvoie no_provider — ZÉRO création — quand aucun CRM n’est connecté', async () => {
    const { service, hubspot, attio } = build({})

    const result = await service.exportTask('u-1', input)

    expect(isFailure(result)).toBe(true)
    if (isFailure(result)) expect(result.problem.code).toBe('no_provider')
    expect(hubspot.exportNeed as jest.Mock).not.toHaveBeenCalled()
    expect(attio.exportNeed as jest.Mock).not.toHaveBeenCalled()
  })

  it('mappe un rejet du CRM en export_failed (jamais une 500 opaque)', async () => {
    const { service } = build({
      attio: {
        getStatus: jest.fn().mockResolvedValue({ configured: true, connected: true }),
        exportNeed: jest.fn().mockRejectedValue(new Error('Attio 400')),
      },
    })

    const result = await service.exportTask('u-1', input)

    expect(isFailure(result)).toBe(true)
    if (isFailure(result)) expect(result.problem.code).toBe('export_failed')
    // #4185 — l'espace CRM se nomme, jamais l'éditeur.
    if (isFailure(result)) expect(result.problem.message).not.toMatch(/Attio/)
  })
})

describe('#4186 — l’export de besoin passe par la porte', () => {
  it('dépose une demande `export_need` auto-approuvée (le clic EST la décision) et consigne son résultat', async () => {
    const { service, outbound } = build({ pipedrive: connected('pd-1', 'deal') })

    await service.exportTask('u-1', input)

    expect(outbound.request).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'pipedrive', kind: 'export_need', origin: 'user', workspaceId: 'ws-1' }),
    )
    expect(outbound.recordOutcome).toHaveBeenCalledWith('owr-1', { ok: true, response: 'pd-1' })
  })

  it('un délai dépassé n’est pas un échec : la demande passe `unknown`, jamais `failed`', async () => {
    const timeout = Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' })
    const { service, outbound } = build({
      salesforce: {
        getStatus: jest.fn().mockResolvedValue({ configured: true, connected: true }),
        exportNeed: jest.fn().mockRejectedValue(timeout),
      },
    })

    const result = await service.exportTask('u-1', input)

    expect(isFailure(result)).toBe(true)
    expect(outbound.recordUnknown).toHaveBeenCalledWith('owr-1', expect.stringContaining('timeout'))
    expect(outbound.recordOutcome).not.toHaveBeenCalled()
  })
})
