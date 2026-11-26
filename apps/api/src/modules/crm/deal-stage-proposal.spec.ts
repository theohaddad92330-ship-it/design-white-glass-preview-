import { BadRequestException, ForbiddenException, PreconditionFailedException } from '@nestjs/common'
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
import { OUTBOUND_WRITE_EXPIRY_MS, OUTBOUND_WRITE_KINDS } from './outbound-write-preview'
import { OutboundWriteService } from './outbound-write.service'

/**
 * #1934.18 — LE STADE CRM SE PROPOSE, IL NE S'ÉCRIT PAS.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI MANQUAIT
 * ─────────────────────────────────────────────────────────────────────────────
 * La septième sortie d'un compte rendu (`crm_stage`) est le stade que le
 * copilote PROPOSE. Elle rendait `blocked` / `MISSING_CAPABILITY: crm` — un
 * refus honnête, mais un refus : la doctrine demande la PORTE, pas l'absence de
 * chemin. Cette garde tient le chemin qui la remplace.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA DISTINCTION QUI PORTE TOUT
 * ─────────────────────────────────────────────────────────────────────────────
 * Le stade vient d'un MODÈLE, et la personne qui retient la carte a lu une
 * phrase (« Négociation, parce qu'ils ont demandé un devis »), pas un diff de
 * champ. Elle n'a donc pas vu ce que l'écriture DÉPLACE : quelle affaire, et
 * depuis quel stade. C'est exactement ce que la doctrine appelle un geste de
 * SYSTÈME — demande visible, prévisualisation FIGÉE, expiration 3 jours — et
 * c'est pour cela que la proposition n'est jamais auto-approuvée, même née d'un
 * clic. Le clic retient une proposition ; il n'autorise pas l'écriture.
 *
 * Les trois obligations d'une garde :
 *  - elle LIT quelque chose (les stades du portail et la prévisualisation sont
 *    comptés) ;
 *  - elle sait dire NON : sans validation humaine rien ne part, et un LIBELLÉ de
 *    stade n'atteint jamais le client HubSpot — `dealstage` attend un
 *    IDENTIFIANT (correction du 16/09 : la première version envoyait le libellé
 *    produit par le modèle, que la plupart des portails refusent) ;
 *  - elle n'attrape pas ce qu'elle ne vise pas (témoin : une tâche demandée par
 *    un clic reste auto-approuvée — cette garde ne referme pas la porte voisine).
 */

const USER = '11111111-1111-1111-1111-111111111111'
const REVIEWER = '33333333-3333-3333-3333-333333333333'
const WORKSPACE = '22222222-2222-2222-2222-222222222222'
const reviewer = { userId: REVIEWER, email: 'lead@esn.fr' } as CurrentUserPayload

/**
 * Le portail simulé. `dealstage` attend un IDENTIFIANT : le libellé
 * « Négociation » n'en est pas un, et le pipeline « Grands comptes » a un stade
 * du MÊME libellé sous un autre identifiant — c'est ce qui rend une
 * correspondance par libellé fausse, et pas seulement fragile.
 */
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
          { id: 'retired', label: 'Ancien stade', displayOrder: 2, archived: true },
        ],
      },
      { id: '8812', label: 'Grands comptes', stages: [{ id: '99001', label: 'Négociation', displayOrder: 0 }] },
    ],
  },
}

/** La proposition telle que l'écran la dépose : une affaire, un IDENTIFIANT de stade. */
const PROPOSAL = {
  dealId: 'hs-deal-42',
  stageId: 'contractsent',
  rationale: 'Ils ont demandé un devis pour deux profils en septembre.',
}

type FetchInit = { method?: string; body?: string }

function portalFetch(overrides: { pipelinesStatus?: number; pipelinesBody?: unknown } = {}) {
  return async (url: string, init?: FetchInit) => {
    const method = init?.method ?? 'GET'
    const reply = (status: number, body: unknown) => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    })
    if (method === 'GET' && url.includes('/crm/v3/pipelines/deals')) {
      const status = overrides.pipelinesStatus ?? 200
      return reply(
        status,
        status === 200
          ? (overrides.pipelinesBody ?? PORTAL.pipelines)
          : { message: "This app hasn't been granted all required scopes to make this call." },
      )
    }
    if (method === 'GET' && url.includes('/crm/v3/objects/deals/hs-deal-42')) return reply(200, PORTAL.deal)
    if (method === 'PATCH') return reply(200, { id: 'hs-deal-42' })
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
      // `created_at` est un défaut de la BASE : le vrai dépôt ne l'envoie pas,
      // donc le double ici plutôt que de le supposer présent.
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

