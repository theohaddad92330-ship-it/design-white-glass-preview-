import { ForbiddenException } from '@nestjs/common'
import type { Repository } from 'typeorm'
import type { CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import type { CrmConnectionEntity } from '../../database/entities/crm-connection.entity'
import type { OutboundWriteRequestEntity } from '../../database/entities/outbound-write-request.entity'
import type { ProfileEntity } from '../../database/entities/profile.entity'
import type { UserActionEntity } from '../../database/entities/user-action.entity'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import { CrmController } from './crm.controller'
import { CrmWriteService } from './crm-write.service'
import type { CrmDepthService } from './crm-depth.service'
import type { CrmReadService } from './crm-read.service'
import { CrmService } from './crm.service'
import { encryptToken } from './crm-token.crypto'
import { OutboundWriteService } from './outbound-write.service'

/**
 * #2777 — L'OPPORTUNITÉ SE PROPOSE COMME DEAL, ELLE NE S'ÉCRIT PAS.
 *
 * Même raisonnement que `deal-stage-proposal.spec.ts` (#1934.18) : le titre
 * vient d'un MODÈLE (l'extraction du compte rendu), pas d'un champ que la
 * personne a relu. La proposition passe donc par la même porte (BEL-INT-603),
 * `origin` figé à `system`, jamais auto-approuvée par le clic qui l'a produite.
 */

const USER = '11111111-1111-1111-1111-111111111111'
const REVIEWER = '33333333-3333-3333-3333-333333333333'
const WORKSPACE = '22222222-2222-2222-2222-222222222222'
const reviewer = { userId: REVIEWER, email: 'lead@esn.fr' } as CurrentUserPayload

type FetchInit = { method?: string; body?: string }

function portalFetch() {
  return async (url: string, init?: FetchInit) => {
    const reply = (status: number, body: unknown) => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    })
    if (init?.method === 'POST' && url.includes('/crm/v3/objects/deals')) return reply(200, { id: 'hs-deal-99' })
    return reply(200, { id: 'engagement-1' })
  }
}

function requestsRepo(rows: OutboundWriteRequestEntity[]) {
  const matches = (row: OutboundWriteRequestEntity, where: Record<string, unknown>) =>
    Object.entries(where).every(([key, value]) => (row as unknown as Record<string, unknown>)[key] === value)
  return {
    findOne: jest.fn(
      async ({ where }: { where: Record<string, unknown> }) => rows.find(row => matches(row, where)) ?? null,
    ),
    find: jest.fn(async ({ where }: { where: Record<string, unknown> }) => rows.filter(row => matches(row, where))),
    create: jest.fn((value: Partial<OutboundWriteRequestEntity>) => value),
    save: jest.fn(async (value: OutboundWriteRequestEntity) => {
      const existing = rows.find(row => row.id && row.id === value.id)
      if (existing) return Object.assign(existing, value)
      const saved = { ...value, id: `owr-${rows.length + 1}`, created_at: value.created_at ?? new Date() }
      rows.push(saved)
      return saved
    }),
    update: jest.fn(async (where: Record<string, unknown>, patch: Partial<OutboundWriteRequestEntity>) => {
      let affected = 0
      for (const row of rows) {
        if (!matches(row, where)) continue
        Object.assign(row, patch)
        affected += 1
      }
      return { affected }
    }),
  }
}

function connectionRepo() {
  const row: Partial<CrmConnectionEntity> = {
    user_id: USER,
    workspace_id: WORKSPACE,
    provider: 'hubspot',
    access_token_enc: encryptToken('AT'),
    refresh_token_enc: encryptToken('RT'),
    expires_at: new Date(Date.now() + 3_600_000),
    created_at: new Date('2026-07-01'),
  }
  return {
    findOne: jest.fn(async () => row),
    update: jest.fn(async () => ({ affected: 1 })),
  } as unknown as Repository<CrmConnectionEntity>
}

function build(rows: OutboundWriteRequestEntity[] = []) {
  const repo = requestsRepo(rows)
  const outbound = new OutboundWriteService(repo as never)
  const workspace = {
    resolveActiveWorkspace: jest.fn(async () => ({ workspaceId: WORKSPACE, role: 'owner' as const })),
    isDemoWorkspace: jest.fn(async () => false),
  } as unknown as WorkspaceContextService
  const crm = new CrmService(
    connectionRepo(),
    { insert: jest.fn() } as unknown as Repository<UserActionEntity>,
    workspace,
    outbound,
  )
  const profiles = { find: jest.fn(async () => []) } as unknown as Repository<ProfileEntity>
  const controller = new CrmController(
    crm,
    {} as CrmReadService,
    {} as CrmDepthService,
    outbound,
    workspace,
    profiles,
    {} as never,
    // #4186 — la porte commune ; aucun autre CRM branché ici (registre vide).
    new CrmWriteService({ get: () => null } as never, outbound, workspace as never, crm),
    {} as never,
    {} as never,
  )
  return { crm, controller, outbound, rows }
}

