import { NotFoundException } from '@nestjs/common'
import type { Repository } from 'typeorm'
import { makeFakeConnectionRepo } from '../../common/util/fake-connection-repo.testing'
import type { MicrosoftConnectionEntity } from '../../database/entities/microsoft-connection.entity'
import type { SuppressionService } from '../mailer/suppression.service'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import { MicrosoftService } from './microsoft.service'

/** #4546.5 côté Outlook — l'envoi part de la boîte DÉSIGNÉE ; celle d'un collègue est refusée. */
const ALICE = '11111111-1111-1111-1111-111111111111'
const BOB = '33333333-3333-3333-3333-333333333333'
const WORKSPACE = '22222222-2222-2222-2222-222222222222'
const ENV = {
  MICROSOFT_CLIENT_ID: 'cid',
  MICROSOFT_CLIENT_SECRET: 'csecret',
  MICROSOFT_REDIRECT_URI: 'https://api.example.com/microsoft/callback',
  INTERNAL_API_SECRET: 'internal-secret-with-entropy-123456',
  CRM_TOKEN_ENC_KEY: 'enc-key-with-enough-entropy-123456789',
}

function stubMicrosoft() {
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
          scope: 'Mail.Send',
        }),
      }
    }
    if (url.endsWith('/me')) {
      const code = (init?.headers?.['Authorization'] ?? '').replace('Bearer AT-', '')
      const mail = `${code}@esn.fr`
      return { ok: true, status: 200, json: async () => ({ id: `graph-${code}`, mail, userPrincipalName: mail }) }
    }
    if (url.endsWith('/me/sendMail')) {
      sentWith.push(init?.headers?.['Authorization'] ?? '')
      return { ok: true, status: 202, text: async () => '', json: async () => ({}) }
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
  const service = new MicrosoftService(fake as unknown as Repository<MicrosoftConnectionEntity>, workspace, suppression)
  const consent = async (userId: string, code: string) => {
    const state = new URL(service.buildAuthorizeUrl(userId)).searchParams.get('state') ?? ''
    return service.handleCallback(code, state)
  }
  return { service, consent }
}

describe('MicrosoftService.sendMail — le choix de l’expéditeur (#4546.5)', () => {
  const OLD = { ...process.env }
  beforeEach(() => Object.assign(process.env, ENV))
  afterEach(() => {
    process.env = { ...OLD }
    jest.restoreAllMocks()
  })
  const mail = { to: 'x@client.fr', subject: 's', body: 'b' }

  it('part avec le jeton de la boîte DÉSIGNÉE', async () => {
    const sentWith = stubMicrosoft()
    const { service, consent } = makeService()
    await consent(ALICE, 'c1')
    await consent(ALICE, 'c2')
    const second = (await service.listConnections(ALICE)).find(box => box.accountLabel === 'c2@esn.fr')
    expect(second).toBeDefined()

    await service.sendMail(ALICE, { ...mail, connectionId: second?.id })

    expect(sentWith).toEqual(['Bearer AT-c2'])
  })

  it('REFUS — la boîte d’un collègue du même espace est refusée, rien ne part', async () => {
    const sentWith = stubMicrosoft()
    const { service, consent } = makeService()
    await consent(ALICE, 'c1')
    await consent(BOB, 'c3')
    const bobBox = (await service.listConnections(BOB))[0]

    await expect(service.sendMail(ALICE, { ...mail, connectionId: bobBox?.id })).rejects.toBeInstanceOf(
      NotFoundException,
    )
    expect(sentWith).toEqual([])
  })
})
