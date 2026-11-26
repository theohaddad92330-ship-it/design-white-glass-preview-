/**
 * #4405.1 / #4417.1 — lire un fil Gmail PAR SON IDENTIFIANT (`threads.get`) : multipart/alternative décodé,
 * direction par libellé SENT ou par adresse propre, fil inconnu = null.
 */
import { GoogleMailBackend } from './google-mail.backend'
import { GoogleClient } from '../google/google.client'

const b64 = (s: string): string => Buffer.from(s, 'utf8').toString('base64url')

function build(fetchImpl: jest.Mock) {
  const client = new (GoogleClient as unknown as new () => GoogleClient)()
  const google = {
    authorize: jest.fn().mockResolvedValue({
      client: Object.assign(client, { getProfile: jest.fn().mockResolvedValue({ emailAddress: 'moi@esn.fr' }) }),
      accessToken: 'tok',
    }),
  }
  global.fetch = fetchImpl as never
  return new GoogleMailBackend(google as never)
}

const json = (status: number, body: unknown) => ({
  ok: status < 400,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
})

describe('GoogleMailBackend.readThreadBodies', () => {
  it('décode text/plain, replie sur le HTML, range du plus ancien au plus récent', async () => {
    const backend = build(
      jest.fn().mockResolvedValue(
        json(200, {
          messages: [
            {
              id: 'm2',
              labelIds: ['SENT'],
              internalDate: String(Date.parse('2026-10-02T09:00:00Z')),
              payload: {
                mimeType: 'multipart/alternative',
                headers: [
                  { name: 'From', value: 'Moi <moi@esn.fr>' },
                  { name: 'Subject', value: 'Re: Mission' },
                ],
                parts: [{ mimeType: 'text/plain', body: { data: b64('Merci Jean') } }],
              },
            },
            {
              id: 'm1',
              labelIds: ['INBOX'],
              internalDate: String(Date.parse('2026-10-01T09:00:00Z')),
              payload: {
                mimeType: 'multipart/alternative',
                headers: [
                  { name: 'From', value: 'Jean <jean@acme.com>' },
                  { name: 'Subject', value: 'Mission' },
                ],
                parts: [{ mimeType: 'text/html', body: { data: b64('<p>Bonjour</p>') } }],
              },
            },
          ],
        }),
      ),
    )
    const out = await backend.readThreadBodies('u1', 'th-1')
    expect(out?.messages.map(m => [m.direction, m.plain, m.html])).toEqual([
      ['inbound', null, '<p>Bonjour</p>'],
      ['outbound', 'Merci Jean', null],
    ])
    expect(out?.subject).toBe('Re: Mission')
  })

  it('fil inconnu (404) : null, jamais une erreur', async () => {
    const backend = build(
      jest.fn().mockResolvedValue(json(404, { error: { message: 'Requested entity was not found.' } })),
    )
    await expect(backend.readThreadBodies('u1', 'th-x')).resolves.toBeNull()
  })

  it('403 : l’erreur remonte avec son statut', async () => {
    const backend = build(jest.fn().mockResolvedValue(json(403, { error: { message: 'insufficientPermissions' } })))
    await expect(backend.readThreadBodies('u1', 'th-1')).rejects.toThrow(/403/)
  })
})