function createdDealBodies(fetchMock: jest.SpyInstance): unknown[] {
  return fetchMock.mock.calls
    .filter(([url, init]) => (init as FetchInit | undefined)?.method === 'POST' && String(url).includes('/deals'))
    .map(([, init]) => JSON.parse((init as FetchInit).body ?? '{}'))
}

describe('#2777 — la proposition d’opportunité (Deal)', () => {
  const OLD_ENV = { ...process.env }
  let fetchMock: jest.SpyInstance

  beforeEach(() => {
    process.env['HUBSPOT_CLIENT_ID'] = 'cid'
    process.env['HUBSPOT_CLIENT_SECRET'] = 'csecret'
    process.env['HUBSPOT_REDIRECT_URI'] = 'https://api.test/crm/hubspot/callback'
    process.env['INTERNAL_API_SECRET'] = 'internal-secret-for-state'
    process.env['CRM_TOKEN_ENC_KEY'] = 'enc-key-with-enough-entropy-123456789'
    fetchMock = jest.spyOn(global, 'fetch' as never).mockImplementation(portalFetch() as never)
  })
  afterEach(() => {
    process.env = { ...OLD_ENV }
    jest.restoreAllMocks()
  })

  it('dépose la proposition et le DIT — rien n’est écrit, elle reste EN ATTENTE', async () => {
    const { crm, rows } = build()
    const proposal = await crm.proposeCreateDeal(USER, { title: 'Deux profils data pour septembre' })
    expect(proposal.pending).toBe(true)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ kind: 'create_deal', origin: 'system', state: 'pending' })
    expect(rows[0]?.decided_by).toBeNull()
    expect(createdDealBodies(fetchMock)).toEqual([])
  })

  it('la prévisualisation FIGÉE porte le titre et le compte, jamais recalculée', async () => {
    const { crm, rows } = build()
    await crm.proposeCreateDeal(USER, { title: 'Deux profils data', accountName: 'ACME' })
    const preview = rows[0]?.preview as Array<{ key: string; value: string }>
    expect(preview.find(line => line.key === 'subject')?.value).toBe('Deux profils data')
    expect(preview.find(line => line.key === 'company')?.value).toBe('ACME')
  })

  it('sans compte résolu, la charge utile ne porte AUCUN nom devinable', async () => {
    const { crm, rows } = build()
    await crm.proposeCreateDeal(USER, { title: 'Deux profils data' })
    expect(rows[0]?.payload).toEqual({ subject: 'Deux profils data' })
  })

  it('porte la provenance donnée par l’appelant', async () => {
    const { crm, rows } = build()
    await crm.proposeCreateDeal(USER, { title: 'X', source: { kind: 'meeting_note', ref: 'evt-9' } })
    expect(rows[0]?.source).toEqual({ kind: 'meeting_note', ref: 'evt-9' })
  })

  it('validée par un humain, le Deal part réellement', async () => {
    const { crm, controller, rows } = build()
    const proposal = await crm.proposeCreateDeal(USER, { title: 'Deux profils data', accountName: 'ACME' })
    const view = await controller.decideWrite(reviewer, proposal.requestId, { approve: true })
    expect(createdDealBodies(fetchMock)).toHaveLength(1)
    expect(rows[0]?.state).toBe('written')
    expect(view.state).toBe('written')
  })

  it('refusée, rien ne part — et la demande le DIT', async () => {
    const { crm, controller, rows } = build()
    const proposal = await crm.proposeCreateDeal(USER, { title: 'X' })
    await controller.decideWrite(reviewer, proposal.requestId, { approve: false })
    expect(createdDealBodies(fetchMock)).toEqual([])
    expect(rows[0]?.state).toBe('rejected')
  })

  it('tant que personne n’a validé, l’écriture est REFUSÉE', async () => {
    const { crm } = build()
    const proposal = await crm.proposeCreateDeal(USER, { title: 'X' })
    await expect(crm.writeApproved(WORKSPACE, proposal.requestId)).rejects.toBeInstanceOf(ForbiddenException)
    expect(createdDealBodies(fetchMock)).toEqual([])
  })
})
