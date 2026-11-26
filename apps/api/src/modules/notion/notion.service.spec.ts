import type { Repository } from 'typeorm'
import type { NotionConnectionEntity } from '../../database/entities/notion-connection.entity'
import type { IaClient, IaEnvelope } from '../ia/ia.client'
import type { WorkspaceContextService } from '../workspace/workspace-context.service'
import { encryptToken } from '../crm/crm-token.crypto'
import { readNotionConfig } from './notion-config'
import { NotionService } from './notion.service'

const USER = '11111111-1111-1111-1111-111111111111'
const WORKSPACE = '22222222-2222-2222-2222-222222222222'

function makeRepo() {
  return {
    findOne: jest.fn().mockResolvedValue(null),
    insert: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<Repository<NotionConnectionEntity>>
}

function makeWorkspace() {
  return {
    resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: WORKSPACE }),
  } as unknown as jest.Mocked<WorkspaceContextService>
}

function makeIa() {
  return {
    ragIngest: jest.fn().mockResolvedValue({ success: true, data: { id: 'doc-1' } } satisfies IaEnvelope),
  } as unknown as jest.Mocked<IaClient>
}

const CONFIGURED_ENV = {
  NOTION_CLIENT_ID: 'cid',
  NOTION_CLIENT_SECRET: 'csecret',
  NOTION_REDIRECT_URI: 'https://api.example.com/notion/callback',
  INTERNAL_API_SECRET: 'internal-secret-with-entropy-123456',
}

type Init = { method?: string; body?: string }
function stubFetch(handler: (url: string, method: string) => { status?: number; body?: unknown }): jest.Mock {
  return jest.spyOn(global, 'fetch' as never).mockImplementation((async (input: string | URL, init?: Init) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    const { status = 200, body = {} } = handler(url, method)
    return { ok: status >= 200 && status < 300, status, json: async () => body }
  }) as never) as unknown as jest.Mock
}

describe('readNotionConfig', () => {
  const OLD = { ...process.env }
  afterEach(() => {
    process.env = { ...OLD }
  })

  it('is null (no-op) unless the three required vars are set', () => {
    delete process.env['NOTION_CLIENT_ID']
    expect(readNotionConfig()).toBeNull()
    Object.assign(process.env, CONFIGURED_ENV)
    const cfg = readNotionConfig()
    expect(cfg).not.toBeNull()
    expect(cfg?.clientId).toBe('cid')
    expect(cfg?.redirectUri).toBe(CONFIGURED_ENV.NOTION_REDIRECT_URI)
  })
})

