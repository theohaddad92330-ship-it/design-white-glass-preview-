import { NotFoundException } from '@nestjs/common'
import type { Repository } from 'typeorm'
import { makeFakeConnectionRepo } from '../../common/util/fake-connection-repo.testing'
import type { GoogleConnectionEntity } from '../../database/entities/google-connection.entity'
import type { IaClient } from '../ia/ia.client'
import type { SuppressionService } from '../mailer/suppression.service'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import { GoogleService } from './google.service'

/**
 * #4546.5 — l'expéditeur se CHOISIT parmi SES boîtes. L'envoi part avec le jeton de la boîte désignée, jamais de la
 * « première » ; la boîte d'un collègue de l'espace est refusée.
 */
const ALICE = '11111111-1111-1111-1111-111111111111'
const BOB = '33333333-3333-3333-3333-333333333333'
const WORKSPACE = '22222222-2222-2222-2222-222222222222'
const ENV = {
  GOOGLE_CLIENT_ID: 'cid',
  GOOGLE_CLIENT_SECRET: 'csecret',
  GOOGLE_REDIRECT_URI: 'https://api.example.com/google/callback',
  INTERNAL_API_SECRET: 'internal-secret-with-entropy-123456',
  CRM_TOKEN_ENC_KEY: 'enc-key-with-enough-entropy-123456789',
}

function stubGoogle() {
  const sentWith: string[] = []
  jest.spyOn(global, 'fetch' as never).mockImplementation((async (
    input: string | URL,
    init?: { body?: unknown; headers?: Record<string, string> },
  ) => {
    const url = String(input)
    if (url.includes('/token')) {
      const code = new URLSearchParams(String(init?.body)).get('code') ?? ''
      return {
        ok: true,
        status: 200,
        json: async () => ({
          access_token: `AT-${code}`,
          refresh_token: `RT-${code}`,
          expires_in: 3600,
          scope: 'https://www.googleapis.com/auth/gmail.send',
        }),
      }
    }
    if (url.includes('/gmail/v1/users/me/profile')) {
      const code = (init?.headers?.['Authorization'] ?? '').replace('Bearer AT-', '')
      return { ok: true, status: 200, json: async () => ({ emailAddress: `${code}@esn.fr` }) }
    }
    if (url.includes('/messages/send')) {
      sentWith.push(init?.headers?.['Authorization'] ?? '')
      return { ok: true, status: 200, json: async () => ({ id: 'm1', threadId: 't1' }) }
    }
    throw new Error(`unexpected fetch ${url}`)
  }) as never)
  return sentWith
}

function makeService() {
  const fake = makeFakeConnectionRepo()
  const workspace = {
    resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: WORKSPACE }),
  } as unknown as WorkspaceContextService
  const suppression = { isSuppressed: jest.fn().mockResolvedValue(false) } as unknown as SuppressionService
  const service = new GoogleService(
    fake as unknown as Repository<GoogleConnectionEntity>,
    workspace,
    {} as IaClient,
    suppression,
  )
  const consent = async (userId: string, code: string) => {
    const state = new URL(service.buildAuthorizeUrl(userId, 'read_write')).searchParams.get('state') ?? ''
    return service.handleCallback(code, state)
  }
  return { service, consent }
}

describe('GoogleService.sendGmail — le choix de l’expéditeur (#4546.5)', () => {
  const OLD = { ...process.env }
  beforeEach(() => Object.assign(process.env, ENV))
  afterEach(() => {
    process.env = { ...OLD }
    jest.restoreAllMocks()
  })
  const mail = { to: 'x@client.fr', subject: 's', body: 'b' }

  it('part avec le jeton de la boîte DÉSIGNÉE, pas de la première', async () => {
    const sentWith = stubGoogle()
    const { service, consent } = makeService()
    await consent(ALICE, 'c1')
    await consent(ALICE, 'c2')
    const boxes = await service.listConnections(ALICE)
    const second = boxes.find(box => box.accountLabel === 'c2@esn.fr')
    expect(second).toBeDefined()

    await service.sendGmail(ALICE, { ...mail, connectionId: second?.id })

    expect(sentWith).toEqual(['Bearer AT-c2'])
  })

  it('REFUS — la boîte d’un collègue du même espace n’est ni vue ni utilisable', async () => {
    const sentWith = stubGoogle()
    const { service, consent } = makeService()
    await consent(ALICE, 'c1')
    await consent(BOB, 'c3')
    const bobBox = (await service.listConnections(BOB))[0]
    expect(bobBox).toBeDefined()

    await expect(service.sendGmail(ALICE, { ...mail, connectionId: bobBox?.id })).rejects.toBeInstanceOf(
      NotFoundException,
    )
    expect(sentWith).toEqual([])
    expect((await service.listConnections(ALICE)).map(box => box.id)).not.toContain(bobBox?.id)
  })
})
