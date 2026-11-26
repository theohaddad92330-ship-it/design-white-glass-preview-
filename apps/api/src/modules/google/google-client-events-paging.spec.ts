import { GoogleClient } from './google.client'
import type { GoogleConfig } from './google-config'

// #4065.7 — une fenêtre d'agenda se lit JUSQU'AU BOUT : Google rend `nextPageToken` quand la page
// est pleine, et le client l'ignorait (la liste restait « partielle » sans le dire).
const stub = (pages: Array<{ items: Array<{ id: string }>; nextPageToken?: string }>) => {
  const urls: string[] = []
  jest.spyOn(global, 'fetch' as never).mockImplementation((async (input: string | URL) => {
    urls.push(String(input))
    const page = pages[urls.length - 1] ?? { items: [] }
    return { ok: true, status: 200, json: async () => page }
  }) as never)
  return urls
}
const range = { timeMin: '2026-09-01T00:00:00Z', timeMax: '2026-09-16T00:00:00Z' }

describe('GoogleClient.listEventsInRange — pagination (#4065.7)', () => {
  afterEach(() => jest.restoreAllMocks())

  it('suit nextPageToken jusqu’au bout', async () => {
    const urls = stub([{ items: [{ id: 'a' }, { id: 'b' }], nextPageToken: 'T2' }, { items: [{ id: 'c' }] }])
    const client = new GoogleClient({} as GoogleConfig)
    const events = await client.listEventsInRange('tok', 'primary', { ...range, maxResults: 250 })
    expect(events.map(event => event.id)).toEqual(['a', 'b', 'c'])
    expect(urls).toHaveLength(2)
    expect(urls[1]).toContain('pageToken=T2')
  })

  it('s’arrête au plafond demandé, sans lire de page de plus', async () => {
    const urls = stub([{ items: [{ id: 'a' }, { id: 'b' }], nextPageToken: 'T2' }, { items: [{ id: 'c' }] }])
    const client = new GoogleClient({} as GoogleConfig)
    const events = await client.listEventsInRange('tok', 'primary', { ...range, maxResults: 2 })
    expect(events).toHaveLength(2)
    expect(urls).toHaveLength(1)
  })
})
