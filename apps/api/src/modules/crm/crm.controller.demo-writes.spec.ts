import { CrmController } from './crm.controller'
import type { OutboundWriteRequestEntity } from '../../database/entities/outbound-write-request.entity'

/**
 * #4163 LF point 7 — la file « À traiter » de la salle de démonstration montrait « Écriture CRM indisponible »
 * (`not_configured`) : la salle n'a ni CRM branché ni jeton. Elle lit désormais les écritures EN ATTENTE semées —
 * et ne les EXÉCUTE jamais : trancher une demande de la salle ne touche à aucun CRM.
 */
const USER = { userId: 'u1' } as never
const WS = 'ws1'

const row = (over: Partial<OutboundWriteRequestEntity> = {}): OutboundWriteRequestEntity =>
  ({
    id: 'r1',
    workspace_id: WS,
    requested_by: 'u1',
    provider: 'hubspot',
    kind: 'create_note',
    payload: { company: 'SNCF' },
    preview: [{ field: 'Société', value: 'SNCF', key: 'company' }],
    origin: 'system',
    state: 'pending',
    created_at: new Date('2026-10-14T08:00:00Z'),
    expires_at: new Date('2026-10-17T08:00:00Z'),
    ...over,
  }) as OutboundWriteRequestEntity

function build(options: { demo: boolean; configured?: boolean; connected?: boolean }) {
  const crm = {
    getStatus: jest.fn(async () => ({
      configured: options.configured ?? false,
      connected: options.connected ?? false,
    })),
    writeApproved: jest.fn(async () => row({ state: 'written' })),
  }
  const outbound = {
    pending: jest.fn(async () => [row()]),
    decide: jest.fn(async () => row({ state: 'approved' })),
  }
  const workspace = {
    resolveActiveWorkspace: jest.fn(async () => ({ workspaceId: WS, role: 'owner' })),
    isDemoWorkspace: jest.fn(async () => options.demo),
  }
  const profiles = { find: jest.fn(async () => []) }
  // #4186 (intégration 15/10) — la file et l'écriture passent par la porte commune : les CRM branchés viennent du
  // registre d'adaptateurs, l'écriture validée de `CrmWriteService`.
  const crmWrites = { writeApproved: jest.fn(async () => row({ state: 'written' })) }
  const adapters = {
    connected: jest.fn(async () =>
      options.connected ? [{ adapter: { provider: 'hubspot' }, accountLabel: null }] : [],
    ),
  }
  const controller = new CrmController(
    crm as never,
    {} as never,
    {} as never,
    outbound as never,
    workspace as never,
    profiles as never,
    {} as never,
    crmWrites as never,
    adapters as never,
    {} as never,
  )
  return { controller, crm, crmWrites, outbound }
}

describe('CrmController — la salle de démonstration lit ses écritures en attente (#4163 LF)', () => {
  it('en démo, la file répond « ready » avec les écritures semées — jamais « not_configured »', async () => {
    const { controller, outbound } = build({ demo: true })
    const result = await controller.writeRequests(USER)
    expect(result.status).toBe('ready')
    expect(result.requests).toHaveLength(1)
    expect(outbound.pending).toHaveBeenCalledWith(WS)
  })

  it('hors démo, sans CRM configuré, l’état reste « not_configured » (byte-identique à avant)', async () => {
    const { controller, outbound } = build({ demo: false, configured: false })
    expect(await controller.writeRequests(USER)).toEqual({ status: 'not_configured', requests: [] })
    expect(outbound.pending).not.toHaveBeenCalled()
  })

  it('hors démo, sans CRM branché, l’état reste « not_connected »', async () => {
    const { controller } = build({ demo: false, configured: true, connected: false })
    expect(await controller.writeRequests(USER)).toEqual({ status: 'not_connected', requests: [] })
  })

  it('en démo, valider une écriture ne l’EXÉCUTE jamais : writeApproved n’est pas appelée', async () => {
    const { controller, crm, crmWrites, outbound } = build({ demo: true })
    const view = await controller.decideWrite(USER, 'r1', { approve: true })
    expect(outbound.decide).toHaveBeenCalled()
    expect(crm.writeApproved).not.toHaveBeenCalled()
    expect(crmWrites.writeApproved).not.toHaveBeenCalled()
    expect(view.state).toBe('approved') // décidée, pas « written » : rien n'a été écrit nulle part
  })

  it('hors démo, une demande de système validée part toujours (non-régression)', async () => {
    const { controller, crmWrites } = build({ demo: false, configured: true, connected: true })
    await controller.decideWrite(USER, 'r1', { approve: true })
    expect(crmWrites.writeApproved).toHaveBeenCalledWith(WS, 'u1', 'r1')
  })
})
