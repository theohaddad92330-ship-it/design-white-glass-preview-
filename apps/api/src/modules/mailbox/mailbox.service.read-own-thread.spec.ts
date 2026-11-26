import { MailboxService } from './mailbox.service'
import type { MailMessage } from '@bellum/contracts'

// #4016 L3 — Laura lit le corps d'un fil de SA boîte. Le jeton est celui de l'utilisateur
// authentifié : la boîte d'un collègue n'est jamais atteinte par ce chemin.
const message = (id: string, date: string, direction: MailMessage['direction'] = 'inbound'): MailMessage => ({
  id,
  threadId: 't1',
  subject: 'Proposition',
  from: 'jean@acme.com',
  to: ['moi@esn.fr'],
  cc: [],
  date,
  snippet: null,
  unread: false,
  hasAttachments: false,
  direction,
})

function service(
  opts: {
    demo?: boolean
    bodies?: Record<string, { plain: string | null; html: string | null }>
    readThreadBodies?: jest.Mock
  } = {},
) {
  const backend = {
    status: jest.fn().mockResolvedValue({
      connected: true,
      provider: 'google',
      address: 'moi@esn.fr',
      capabilities: { read: true, draft: true, send: true, labels: false, outOfOffice: false },
    }),
    search: jest.fn().mockResolvedValue({
      messages: [message('m1', '2026-10-01T09:00:00Z', 'outbound'), message('m2', '2026-10-03T09:00:00Z')],
      resolvedQuery: 'q',
      truncated: false,
    }),
    fetchBody: jest.fn(async (_u: string, id: string) => opts.bodies?.[id] ?? { plain: `corps ${id}`, html: null }),
    ...(opts.readThreadBodies ? { readThreadBodies: opts.readThreadBodies } : {}),
  }
  const args: unknown[] = Array.from({ length: 10 }, () => undefined)
  args[0] = [backend]
  args[8] = { isDemoWorkspace: jest.fn().mockResolvedValue(opts.demo ?? false) }
  const svc = new (MailboxService as unknown as new (...a: unknown[]) => MailboxService)(...args)
  return { svc, backend }
}

describe('MailboxService.readOwnThread', () => {
  it('lit les corps avec le jeton de l’utilisateur demandeur, du plus ancien au plus récent', async () => {
    const { svc, backend } = service()
    const out = await svc.readOwnThread('u1', { threadId: 't1', counterpart: 'jean@acme.com', windowDays: 90 })
    expect(backend.search).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ participant: 'jean@acme.com', newerThanDays: 90 }),
      expect.any(Number),
    )
    expect(backend.fetchBody).toHaveBeenCalledWith('u1', 'm1')
    expect(backend.fetchBody).toHaveBeenCalledWith('u1', 'm2')
    expect(out?.messages.map(m => m.text)).toEqual(['corps m1', 'corps m2'])
    expect(out?.threadId).toBe('t1')
    expect(out?.subject).toBe('Proposition')
  })

  it('borne chaque corps et convertit le HTML', async () => {
    const { svc } = service({
      bodies: {
        m1: { plain: null, html: '<p>Bonjour</p><p>' + 'x'.repeat(9000) + '</p>' },
        m2: { plain: 'ok', html: null },
      },
    })
    const out = await svc.readOwnThread('u1', { threadId: 't1', windowDays: 90 })
    expect(out?.messages[0]?.text.startsWith('Bonjour')).toBe(true)
    expect(out?.messages[0]?.text.length).toBeLessThanOrEqual(4000)
  })

  it('fil introuvable dans la fenêtre : null, jamais un fil vide', async () => {
    const { svc } = service()
    await expect(svc.readOwnThread('u1', { threadId: 'inconnu', windowDays: 90 })).resolves.toBeNull()
  })

  it('ne journalise jamais un corps', async () => {
    const { svc } = service({
      bodies: { m1: { plain: 'SECRET-CORPS', html: null }, m2: { plain: 'SECRET-CORPS', html: null } },
    })
    const spies = (['log', 'warn', 'error', 'debug', 'verbose'] as const).map(level =>
      jest
        .spyOn((svc as unknown as { logger: Record<string, (...a: unknown[]) => void> }).logger, level)
        .mockImplementation(() => undefined),
    )
    await svc.readOwnThread('u1', { threadId: 't1', windowDays: 90 })
    for (const spy of spies) expect(JSON.stringify(spy.mock.calls)).not.toContain('SECRET-CORPS')
  })

  // #4405.1 / #4417.1 — un fil se lit PAR SON IDENTIFIANT quand le fournisseur sait le faire : la recherche
  // des derniers messages ne le voit pas s'il est ancien ou noyé, et « fil introuvable » mentait.
  it('#4405.1 — lit le fil par son identifiant, sans passer par la recherche', async () => {
    const readThreadBodies = jest.fn().mockResolvedValue({
      subject: 'Proposition',
      messages: [
        {
          direction: 'inbound',
          date: '2025-01-03T09:00:00Z',
          from: 'jean@acme.com',
          plain: null,
          html: '<p>Bonjour</p>',
        },
      ],
    })
    const { svc, backend } = service({ readThreadBodies })
    const out = await svc.readOwnThread('u1', { threadId: 't-ancien', counterpart: 'jean@acme.com' })
    expect(readThreadBodies).toHaveBeenCalledWith('u1', 't-ancien')
    expect(backend.search).not.toHaveBeenCalled()
    expect(out?.messages.map(m => m.text)).toEqual(['Bonjour'])
    expect(out?.subject).toBe('Proposition')
  })

  it('#4405.1 — fil inconnu du fournisseur : null', async () => {
    const { svc } = service({ readThreadBodies: jest.fn().mockResolvedValue(null) })
    await expect(svc.readOwnThread('u1', { threadId: 'x' })).resolves.toBeNull()
  })

  it('#4405.1 — la lecture en échec JOURNALISE sa vraie raison (sans corps) et remonte l’erreur', async () => {
    const { svc } = service({
      readThreadBodies: jest.fn().mockRejectedValue(new Error('Gmail get thread failed: 403 insufficientPermissions')),
    })
    const warn = jest
      .spyOn((svc as unknown as { logger: { warn: (...a: unknown[]) => void } }).logger, 'warn')
      .mockImplementation(() => undefined)
    await expect(svc.readOwnThread('u1', { threadId: 't1' })).rejects.toThrow('403')
    expect(JSON.stringify(warn.mock.calls)).toContain('insufficientPermissions')
  })

  it('#4405.1 — repli recherche : si tous les corps sont illisibles, la raison du premier échec est journalisée', async () => {
    const { svc, backend } = service()
    backend.fetchBody.mockRejectedValue(new Error('Gmail get message body failed: 403 insufficientPermissions'))
    const warn = jest
      .spyOn((svc as unknown as { logger: { warn: (...a: unknown[]) => void } }).logger, 'warn')
      .mockImplementation(() => undefined)
    await expect(svc.readOwnThread('u1', { threadId: 't1' })).resolves.toBeNull()
    expect(JSON.stringify(warn.mock.calls)).toContain('insufficientPermissions')
  })

  it('salle de démonstration : un échange scripté, aucune messagerie réelle interrogée', async () => {
    const { svc, backend } = service({ demo: true })
    const out = await svc.readOwnThread('u1', { threadId: 'demo-thread-verdal-proposal', windowDays: 90 })
    expect(backend.search).not.toHaveBeenCalled()
    expect(out?.messages.length).toBeGreaterThan(0)
  })
})
