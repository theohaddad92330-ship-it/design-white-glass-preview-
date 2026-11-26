import { Logger } from '@nestjs/common'
import type { OutboundWriteRequestEntity } from '../../database/entities/outbound-write-request.entity'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import type { CrmAdapter } from './adapter/crm-adapter'
import type { CrmAdapterRegistry } from './adapter/crm-adapter.registry'
import type { CrmService } from './crm.service'
import { CrmWriteService } from './crm-write.service'
import type { OutboundWriteService } from './outbound-write.service'

/**
 * #4186 — la porte COMMUNE : toute écriture CRM, tous fournisseurs, passe par
 * `OutboundWriteService` (auto-approuvée sur geste utilisateur, sinon
 * prévisualisation figée), et son résultat est CONSIGNÉ.
 */

function adapter(overrides: Partial<CrmAdapter> = {}): CrmAdapter {
  return {
    provider: 'odoo',
    status: jest.fn().mockResolvedValue({ connected: true, accountLabel: 'Instance Exteam' }),
    upsertContact: jest.fn().mockResolvedValue({ id: '42', created: true }),
    ...overrides,
  }
}

function build(
  options: { adapter?: CrmAdapter | null; decision?: 'write_now' | 'pending' | 'already_done'; demo?: boolean } = {},
) {
  const target = options.adapter === undefined ? adapter() : options.adapter
  const registry = { get: jest.fn().mockReturnValue(target) }
  const outbound = {
    request: jest.fn().mockResolvedValue({
      decision: options.decision ?? 'write_now',
      request: {
        id: 'owr-1',
        state: options.decision === 'already_done' ? 'written' : 'approved',
        provider_response: '42',
      },
    }),
    recordOutcome: jest.fn().mockResolvedValue(undefined),
    recordUnknown: jest.fn().mockResolvedValue(undefined),
    requireApproved: jest.fn(),
    claimApprovedWrite: jest.fn(),
  }
  const workspace = {
    isDemoWorkspace: jest.fn().mockResolvedValue(options.demo ?? false),
    resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1' }),
  }
  const hubspot = { writeApproved: jest.fn().mockResolvedValue({ id: 'owr-h', state: 'written' }) }
  const service = new CrmWriteService(
    registry as unknown as CrmAdapterRegistry,
    outbound as unknown as OutboundWriteService,
    workspace as unknown as WorkspaceContextService,
    hubspot as unknown as CrmService,
  )
  return { service, registry, outbound, workspace, hubspot, target }
}

const contact = { email: 'theo@exteam.fr', firstName: 'Théo', lastName: 'Martin' }
const click = {
  userId: 'u1',
  provider: 'odoo',
  kind: 'export_contact' as const,
  payload: contact,
  origin: 'user' as const,
}

