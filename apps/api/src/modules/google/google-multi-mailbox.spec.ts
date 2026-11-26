import { BadRequestException } from '@nestjs/common'
import type { Repository } from 'typeorm'
import { makeFakeConnectionRepo } from '../../common/util/fake-connection-repo.testing'
import type { GoogleConnectionEntity } from '../../database/entities/google-connection.entity'
import { decryptToken } from '../crm/crm-token.crypto'
import type { IaClient } from '../ia/ia.client'
import type { SuppressionService } from '../mailer/suppression.service'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import { GoogleService } from './google.service'

/**
 * #4546 — critères d'acceptation 1 à 4, sur un dépôt À L'ÉTAT RÉEL (pas de mock
 * qui répond ce qu'on lui dicte) : c'est l'état des lignes qui prouve.
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

/** Une adresse par code de consentement ; `null` = le fournisseur ne rend pas le profil (403). */
function stubGoogle(mailboxByCode: Record<string, string | null>) {
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
          scope: 'https://www.googleapis.com/auth/gmail.send',
        }),
      }
    }
    if (url.includes('/gmail/v1/users/me/profile')) {
      const auth = ((init as { headers?: Record<string, string> })?.headers ?? {})['Authorization'] ?? ''
      const email = mailboxByCode[auth.replace('Bearer AT-', '')]
      if (email === null || email === undefined) {
        return { ok: false, status: 403, text: async () => 'insufficient scope', json: async () => ({}) }
      }
      return { ok: true, status: 200, json: async () => ({ emailAddress: email }) }
    }
    throw new Error(`unexpected fetch ${url}`)
  }) as never)
}

function makeService() {
  const fake = makeFakeConnectionRepo()
  const workspace = {
    resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: WORKSPACE }),
  } as unknown as WorkspaceContextService
  const service = new GoogleService(
    fake as unknown as Repository<GoogleConnectionEntity>,
    workspace,
    {} as IaClient,
    {} as SuppressionService,
  )
  const consent = async (userId: string, code: string) => {
    const state = new URL(service.buildAuthorizeUrl(userId, 'read_write')).searchParams.get('state') ?? ''
    return service.handleCallback(code, state)
  }
  return { fake, service, consent }
}

describe('GoogleService — plusieurs boîtes par commercial (#4546)', () => {
  const OLD = { ...process.env }
  beforeEach(() => Object.assign(process.env, ENV))
  afterEach(() => {
    process.env = { ...OLD }
    jest.restoreAllMocks()
  })

  it('critère 1+2 — deux consentements successifs ⇒ DEUX lignes, DEUX jeux de jetons, chacune nommée', async () => {
    stubGoogle({ c1: 'nominative@esn.fr', c2: 'prospection@marque.fr' })
    const { fake, service, consent } = makeService()
    expect(await consent(ALICE, 'c1')).toEqual({ ok: true })
    expect(await consent(ALICE, 'c2')).toEqual({ ok: true })

    expect(fake.rows).toHaveLength(2)
    expect(fake.rows.map(r => r['account_label'])).toEqual(['nominative@esn.fr', 'prospection@marque.fr'])
    expect(fake.rows.map(r => decryptToken(String(r['access_token_enc'])))).toEqual(['AT-c1', 'AT-c2'])
    expect(fake.rows.map(r => decryptToken(String(r['refresh_token_enc'])))).toEqual(['RT-c1', 'RT-c2'])
    expect((await service.listConnections(ALICE)).map(c => c.accountLabel).sort()).toEqual([
      'nominative@esn.fr',
      'prospection@marque.fr',
    ])
  })

  it('reconsentir la MÊME boîte la met à jour (pas de doublon)', async () => {
    stubGoogle({ c1: 'nominative@esn.fr', c1bis: 'nominative@esn.fr' })
    const { fake, consent } = makeService()
    await consent(ALICE, 'c1')
    await consent(ALICE, 'c1bis')
    expect(fake.rows).toHaveLength(1)
    expect(decryptToken(String(fake.rows[0]?.['access_token_enc']))).toBe('AT-c1bis')
  })

  it("sans adresse lisible (portée de profil absente), une 2e boîte n'écrase JAMAIS une boîte nommée", async () => {
    stubGoogle({ c1: 'nominative@esn.fr', c2: null })
    const { fake, consent } = makeService()
    expect(await consent(ALICE, 'c1')).toEqual({ ok: true })
    expect(await consent(ALICE, 'c2')).toEqual({ ok: true })
    expect(fake.rows).toHaveLength(2)
    const named = fake.rows.find(r => r['account_label'] === 'nominative@esn.fr')
    expect(decryptToken(String(named?.['access_token_enc']))).toBe('AT-c1')
  })

  it('critère 3 — débrancher désigne UNE boîte et laisse les autres intactes', async () => {
    stubGoogle({ c1: 'a@esn.fr', c2: 'b@marque.fr', c3: 'c@prospect.fr' })
    const { fake, service, consent } = makeService()
    await consent(ALICE, 'c1')
    await consent(ALICE, 'c2')
    await consent(ALICE, 'c3')
    const target = fake.rows.find(r => r['account_label'] === 'b@marque.fr')
    await service.disconnect(ALICE, String(target?.id))
    expect(fake.rows.map(r => r['account_label'])).toEqual(['a@esn.fr', 'c@prospect.fr'])
  })

  it('débrancher sans désigner la boîte quand il y en a plusieurs est refusé — jamais une boîte devinée', async () => {
    stubGoogle({ c1: 'a@esn.fr', c2: 'b@marque.fr' })
    const { fake, service, consent } = makeService()
    await consent(ALICE, 'c1')
    await consent(ALICE, 'c2')
    await expect(service.disconnect(ALICE)).rejects.toBeInstanceOf(BadRequestException)
    expect(fake.rows).toHaveLength(2)
  })

  it('débrancher sans désigner reste permis quand il n’y a qu’une boîte (compatibilité)', async () => {
    stubGoogle({ c1: 'a@esn.fr' })
    const { fake, service, consent } = makeService()
    await consent(ALICE, 'c1')
    await service.disconnect(ALICE)
    expect(fake.rows).toHaveLength(0)
  })

  it("critère 4 (REFUS) — un collègue du même espace ne voit pas, ne débranche pas les boîtes d'un autre", async () => {
    stubGoogle({ c1: 'alice@esn.fr', c2: 'bob@esn.fr' })
    const { fake, service, consent } = makeService()
    await consent(ALICE, 'c1')
    await consent(BOB, 'c2')

    const bobsView = await service.listConnections(BOB)
    expect(bobsView.map(c => c.accountLabel)).toEqual(['bob@esn.fr'])
    expect(JSON.stringify(bobsView)).not.toContain('alice@esn.fr')

    const alices = fake.rows.find(r => r['user_id'] === ALICE)
    await service.disconnect(BOB, String(alices?.id))
    expect(fake.rows).toHaveLength(2)
  })

  it("aucun jeton n'est rendu par listConnections", async () => {
    stubGoogle({ c1: 'a@esn.fr' })
    const { service, consent } = makeService()
    await consent(ALICE, 'c1')
    const dump = JSON.stringify(await service.listConnections(ALICE))
    expect(dump).not.toContain('AT-c1')
    expect(dump).not.toContain('_enc')
  })
})
