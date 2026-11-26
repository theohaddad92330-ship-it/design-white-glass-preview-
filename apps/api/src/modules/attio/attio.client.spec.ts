import type { CrmTaskInput } from '../crm/crm-task'
import { AttioClient } from './attio.client'

/**
 * A besoin lands in Attio as a **Note on the account's Company record** (a note
 * REQUIRES a parent). These specs pin: the company is resolved find-or-create by
 * name, and the note is posted with that company as its parent, carrying the
 * besoin title/content.
 */

type Init = { method?: string; body?: string }
function stubFetch(handler: (url: string, method: string) => { status?: number; body?: unknown }): jest.Mock {
  return jest.spyOn(global, 'fetch' as never).mockImplementation((async (input: string | URL, init?: Init) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    const { status = 200, body = {} } = handler(url, method)
    return { ok: status >= 200 && status < 300, status, json: async () => body }
  }) as never) as unknown as jest.Mock
}

const client = new AttioClient({
  clientId: 'c',
  clientSecret: 's',
  redirectUri: 'https://x/cb',
  scopes: 'record_permission:read_write',
  frontendUrl: 'https://app',
})
const input: CrmTaskInput = { subject: 'Besoin — TF1 : Régie', body: 'Détail du besoin', company: 'TF1' }

function noteBody(spy: jest.Mock): Record<string, unknown> {
  const call = spy.mock.calls.find(
    ([u, i]) => String(u).endsWith('/v2/notes') && (i as Init | undefined)?.method === 'POST',
  )
  const data = call ? (JSON.parse((call[1] as Init).body ?? '{}') as { data?: Record<string, unknown> }) : {}
  return (data.data ?? {}) as Record<string, unknown>
}

describe('AttioClient.createNote', () => {
  afterEach(() => jest.restoreAllMocks())

  it('rattache la Note à la Company EXISTANTE (pas de création de doublon)', async () => {
    const spy = stubFetch((url, method) => {
      if (url.endsWith('/companies/records/query') && method === 'POST')
        return { body: { data: [{ id: { record_id: 'co-1' } }] } }
      if (url.endsWith('/v2/notes') && method === 'POST') return { body: { data: { id: { note_id: 'note-1' } } } }
      throw new Error(`unexpected ${method} ${url}`)
    })

    const result = await client.createNote('tok', 'TF1', input)
    expect(result).toEqual({ id: 'note-1' })

    const data = noteBody(spy)
    expect(data['parent_object']).toBe('companies')
    expect(data['parent_record_id']).toBe('co-1')
    expect(data['title']).toBe('Besoin — TF1 : Régie')
    expect(data['content']).toBe('Détail du besoin')
    // Company existante → aucune création de Company.
    const created = spy.mock.calls.some(
      ([u, i]) => String(u).endsWith('/companies/records') && (i as Init | undefined)?.method === 'POST',
    )
    expect(created).toBe(false)
  })

  it('CRÉE la Company quand elle n’existe pas, puis y rattache la Note', async () => {
    const spy = stubFetch((url, method) => {
      if (url.endsWith('/companies/records/query') && method === 'POST') return { body: { data: [] } }
      if (url.endsWith('/companies/records') && method === 'POST')
        return { body: { data: { id: { record_id: 'co-new' } } } }
      if (url.endsWith('/v2/notes') && method === 'POST') return { body: { data: { id: { note_id: 'note-2' } } } }
      throw new Error(`unexpected ${method} ${url}`)
    })

    const result = await client.createNote('tok', 'TF1', input)
    expect(result).toEqual({ id: 'note-2' })
    expect(noteBody(spy)['parent_record_id']).toBe('co-new')
  })
})
