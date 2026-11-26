import { ConflictException, ForbiddenException } from '@nestjs/common'
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
 * #1943.8 — LA PORTE D'ÉCRITURE CRM (BEL-INT-603) N'ÉCRIVAIT JAMAIS CE QU'ON Y APPROUVAIT.
 *
 * Signalé par L2 : `OutboundWriteService.requireApproved` n'avait AUCUN appelant.
 * Une écriture de SYSTÈME (la note d'un appel versée par la téléphonie) restait en
 * attente ; un humain la relisait et cliquait « Valider » ; la demande passait
 * `approved`… et rien ne partait, jamais. L'écran disait « validée », le CRM ne
 * recevait rien — « une action annoncée comme faite ne l'a pas été ».
 *
 * La correction, et ce que chaque test ci-dessous tient :
 *  - à l'approbation, l'écriture part UNE fois (la demande est réclamée par une
 *    transition atomique `approved → writing` sur SON identifiant) ;
 *  - par la même porte, avec la charge utile FIGÉE à la demande (ce qui a été
 *    montré est ce qui part) ;
 *  - jamais sans approbation, et jamais une demande auto-approuvée (un clic
 *    d'utilisateur a déjà écrit en ligne : elle ne repart pas d'ici) ;
 *  - un délai n'est pas un échec : `unknown`, qui arrête toute reprise.
 * Aucun appel CRM réel : `fetch` est simulé.
 */

const USER = '11111111-1111-1111-1111-111111111111'
const REVIEWER = '33333333-3333-3333-3333-333333333333'
const WORKSPACE = '22222222-2222-2222-2222-222222222222'
const reviewer = { userId: REVIEWER, email: 'lead@esn.fr' } as CurrentUserPayload

function requestRow(over: Partial<OutboundWriteRequestEntity> = {}): OutboundWriteRequestEntity {
  return {
    id: 'owr-1',
    workspace_id: WORKSPACE,
    requested_by: USER,
    provider: 'hubspot',
    kind: 'create_note',
    payload: { externalId: 'hs-contact-9', note: 'Appel de 4 min avec Claire' },
    preview: [],
    origin: 'system',
    state: 'pending',
    idempotency_key: 'telephony:aircall:call-1',
    decided_by: null,
    decided_at: null,
    expires_at: new Date(Date.now() + 86_400_000),
    provider_response: null,
    created_at: new Date(),
    ...over,
  } as OutboundWriteRequestEntity
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
      const existing = rows.find(row => row.id === value.id)
      if (existing) return Object.assign(existing, value)
      rows.push(value)
      return value
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

function build(rows: OutboundWriteRequestEntity[]) {
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

describe('#1943.8 — une écriture CRM approuvée PART, une fois, telle qu’elle a été montrée', () => {
  const OLD_ENV = { ...process.env }
  let fetchMock: jest.SpyInstance

  beforeEach(() => {
    process.env['HUBSPOT_CLIENT_ID'] = 'cid'
    process.env['HUBSPOT_CLIENT_SECRET'] = 'csecret'
    process.env['HUBSPOT_REDIRECT_URI'] = 'https://api.test/crm/hubspot/callback'
    process.env['INTERNAL_API_SECRET'] = 'internal-secret-for-state'
    process.env['CRM_TOKEN_ENC_KEY'] = 'enc-key-with-enough-entropy-123456789'
    fetchMock = jest.spyOn(global, 'fetch' as never).mockImplementation((async () => ({
      ok: true,
      status: 200,
      json: async () => ({ id: 'note-1' }),
      text: async () => '',
    })) as never)
  })
  afterEach(() => {
    process.env = { ...OLD_ENV }
    jest.restoreAllMocks()
  })

  it('PROUVE LE DÉFAUT : valider une demande de système l’ÉCRIT dans le CRM (elle restait « approuvée » à jamais)', async () => {
    const { controller, rows } = build([requestRow()])

    const view = await controller.decideWrite(reviewer, 'owr-1', { approve: true })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(rows[0]).toMatchObject({ state: 'written', provider_response: 'note-1', decided_by: REVIEWER })
    expect(view.state).toBe('written')
  })

  it('ce qui part est ce qui a été MONTRÉ : la charge utile figée à la demande, rien d’autre', async () => {
    const { controller } = build([requestRow()])
    await controller.decideWrite(reviewer, 'owr-1', { approve: true })
    const init = fetchMock.mock.calls[0]?.[1] as { body: string }
    const body = JSON.parse(init.body) as {
      properties: { hs_note_body: string }
      associations: { to: { id: string } }[]
    }
    expect(body.properties.hs_note_body).toBe('Appel de 4 min avec Claire')
    expect(body.associations[0]?.to.id).toBe('hs-contact-9')
  })

  it('I5 — deux validations, un effet : la seconde est refusée, rien ne repart', async () => {
    const { controller } = build([requestRow()])
    await controller.decideWrite(reviewer, 'owr-1', { approve: true })
    await expect(controller.decideWrite(reviewer, 'owr-1', { approve: true })).rejects.toBeInstanceOf(ConflictException)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('I5 — deux écritures CONCURRENTES de la même demande approuvée : une seule part', async () => {
    const { crm } = build([requestRow({ state: 'approved', decided_by: REVIEWER, decided_at: new Date() })])
    const outcomes = await Promise.allSettled([
      crm.writeApproved(WORKSPACE, 'owr-1'),
      crm.writeApproved(WORKSPACE, 'owr-1'),
    ])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(outcomes.filter(outcome => outcome.status === 'fulfilled')).toHaveLength(1)
  })

  it('jamais sans approbation : refuser n’écrit rien, et une demande en attente ne part pas', async () => {
    const { controller, crm, rows } = build([requestRow(), requestRow({ id: 'owr-2' })])
    await controller.decideWrite(reviewer, 'owr-1', { approve: false })
    await expect(crm.writeApproved(WORKSPACE, 'owr-2')).rejects.toBeInstanceOf(ForbiddenException)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(rows.map(row => row.state)).toEqual(['rejected', 'pending'])
  })

  it('jamais auto-approuvée : une demande d’UTILISATEUR (déjà écrite au clic) ne repart pas par ce chemin', async () => {
    const { crm, rows } = build([requestRow({ origin: 'user', state: 'approved', decided_by: USER })])
    await expect(crm.writeApproved(WORKSPACE, 'owr-1')).rejects.toBeInstanceOf(ConflictException)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(rows[0]?.state).toBe('approved')
  })

  it('une approbation EXPIRÉE ne part pas', async () => {
    const { crm } = build([
      requestRow({ state: 'approved', decided_by: REVIEWER, expires_at: new Date(Date.now() - 1000) }),
    ])
    await expect(crm.writeApproved(WORKSPACE, 'owr-1')).rejects.toBeInstanceOf(ConflictException)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('un délai n’est pas un échec : la requête PARTIE sans réponse est `unknown`, et ne se retente pas', async () => {
    fetchMock.mockImplementation((async () => {
      throw Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' })
    }) as never)
    const { controller, crm, rows } = build([requestRow()])

    const view = await controller.decideWrite(reviewer, 'owr-1', { approve: true })

    expect(view.state).toBe('unknown')
    expect(rows[0]?.state).toBe('unknown')
    await expect(crm.writeApproved(WORKSPACE, 'owr-1')).rejects.toBeInstanceOf(ForbiddenException)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('une connexion JAMAIS établie est un échec (`failed`), pas un `unknown`', async () => {
    fetchMock.mockImplementation((async () => {
      throw Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' })
    }) as never)
    const { controller, rows } = build([requestRow()])
    expect((await controller.decideWrite(reviewer, 'owr-1', { approve: true })).state).toBe('failed')
    expect(rows[0]?.state).toBe('failed')
  })

  it('une écriture qui ne peut pas partir d’ICI (autre fournisseur) est validée, ne part pas, et le DIT', async () => {
    const { controller, rows } = build([requestRow({ provider: 'pipedrive', kind: 'export_contact', payload: {} })])
    await expect(controller.decideWrite(reviewer, 'owr-1', { approve: true })).rejects.toThrow(/rien n.a été écrit/)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(rows[0]?.state).toBe('approved')
  })
})