describe('#4186 — CrmWriteService : la porte pour tous les CRM', () => {
  it('un clic Odoo passe par la porte, écrit, et consigne le résultat', async () => {
    const { service, outbound, target } = build()

    const outcome = await service.write(click)

    expect(outbound.request).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: 'ws-1', provider: 'odoo', kind: 'export_contact', origin: 'user' }),
    )
    expect(target?.upsertContact).toHaveBeenCalledWith('u1', contact)
    expect(outbound.recordOutcome).toHaveBeenCalledWith('owr-1', { ok: true, response: '42' })
    expect(outcome).toEqual({ status: 'written', requestId: 'owr-1', externalId: '42', created: true })
  })

  it('une écriture de SYSTÈME est retenue — rien ne part chez le fournisseur', async () => {
    const { service, target } = build({ decision: 'pending' })

    const outcome = await service.write({ ...click, origin: 'system' })

    expect(outcome).toEqual({ status: 'pending', requestId: 'owr-1' })
    expect(target?.upsertContact).not.toHaveBeenCalled()
  })

  it('un double clic ne réécrit pas : `already_done` rend la fiche déjà écrite', async () => {
    const { service, target } = build({ decision: 'already_done' })

    expect(await service.write({ ...click, idempotencyKey: 'g-1' })).toEqual({
      status: 'already_done',
      requestId: 'owr-1',
      externalId: '42',
    })
    expect(target?.upsertContact).not.toHaveBeenCalled()
  })

  it('un timeout n’est pas un échec : `unknown` est consigné, l’erreur remonte, rien n’est retenté', async () => {
    const timeout = Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' })
    const { service, outbound } = build({ adapter: adapter({ upsertContact: jest.fn().mockRejectedValue(timeout) }) })

    await expect(service.write(click)).rejects.toBe(timeout)
    expect(outbound.recordUnknown).toHaveBeenCalledWith('owr-1', expect.stringContaining('timeout'))
    expect(outbound.recordOutcome).not.toHaveBeenCalled()
  })

  it('un refus du fournisseur est `failed` — consigné tel quel', async () => {
    const { service, outbound } = build({
      adapter: adapter({ upsertContact: jest.fn().mockRejectedValue(new Error('Odoo 400 : champ invalide')) }),
    })

    await expect(service.write(click)).rejects.toThrow('Odoo 400')
    expect(outbound.recordOutcome).toHaveBeenCalledWith('owr-1', { ok: false, response: 'Odoo 400 : champ invalide' })
  })

  it('un refus du CRM tiers (consigné, rendu à l’écran) est un warn — un bug de notre code reste error', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation()
    const logError = jest.spyOn(Logger.prototype, 'error').mockImplementation()
    const refused = build({
      adapter: adapter({ upsertContact: jest.fn().mockRejectedValue(new Error('Odoo 400 : champ invalide')) }),
    })
    await expect(refused.service.write(click)).rejects.toThrow('Odoo 400')
    expect(warn).toHaveBeenCalledWith('Écriture CRM non aboutie', expect.anything())
    expect(logError).not.toHaveBeenCalled()

    const bug = build({
      adapter: adapter({
        upsertContact: jest.fn().mockRejectedValue(new TypeError("Cannot read properties of undefined (reading 'id')")),
      }),
    })
    await expect(bug.service.write(click)).rejects.toThrow(TypeError)
    expect(logError).toHaveBeenCalledWith('Écriture CRM non aboutie', expect.anything())
    jest.restoreAllMocks()
  })

  it('une opération que le CRM ne porte pas est REFUSÉE, nommée — aucune demande, aucune écriture ailleurs', async () => {
    const { service, outbound } = build()

    const outcome = await service.write({ ...click, kind: 'export_need', payload: { subject: 'Besoin', body: 'b' } })

    expect(outcome.status).toBe('refused')
    expect(outbound.request).not.toHaveBeenCalled()
  })

  it('un CRM non branché, ou inconnu du contrat, est refusé sans toucher la porte', async () => {
    const off = build({ adapter: adapter({ status: jest.fn().mockResolvedValue({ connected: false }) }) })
    expect((await off.service.write(click)).status).toBe('refused')
    expect(off.outbound.request).not.toHaveBeenCalled()

    const unknown = build({ adapter: null })
    expect((await unknown.service.write({ ...click, provider: 'zoho' })).status).toBe('refused')
  })

  it('salle de démonstration : aucune écriture externe, un identifiant stable dérivé de la charge', async () => {
    const { service, outbound, target } = build({ demo: true })

    const first = await service.write(click)
    const second = await service.write(click)

    expect(first).toMatchObject({ status: 'written', requestId: null })
    expect(first).toEqual(second)
    expect(outbound.request).not.toHaveBeenCalled()
    expect(target?.upsertContact).not.toHaveBeenCalled()
  })

  describe('writeApproved — une demande de système validée part par SON adaptateur', () => {
    const request = (over: Partial<OutboundWriteRequestEntity>) =>
      ({
        id: 'owr-7',
        provider: 'pipedrive',
        kind: 'export_contact',
        payload: contact,
        origin: 'system',
        ...over,
      }) as OutboundWriteRequestEntity

    it('Pipedrive : réclamée une fois, écrite avec la charge FIGÉE, consignée', async () => {
      const pipedrive = adapter({
        provider: 'pipedrive',
        upsertContact: jest.fn().mockResolvedValue({ id: 'pd-1', created: false }),
      })
      const { service, outbound } = build({ adapter: pipedrive })
      outbound.requireApproved.mockResolvedValue(request({}))
      outbound.claimApprovedWrite.mockResolvedValue(request({ state: 'writing' }))

      const settled = await service.writeApproved('ws-1', 'u-approver', 'owr-7')

      expect(pipedrive.upsertContact).toHaveBeenCalledWith('u-approver', contact)
      expect(outbound.recordOutcome).toHaveBeenCalledWith('owr-7', { ok: true, response: 'pd-1' })
      expect(settled).toMatchObject({ state: 'written', provider_response: 'pd-1' })
    })

    it('HubSpot garde son chemin pour ses natures (note, tâche, stade…)', async () => {
      const { service, outbound, hubspot } = build()
      outbound.requireApproved.mockResolvedValue(request({ provider: 'hubspot', kind: 'create_note' }))

      await service.writeApproved('ws-1', 'u1', 'owr-7')

      expect(hubspot.writeApproved).toHaveBeenCalledWith('ws-1', 'owr-7')
    })

    it('une nature que l’adaptateur ne porte pas reste validée et le dit — rien n’est réclamé', async () => {
      const { service, outbound } = build()
      outbound.requireApproved.mockResolvedValue(request({ provider: 'odoo', kind: 'create_note' }))

      await expect(service.writeApproved('ws-1', 'u1', 'owr-7')).rejects.toThrow(/ne peut pas partir/)
      expect(outbound.claimApprovedWrite).not.toHaveBeenCalled()
    })
  })
})