describe('NotionService', () => {
  const OLD = { ...process.env }
  afterEach(() => {
    process.env = { ...OLD }
    jest.restoreAllMocks()
  })

  it('getStatus is a pure no-op when unconfigured (never touches DB, workspace, or network)', async () => {
    delete process.env['NOTION_CLIENT_ID']
    const repo = makeRepo()
    const ws = makeWorkspace()
    const fetchSpy = stubFetch(() => ({ body: {} }))
    const svc = new NotionService(repo, ws, makeIa())

    const status = await svc.getStatus(USER)
    expect(status).toEqual({ configured: false, connected: false })
    expect(ws.resolveActiveWorkspace).not.toHaveBeenCalled()
    expect(repo.findOne).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('reports connected with the workspace label when a connection exists', async () => {
    Object.assign(process.env, CONFIGURED_ENV)
    const repo = makeRepo()
    ;(repo.findOne as jest.Mock).mockResolvedValue({
      workspace_name: 'Team Bellum',
      created_at: new Date('2026-07-16'),
    })
    const svc = new NotionService(repo, makeWorkspace(), makeIa())
    const status = await svc.getStatus(USER)
    expect(status).toMatchObject({
      configured: true,
      connected: true,
      provider: 'notion',
      accountLabel: 'Team Bellum',
    })
  })

  it('builds a Notion authorize URL with owner=user and a signed state', () => {
    Object.assign(process.env, CONFIGURED_ENV)
    const svc = new NotionService(makeRepo(), makeWorkspace(), makeIa())
    const url = new URL(svc.buildAuthorizeUrl(USER))
    expect(url.origin + url.pathname).toBe('https://api.notion.com/v1/oauth/authorize')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('owner')).toBe('user')
    expect(url.searchParams.get('client_id')).toBe('cid')
    expect(url.searchParams.get('redirect_uri')).toBe(CONFIGURED_ENV.NOTION_REDIRECT_URI)
    const state = url.searchParams.get('state') ?? ''
    expect(state.split('.')).toHaveLength(2) // payload.signature
  })

  it('callback with a tampered state fails gracefully (no throw to browser)', async () => {
    Object.assign(process.env, CONFIGURED_ENV)
    const svc = new NotionService(makeRepo(), makeWorkspace(), makeIa())
    await expect(svc.handleCallback('code', 'not-a-valid-state')).resolves.toEqual({
      ok: false,
      reason: 'invalid_state',
    })
  })

  it('callback exchanges the code and persists an encrypted connection', async () => {
    Object.assign(process.env, CONFIGURED_ENV)
    const repo = makeRepo()
    const svc = new NotionService(repo, makeWorkspace(), makeIa())
    // A valid state is the one minted by buildAuthorizeUrl.
    const state = new URL(svc.buildAuthorizeUrl(USER)).searchParams.get('state') ?? ''

    stubFetch((url, method) => {
      if (method === 'POST' && url.endsWith('/oauth/token')) {
        return {
          body: {
            access_token: 'secret-notion-token',
            workspace_id: 'ws-notion',
            workspace_name: 'Team Bellum',
            bot_id: 'bot-1',
          },
        }
      }
      throw new Error(`unexpected ${method} ${url}`)
    })

    const result = await svc.handleCallback('auth-code', state)
    expect(result).toEqual({ ok: true })
    expect(repo.insert).toHaveBeenCalledTimes(1)
    const inserted = (repo.insert as jest.Mock).mock.calls[0][0]
    expect(inserted.workspace_name).toBe('Team Bellum')
    expect(inserted.workspace_id).toBe(WORKSPACE)
    // Token stored encrypted, never in clear.
    expect(inserted.access_token_enc).toEqual(expect.stringMatching(/^v1:/))
    expect(inserted.access_token_enc).not.toContain('secret-notion-token')
  })

  it('ingest fetches a Notion page and routes its text to the EXISTING RAG pipeline', async () => {
    Object.assign(process.env, CONFIGURED_ENV)
    const repo = makeRepo()
    ;(repo.findOne as jest.Mock).mockResolvedValue({
      id: 'conn-1',
      access_token_enc: encryptToken('secret-notion-token'),
    })
    const ia = makeIa()
    const svc = new NotionService(repo, makeWorkspace(), ia)

    const fetchSpy = stubFetch((url, method) => {
      if (method === 'GET' && url.includes('/blocks/') && url.includes('/children')) {
        return {
          body: {
            results: [
              { object: 'block', type: 'heading_1', heading_1: { rich_text: [{ plain_text: 'Plan de compte' }] } },
              { object: 'block', type: 'paragraph', paragraph: { rich_text: [{ plain_text: 'Cibler la DSI.' }] } },
            ],
            has_more: false,
            next_cursor: null,
          },
        }
      }
      throw new Error(`unexpected ${method} ${url}`)
    })

    const result = await svc.ingestPage(USER, { pageId: 'page-123', title: 'Méthodo sales', category: 'Notion' })
    expect(result).toEqual({ success: true, data: { id: 'doc-1' } })

    // The Notion page content reached the shared RAG ingest (no new pipeline).
    expect(ia.ragIngest).toHaveBeenCalledTimes(1)
    const ingestArg = (ia.ragIngest as jest.Mock).mock.calls[0][0]
    expect(ingestArg).toMatchObject({ userId: USER, title: 'Méthodo sales', category: 'Notion' })
    expect(ingestArg.content).toContain('Plan de compte')
    expect(ingestArg.content).toContain('Cibler la DSI.')
    // The block-children endpoint was actually called with the page id.
    expect(fetchSpy.mock.calls.some(([u]) => String(u).includes('page-123'))).toBe(true)
  })

  it('ingest rejects a page with no extractable text (no fake data)', async () => {
    Object.assign(process.env, CONFIGURED_ENV)
    const repo = makeRepo()
    ;(repo.findOne as jest.Mock).mockResolvedValue({ id: 'conn-1', access_token_enc: encryptToken('t') })
    const ia = makeIa()
    const svc = new NotionService(repo, makeWorkspace(), ia)
    stubFetch(() => ({ body: { results: [], has_more: false, next_cursor: null } }))

    await expect(svc.ingestPage(USER, { pageId: 'empty-page' })).rejects.toThrow(/aucun texte/i)
    expect(ia.ragIngest).not.toHaveBeenCalled()
  })

  it('disconnect deletes the connection scoped to the active workspace', async () => {
    Object.assign(process.env, CONFIGURED_ENV)
    const repo = makeRepo()
    const svc = new NotionService(repo, makeWorkspace(), makeIa())
    await svc.disconnect(USER)
    expect(repo.delete).toHaveBeenCalledWith({ workspace_id: WORKSPACE })
  })
})
