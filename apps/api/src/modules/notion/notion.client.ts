import type { NotionConfig } from './notion-config'

/**
 * Thin Notion REST wrapper. No SDK — OAuth token exchange, the search endpoint
 * and block-children pagination are all the ingestion flow needs, and staying on
 * `fetch` keeps the dependency surface small. Every call checks `res.ok` (code
 * rule) and surfaces a clear error rather than an invented fallback.
 *
 * Endpoints (verified against developers.notion.com — never invented):
 *   POST https://api.notion.com/v1/oauth/token           (Basic auth, code→token)
 *   POST https://api.notion.com/v1/search                (list shared pages/DBs)
 *   GET  https://api.notion.com/v1/blocks/{id}/children  (page content, paginated)
 */

const NOTION_API_BASE = 'https://api.notion.com/v1'
/**
 * Notion pins its API by a dated version header (required on every data call).
 * `2022-06-28` is Notion's long-standing stable version — kept explicit so an
 * upstream default bump can never silently change response shapes under us.
 */
const NOTION_VERSION = '2022-06-28'
/** Cap pagination so a huge page can't run unbounded requests. */
const MAX_BLOCK_PAGES = 20

export type NotionTokens = {
  accessToken: string
  /** Notion workspace id the token is bound to. */
  workspaceId: string | null
  /** Human label for the connected workspace. */
  workspaceName: string | null
  botId: string | null
}

/** One page or database the integration can see, normalized for the UI. */
export type NotionPageSummary = {
  id: string
  title: string
  /** Notion object kind — a top-level page or a database. */
  type: 'page' | 'database'
  url: string | null
}

function basicAuthHeader(clientId: string, clientSecret: string): string {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
}

function notionHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
  }
}

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string; error?: string; code?: string }
    return body?.message || body?.error || body?.code || `HTTP ${res.status}`
  } catch {
    return `HTTP ${res.status}`
  }
}

/** Concatenate the `plain_text` of a Notion rich-text array (safe on any shape). */
function richTextToPlain(rich: unknown): string {
  if (!Array.isArray(rich)) return ''
  return rich
    .map(item =>
      item && typeof item === 'object' && 'plain_text' in item
        ? String((item as { plain_text?: unknown }).plain_text ?? '')
        : '',
    )
    .join('')
}

/**
 * Extract a human title from a search result. Databases carry a top-level
 * `title` rich-text array; pages carry it inside the property whose type is
 * `title`. Falls back to "Sans titre" so a page always lands with a label.
 */
function extractTitle(obj: Record<string, unknown>): string {
  const topLevel = richTextToPlain(obj['title']).trim()
  if (topLevel) return topLevel

  const properties = obj['properties']
  if (properties && typeof properties === 'object') {
    for (const value of Object.values(properties as Record<string, unknown>)) {
      if (value && typeof value === 'object' && (value as { type?: string }).type === 'title') {
        const title = richTextToPlain((value as { title?: unknown }).title).trim()
        if (title) return title
      }
    }
  }
  return 'Sans titre'
}

/** Pull the readable text out of a single Notion block, or '' if it carries none. */
function blockToText(block: Record<string, unknown>): string {
  const type = typeof block['type'] === 'string' ? (block['type'] as string) : ''
  if (!type) return ''
  const payload = block[type]
  if (payload && typeof payload === 'object' && 'rich_text' in payload) {
    return richTextToPlain((payload as { rich_text?: unknown }).rich_text)
  }
  return ''
}

export class NotionClient {
  constructor(private readonly config: NotionConfig) {}

  /** Exchange an authorization `code` for a workspace access token. Notion uses
   *  HTTP Basic auth (client_id:client_secret) on the token endpoint. */
  async exchangeCode(code: string): Promise<NotionTokens> {
    const res = await fetch(`${NOTION_API_BASE}/oauth/token`, {
      method: 'POST',
      headers: {
        Authorization: basicAuthHeader(this.config.clientId, this.config.clientSecret),
        'Content-Type': 'application/json',
        'Notion-Version': NOTION_VERSION,
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.config.redirectUri,
      }),
    })
    if (!res.ok) throw new Error(`Notion token exchange failed: ${await readError(res)}`)
    const data = (await res.json()) as Record<string, unknown>
    return {
      accessToken: String(data['access_token'] ?? ''),
      workspaceId: data['workspace_id'] ? String(data['workspace_id']) : null,
      workspaceName: data['workspace_name'] ? String(data['workspace_name']) : null,
      botId: data['bot_id'] ? String(data['bot_id']) : null,
    }
  }

  /** List every page and database shared with the integration (search with an
   *  empty query returns all accessible objects, most-recent first). */
  async listPages(accessToken: string, query = ''): Promise<NotionPageSummary[]> {
    const res = await fetch(`${NOTION_API_BASE}/search`, {
      method: 'POST',
      headers: notionHeaders(accessToken),
      body: JSON.stringify({
        query,
        sort: { direction: 'descending', timestamp: 'last_edited_time' },
        page_size: 50,
      }),
    })
    if (!res.ok) throw new Error(`Notion search failed: ${await readError(res)}`)
    const data = (await res.json()) as { results?: Array<Record<string, unknown>> }
    return (data?.results ?? []).map(result => {
      const object = result['object'] === 'database' ? 'database' : 'page'
      return {
        id: String(result['id'] ?? ''),
        title: extractTitle(result),
        type: object as 'page' | 'database',
        url: result['url'] ? String(result['url']) : null,
      }
    })
  }

  /**
   * Fetch a page's readable text: walk the block children (paginated) and join
   * each block's plain text with newlines. Nested children are not recursed — the
   * top-level blocks carry the bulk of the prose, and this keeps ingestion bounded.
   */
  async fetchPageText(accessToken: string, pageId: string): Promise<string> {
    const lines: string[] = []
    let cursor: string | null = null
    for (let page = 0; page < MAX_BLOCK_PAGES; page++) {
      const url = new URL(`${NOTION_API_BASE}/blocks/${encodeURIComponent(pageId)}/children`)
      url.searchParams.set('page_size', '100')
      if (cursor) url.searchParams.set('start_cursor', cursor)
      const res = await fetch(url.toString(), { method: 'GET', headers: notionHeaders(accessToken) })
      if (!res.ok) throw new Error(`Notion block fetch failed: ${await readError(res)}`)
      const data = (await res.json()) as {
        results?: Array<Record<string, unknown>>
        has_more?: boolean
        next_cursor?: string | null
      }
      for (const block of data?.results ?? []) {
        const text = blockToText(block).trim()
        if (text) lines.push(text)
      }
      if (!data?.has_more || !data?.next_cursor) break
      cursor = data.next_cursor
    }
    return lines.join('\n')
  }
}
