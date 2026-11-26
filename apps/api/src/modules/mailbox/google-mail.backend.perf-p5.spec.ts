/**
 * Perf P5 (29/09/2026) — `GET /mailbox/search` mesuré à 2,4-2,9 s, constant.
 *
 * Après la liste des identifiants, la sonde des pièces jointes (2e liste Gmail),
 * le profil (adresse propre) et la lecture des messages s'enchaînaient : trois
 * appels sortants indépendants. Garde : le pic d'appels en vol dépasse la seule
 * concurrence de lecture des messages (l'ancien code n'avait jamais la sonde ni
 * le profil en vol pendant la lecture), et le NOMBRE d'appels ne dépend pas du
 * nombre de messages hors lectures de détail (1 par message).
 */
import { GoogleMailBackend } from './google-mail.backend'
import type { MailQuerySpec } from './mail-query'

class Flight {
  inFlight = 0
  peak = 0
  calls: string[] = []
  async run<T>(name: string, value: T): Promise<T> {
    this.calls.push(name)
    this.inFlight += 1
    this.peak = Math.max(this.peak, this.inFlight)
    await new Promise(resolve => setImmediate(resolve))
    this.inFlight -= 1
    return value
  }
}

const detail = (id: string) => ({
  id,
  threadId: `t-${id}`,
  subject: 'Sujet',
  from: 'a@b.fr',
  to: [],
  cc: [],
  date: '2026-09-01T00:00:00Z',
  snippet: '',
  labelIds: [],
})

describe('GoogleMailBackend.search — appels sortants en parallèle (P5)', () => {
  it.each([3, 30])('sonde des pièces jointes et profil partent avec la lecture des messages (%i messages)', async n => {
    const flight = new Flight()
    const ids = Array.from({ length: n }, (_, i) => ({ id: `m${i}`, threadId: `t${i}` }))
    const client = {
      listMessageIds: jest.fn((_token: string, opts: { q: string }) =>
        flight.run(opts.q.includes('has:attachment') ? 'list-attachments' : 'list', ids),
      ),
      getMessageDetail: jest.fn((_token: string, id: string) => flight.run('detail', detail(id))),
      getProfile: jest.fn(() => flight.run('profile', { emailAddress: 'moi@esn.fr' })),
    }
    const google = { authorize: jest.fn().mockResolvedValue({ client, accessToken: 'tok' }) }
    const backend = new GoogleMailBackend(google as never)

    const outcome = await backend.search('u1', { keywordGroups: [['budget']] } as MailQuerySpec, 30)

    expect(outcome.messages).toHaveLength(n)
    // 2 listes + 1 profil + 1 lecture par message : le nombre d'appels suit les
    // messages, jamais plus.
    expect(flight.calls.length).toBe(3 + n)
    // Avec la sonde et le profil lancés AVEC les lectures, le pic dépasse 1 même
    // pour 3 messages (ancien code : la sonde, puis le profil, puis les lectures =
    // pic de 3 seulement sur les lectures).
    expect(flight.peak).toBeGreaterThanOrEqual(Math.min(n, 5) + 2)
  })
})
