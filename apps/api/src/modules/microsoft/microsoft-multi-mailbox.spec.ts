import { BadRequestException } from '@nestjs/common'
import type { Repository } from 'typeorm'
import { makeFakeConnectionRepo } from '../../common/util/fake-connection-repo.testing'
import type { MicrosoftConnectionEntity } from '../../database/entities/microsoft-connection.entity'
import { decryptToken } from '../crm/crm-token.crypto'
import type { SuppressionService } from '../mailer/suppression.service'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import { MicrosoftService } from './microsoft.service'

/** #4546 — critères 1 à 4 côté Outlook, sur un dépôt à l'état réel. */
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

/** Une boîte par code ; `null` = /me indisponible (le client rend alors un profil vide). */
function stubMicrosoft(mailboxByCode: Record<string, string | null>) {
  jest.spyOn(global, 'fetch' as never).mockImplementation((async (input: string | URL, init?: { body?: unknown }) => {
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
      const auth = ((init as { headers?: Record<string, string> })?.headers ?? {})['Authorization'] ?? ''
      const mail = mailboxByCode[auth.replace('Bearer AT-', '')]
      if (!mail) return { ok: false, status: 403, text: async () => 'denied', json: async () => ({}) }
      return { ok: true, status: 200, json: async () => ({ id: `graph-${mail}`, mail, userPrincipalName: mail }) }
    }
    throw new Error(`unexpected fetch ${url}`)
  }) as never)
}

function makeService() {
  const fake = makeFakeConnectionRepo()
  const workspace = {
    resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: WORKSPACE }),
  } as unknown as WorkspaceContextService
  const service = new MicrosoftService(
    fake as unknown as Repository<MicrosoftConnectionEntity>,
    workspace,
    {} as SuppressionService,
  )
  const consent = async (userId: string, code: string) => {
    const state = new URL(service.buildAuthorizeUrl(userId)).searchParams.get('state') ?? ''
    return service.handleCallback(code, state)
  }
  return { fake, service, consent }
}

describe('MicrosoftService — plusieurs boîtes par commercial (#4546)', () => {
  const OLD = { ...process.env }
  beforeEach(() => Object.assign(process.env, ENV))
  afterEach(() => {
    process.env = { ...OLD }
    jest.restoreAllMocks()
  })

  it('critère 1+2 — deux consentements ⇒ DEUX lignes, DEUX jeux de jetons, chacune nommée', async () => {
    stubMicrosoft({ c1: 'nominative@esn.fr', c2: 'filiale@marque.fr' })
    const { fake, service, consent } = makeService()
    await consent(ALICE, 'c1')
    await consent(ALICE, 'c2')
    expect(fake.rows).toHaveLength(2)
    expect(fake.rows.map(r => r['account_label'])).toEqual(['nominative@esn.fr', 'filiale@marque.fr'])
    expect(fake.rows.map(r => decryptToken(String(r['access_token_enc'])))).toEqual(['AT-c1', 'AT-c2'])
    expect(fake.rows.map(r => decryptToken(String(r['refresh_token_enc'])))).toEqual(['RT-c1', 'RT-c2'])
    expect(await service.listConnections(ALICE)).toHaveLength(2)
  })

  it('reconsentir la MÊME boîte la met à jour', async () => {
    stubMicrosoft({ c1: 'nominative@esn.fr', c1bis: 'nominative@esn.fr' })
    const { fake, consent } = makeService()
    await consent(ALICE, 'c1')
    await consent(ALICE, 'c1bis')
    expect(fake.rows).toHaveLength(1)
    expect(decryptToken(String(fake.rows[0]?.['access_token_enc']))).toBe('AT-c1bis')
  })

  it("profil illisible : une 2e boîte n'écrase JAMAIS une boîte nommée", async () => {
    stubMicrosoft({ c1: 'nominative@esn.fr', c2: null })
    const { fake, consent } = makeService()
    await consent(ALICE, 'c1')
    await consent(ALICE, 'c2')
    expect(fake.rows).toHaveLength(2)
    const named = fake.rows.find(r => r['account_label'] === 'nominative@esn.fr')
    expect(decryptToken(String(named?.['access_token_enc']))).toBe('AT-c1')
  })

  it('critère 3 — débrancher désigne UNE boîte ; sans désignation avec plusieurs ⇒ refus', async () => {
    stubMicrosoft({ c1: 'a@esn.fr', c2: 'b@marque.fr' })
    const { fake, service, consent } = makeService()
    await consent(ALICE, 'c1')
    await consent(ALICE, 'c2')
    await expect(service.disconnect(ALICE)).rejects.toBeInstanceOf(BadRequestException)
    expect(fake.rows).toHaveLength(2)
    await service.disconnect(ALICE, String(fake.rows[0]?.id))
    expect(fake.rows.map(r => r['account_label'])).toEqual(['b@marque.fr'])
  })

  it("critère 4 (REFUS) — un collègue ne voit ni ne débranche la boîte d'un autre", async () => {
    stubMicrosoft({ c1: 'alice@esn.fr', c2: 'bob@esn.fr' })
    const { fake, service, consent } = makeService()
    await consent(ALICE, 'c1')
    await consent(BOB, 'c2')
    expect((await service.listConnections(BOB)).map(c => c.accountLabel)).toEqual(['bob@esn.fr'])
    await service.disconnect(BOB, String(fake.rows.find(r => r['user_id'] === ALICE)?.id))
    expect(fake.rows).toHaveLength(2)
  })
})