/** Les corps PATCH réellement partis vers le client HubSpot. */
function patchedStages(fetchMock: jest.SpyInstance): unknown[] {
  return fetchMock.mock.calls
    .filter(([, init]) => (init as FetchInit | undefined)?.method === 'PATCH')
    .map(
      ([, init]) =>
        (JSON.parse((init as FetchInit).body ?? '{}') as { properties?: { dealstage?: unknown } }).properties
          ?.dealstage,
    )
}

describe('#1934.18 — la proposition de stade CRM', () => {
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

  describe('elle LIT quelque chose', () => {
    it('le vocabulaire porte la nature (GA-08)', () => {
      expect(OUTBOUND_WRITE_KINDS.length).toBeGreaterThanOrEqual(8)
      expect(OUTBOUND_WRITE_KINDS).toContain('update_deal_stage')
    })

    it('les stades RÉELS du portail sont lus, archivés écartés, dans l’ordre du portail', async () => {
      const { crm } = build()
      const read = await crm.dealPipelines(USER)
      expect(read.status).toBe('ready')
      expect(read.pipelines).toHaveLength(2)
      expect(read.pipelines[0]?.stages).toEqual([
        { id: 'appointmentscheduled', label: 'Découverte' },
        { id: 'contractsent', label: 'Négociation' },
      ])
    })

    it('la prévisualisation FIGÉE dit l’affaire, l’ancien stade et le nouveau — lus sur le PORTAIL', async () => {
      const { crm, rows } = build()
      await crm.proposeDealStage(USER, PROPOSAL)
      const preview = rows[0]?.preview as Array<{ key: string; value: string; previous?: string }>
      expect(preview.map(line => line.key)).toEqual(['dealName', 'dealId', 'pipeline', 'stage', 'stageId', 'rationale'])
      const stage = preview.find(line => line.key === 'stage')
      expect(stage).toMatchObject({ value: 'Négociation', previous: 'Découverte' })
      expect(preview.find(line => line.key === 'stageId')).toMatchObject({
        value: 'contractsent',
        previous: 'appointmentscheduled',
      })
      expect(preview.find(line => line.key === 'dealName')?.value).toBe('ACME — TMA Data')
    })

    // #2855 — la PROVENANCE : le stade vient d'un compte rendu, jamais d'un
    // clic direct. Portée par l'appelant (`meeting-notes.service.ts`), jamais
    // recalculée ici.
    it('porte la provenance donnée par l’appelant, jusque dans la demande déposée', async () => {
      const { crm, rows } = build()
      await crm.proposeDealStage(USER, { ...PROPOSAL, source: { kind: 'meeting_note', ref: 'evt-42' } })
      expect(rows[0]?.source).toEqual({ kind: 'meeting_note', ref: 'evt-42' })
    })

    it('sans provenance donnée, la demande déposée porte `null` — jamais devinée', async () => {
      const { crm, rows } = build()
      await crm.proposeDealStage(USER, PROPOSAL)
      expect(rows[0]?.source).toBeNull()
    })
  })

  describe('elle sait dire NON', () => {
    it('une proposition reste EN ATTENTE — jamais auto-approuvée, et aucune écriture ne part', async () => {
      const { crm, rows } = build()
      const proposal = await crm.proposeDealStage(USER, PROPOSAL)
      expect(proposal.pending).toBe(true)
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ kind: 'update_deal_stage', origin: 'system', state: 'pending' })
      expect(rows[0]?.decided_by).toBeNull()
      expect(patchedStages(fetchMock)).toEqual([])
    })

    it('un LIBELLÉ envoyé comme stade est refusé : rien n’est déposé, rien ne part', async () => {
      const { crm, rows } = build()
      await expect(crm.proposeDealStage(USER, { ...PROPOSAL, stageId: 'Négociation' })).rejects.toBeInstanceOf(
        BadRequestException,
      )
      expect(rows).toHaveLength(0)
      expect(patchedStages(fetchMock)).toEqual([])
    })

    it('un stade d’un AUTRE pipeline est refusé, même au libellé identique', async () => {
      const { crm, rows } = build()
      await expect(crm.proposeDealStage(USER, { ...PROPOSAL, stageId: '99001' })).rejects.toBeInstanceOf(
        BadRequestException,
      )
      expect(rows).toHaveLength(0)
    })

    it('stades illisibles (portée absente) : refus NOMMÉ, jamais de repli sur le libellé', async () => {
      fetchMock.mockImplementation(portalFetch({ pipelinesStatus: 403 }) as never)
      const { crm, rows } = build()
      const read = await crm.dealPipelines(USER)
      expect(read).toMatchObject({ status: 'unreadable', reason: 'scope_missing', pipelines: [] })
      await expect(crm.proposeDealStage(USER, PROPOSAL)).rejects.toBeInstanceOf(PreconditionFailedException)
      expect(rows).toHaveLength(0)
    })

    it('un portail sans pipeline est ILLISIBLE, pas « prêt avec zéro stade »', async () => {
      fetchMock.mockImplementation(portalFetch({ pipelinesBody: { results: [] } }) as never)
      const { crm } = build()
      expect(await crm.dealPipelines(USER)).toMatchObject({ status: 'unreadable', reason: 'empty' })
    })

    it('une demande figée SANS identifiant de stade ne part pas, même validée', async () => {
      // Une demande antérieure à cette correction ne portait que le libellé.
      const { crm, rows } = build()
      rows.push({
        id: 'owr-legacy',
        workspace_id: WORKSPACE,
        requested_by: USER,
        provider: 'hubspot',
        kind: 'update_deal_stage',
        payload: { dealId: 'hs-deal-42', stage: 'Négociation' },
        preview: [],
        origin: 'system',
        state: 'approved',
        idempotency_key: null,
        decided_by: REVIEWER,
        decided_at: new Date(),
        expires_at: new Date(Date.now() + 86_400_000),
        provider_response: null,
        created_at: new Date(),
        // Ligne d'avant #2855 : aucune provenance tracée.
        source: null,
        // Ligne d'avant #2864 : jamais déléguée.
        assigned_to: null,
        // Ligne d'avant #2856 : jamais reportée.
        snoozed_until: null,
        // Ligne d'avant #2854 (#2201.9) : jamais un lot.
        batch_id: null,
      } as OutboundWriteRequestEntity)
      const written = await crm.writeApproved(WORKSPACE, 'owr-legacy')
      expect(written.state).toBe('failed')
      expect(patchedStages(fetchMock)).toEqual([])
    })

    it('tant que personne n’a validé, l’écriture est REFUSÉE', async () => {
      const { crm } = build()
      const proposal = await crm.proposeDealStage(USER, PROPOSAL)
      await expect(crm.writeApproved(WORKSPACE, proposal.requestId)).rejects.toBeInstanceOf(ForbiddenException)
      expect(patchedStages(fetchMock)).toEqual([])
    })

    it('elle expire à TROIS jours, et la même proposition déposée deux fois ne fait qu’UNE demande', async () => {
      const { crm, rows } = build()
      const before = Date.now()
      await crm.proposeDealStage(USER, { ...PROPOSAL, idempotencyKey: 'meeting-notes:rdv-7' })
      await crm.proposeDealStage(USER, { ...PROPOSAL, idempotencyKey: 'meeting-notes:rdv-7' })
      expect(rows).toHaveLength(1)
      const expiry = rows[0]?.expires_at?.getTime() ?? 0
      expect(expiry).toBeGreaterThanOrEqual(before + OUTBOUND_WRITE_EXPIRY_MS - 5_000)
      expect(expiry).toBeLessThanOrEqual(Date.now() + OUTBOUND_WRITE_EXPIRY_MS + 5_000)
    })
  })

  describe('validée par un humain, l’IDENTIFIANT part — jamais le libellé', () => {
    it('TÉMOIN — un identifiant réel passe : un seul PATCH, sur l’affaire nommée', async () => {
      const { crm, controller, rows } = build()
      const proposal = await crm.proposeDealStage(USER, PROPOSAL)

      const view = await controller.decideWrite(reviewer, proposal.requestId, { approve: true })

      expect(patchedStages(fetchMock)).toEqual(['contractsent'])
      const patch = fetchMock.mock.calls.find(([, init]) => (init as FetchInit | undefined)?.method === 'PATCH')
      expect(String(patch?.[0])).toContain('/crm/v3/objects/deals/hs-deal-42')
      expect(rows[0]?.state).toBe('written')
      expect(view.state).toBe('written')
    })

    it('refusée, rien ne part — et la demande le DIT', async () => {
      const { crm, controller, rows } = build()
      const proposal = await crm.proposeDealStage(USER, PROPOSAL)
      await controller.decideWrite(reviewer, proposal.requestId, { approve: false })
      expect(patchedStages(fetchMock)).toEqual([])
      expect(rows[0]?.state).toBe('rejected')
    })
  })

  describe('elle n’attrape pas ce qu’elle ne vise pas', () => {
    it('TÉMOIN — une tâche demandée par un clic reste auto-approuvée et part tout de suite', async () => {
      const { crm, rows } = build()
      await crm.createTask(USER, { subject: 'Envoyer les CV', dueAt: '2026-09-20T09:00:00.000Z' })
      // `written` et non `pending` : elle est partie au clic, sans passer par la
      // file. Si cette ligne tombait, la proposition aurait refermé une porte
      // qu'elle n'avait pas à toucher.
      expect(rows[0]).toMatchObject({ kind: 'create_task', origin: 'user', state: 'written' })
    })
  })
})
