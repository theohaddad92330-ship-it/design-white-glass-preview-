import type { Repository } from 'typeorm'
import type { CrmConnectionEntity } from '../../database/entities/crm-connection.entity'
import type { OutboundWriteRequestEntity } from '../../database/entities/outbound-write-request.entity'
import type { UserActionEntity } from '../../database/entities/user-action.entity'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import { CrmService } from './crm.service'
import { encryptToken } from './crm-token.crypto'
import { OutboundWriteService } from './outbound-write.service'

/**
 * #2854 (#2201.9) — « FUSION FILE UNIQUE : ACTIONS EN MASSE ».
 *
 * `proposeBatch` referme le trou de sécurité qui gardait ce point « hors lot »
 * (bilan du 27/09 11:40Z) : un endpoint générique `kind`+`payload` aurait
 * laissé un appelant contourner la validation PROPRE à chaque proposition. Ici
 * chaque item TYPÉ redirige vers la méthode `propose*` qui existait déjà —
 * même relecture du portail, même refus si le stade est inconnu — et partage
 * seulement un `batchId` neuf.
 */

const USER = '11111111-1111-1111-1111-111111111111'
const WORKSPACE = '22222222-2222-2222-2222-222222222222'

const PORTAL = {
  deal: {
    id: 'hs-deal-42',
    properties: { dealname: 'ACME — TMA Data', dealstage: 'appointmentscheduled', pipeline: 'default' },
  },
  pipelines: {
    results: [
      {
        id: 'default',
        label: 'Pipeline commercial',
        stages: [
          { id: 'contractsent', label: 'Négociation', displayOrder: 1 },
          { id: 'appointmentscheduled', label: 'Découverte', displayOrder: 0 },
        ],
      },
    ],
  },
}

type FetchInit = { method?: string; body?: string }

function portalFetch() {
  return async (url: string, init?: FetchInit) => {
    const method = init?.method ?? 'GET'
    const reply = (status: number, body: unknown) => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    })
    if (method === 'GET' && url.includes('/crm/v3/pipelines/deals')) return reply(200, PORTAL.pipelines)
    if (method === 'GET' && url.includes(`/crm/v3/objects/deals/${PORTAL.deal.id}`)) return reply(200, PORTAL.deal)
    if (method === 'POST' && url.includes('/crm/v3/objects/deals')) return reply(200, { id: 'hs-deal-99' })
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
  } as unknown as WorkspaceContextService
  const crm = new CrmService(
    connectionRepo(),
    { insert: jest.fn() } as unknown as Repository<UserActionEntity>,
    workspace,
    outbound,
  )
  return { crm, outbound, rows }
}

describe('#2854 (#2201.9) — proposeBatch', () => {
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

  it('un lot VIDE ne pose aucun batchId — rien à regrouper', async () => {
    const { crm } = build()
    const result = await crm.proposeBatch(USER, [])
    expect(result).toEqual({ batchId: null, results: [] })
  })

  it('dépose plusieurs propositions sous UN SEUL batchId partagé', async () => {
    const { crm, rows } = build()
    const result = await crm.proposeBatch(USER, [
      { kind: 'deal_stage', dealId: PORTAL.deal.id, stageId: 'contractsent', rationale: 'Devis demandé' },
      { kind: 'create_deal', title: 'Deux profils data', accountName: 'ACME' },
    ])
    expect(result.batchId).not.toBeNull()
    expect(result.results).toEqual([
      { kind: 'deal_stage', ok: true, requestId: expect.any(String), pending: true },
      { kind: 'create_deal', ok: true, requestId: expect.any(String), pending: true },
    ])
    expect(rows).toHaveLength(2)
    expect(rows.every(row => row.batch_id === result.batchId)).toBe(true)
    expect(new Set(rows.map(row => row.batch_id)).size).toBe(1)
  })

  it('chaque item garde SA validation propre — un stade inconnu échoue SEUL, jamais un succès global qui le couvrirait', async () => {
    const { crm, rows } = build()
    const result = await crm.proposeBatch(USER, [
      { kind: 'deal_stage', dealId: PORTAL.deal.id, stageId: 'stade-inexistant' },
      { kind: 'create_deal', title: 'Deux profils data' },
    ])
    expect(result.results[0]).toMatchObject({ kind: 'deal_stage', ok: false })
    expect(result.results[1]).toMatchObject({ kind: 'create_deal', ok: true })
    // Le seul item écrit reste rattaché au lot malgré l'échec de son voisin.
    expect(rows).toHaveLength(1)
    expect(rows[0]?.batch_id).toBe(result.batchId)
  })

  it("n'accepte AUCUN kind/payload libre : seuls 'deal_stage' et 'create_deal' existent au type", () => {
    // Preuve au COMPILATEUR, pas seulement à l'exécution : ce test échouerait à
    // la compilation si `proposeBatch` acceptait un item non typé.
    type Item = Parameters<CrmService['proposeBatch']>[1][number]
    const forbidden: Item = { kind: 'deal_stage', dealId: 'x', stageId: 'y' }
    expect(forbidden.kind).toBe('deal_stage')
  })
})
