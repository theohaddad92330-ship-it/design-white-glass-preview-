import { createServer, type Server } from 'node:net'
import { probeMailbox, smtpDialogue, type MailboxProbeDeps } from './email-probe'

/**
 * #4016 L4.1 — la vérification d'un e-mail ESTIMÉ : MX + SMTP, SANS JAMAIS
 * ENVOYER. Le dialogue s'arrête à `RCPT TO` puis `QUIT` — aucune commande
 * `DATA` ne part, c'est ce que la garde ci-dessous vérifie sur le fil.
 */
function deps(overrides: Partial<MailboxProbeDeps>): MailboxProbeDeps {
  return {
    resolveMx: async () => [{ exchange: 'mx.acme.fr', priority: 10 }],
    dialogue: async () => [220, 250, 250, 250, 550, 221],
    randomLocalPart: () => 'zz-bellum-probe-0',
    timeoutMs: 2000,
    ...overrides,
  }
}

describe('probeMailbox', () => {
  it('rend `deliverable` quand le serveur accepte l’adresse et refuse une adresse au hasard', async () => {
    await expect(probeMailbox('claire.perrin@acme.fr', deps({}))).resolves.toBe('deliverable')
  })

  it('rend `unverifiable` sur un domaine qui accepte TOUT (catch-all) — rien n’est prouvé', async () => {
    await expect(
      probeMailbox('claire.perrin@acme.fr', deps({ dialogue: async () => [220, 250, 250, 250, 250, 221] })),
    ).resolves.toBe('unverifiable')
  })

  it('rend `undeliverable` sur un refus franc de l’adresse', async () => {
    await expect(
      probeMailbox('claire.perrin@acme.fr', deps({ dialogue: async () => [220, 250, 250, 550, 550, 221] })),
    ).resolves.toBe('undeliverable')
  })

  it('rend `unverifiable` sans MX, sur un 4xx, ou quand le dialogue lève (timeout, port fermé)', async () => {
    await expect(probeMailbox('a.b@acme.fr', deps({ resolveMx: async () => [] }))).resolves.toBe('unverifiable')
    await expect(
      probeMailbox('a.b@acme.fr', deps({ dialogue: async () => [220, 250, 250, 451, 550, 221] })),
    ).resolves.toBe('unverifiable')
    await expect(
      probeMailbox(
        'a.b@acme.fr',
        deps({
          dialogue: async () => {
            throw new Error('timeout')
          },
        }),
      ),
    ).resolves.toBe('unverifiable')
  })

  it('n’ouvre rien quand le délai est nul — le réglage éteint la sonde', async () => {
    const dialogue = jest.fn(async () => [220])
    await expect(probeMailbox('a.b@acme.fr', deps({ dialogue, timeoutMs: 0 }))).resolves.toBe('unverifiable')
    expect(dialogue).not.toHaveBeenCalled()
  })

  it('interroge le MX de plus haute priorité, avec les commandes attendues — jamais DATA', async () => {
    const dialogue = jest.fn(async () => [220, 250, 250, 250, 550, 221])
    await probeMailbox(
      'claire.perrin@acme.fr',
      deps({
        resolveMx: async () => [
          { exchange: 'mx2.acme.fr', priority: 20 },
          { exchange: 'mx1.acme.fr', priority: 5 },
        ],
        dialogue,
      }),
    )
    const [host, commands] = dialogue.mock.calls[0] as unknown as [string, string[]]
    expect(host).toBe('mx1.acme.fr')
    expect(commands).toEqual([
      'HELO bellum.ai',
      'MAIL FROM:<>',
      'RCPT TO:<claire.perrin@acme.fr>',
      'RCPT TO:<zz-bellum-probe-0@acme.fr>',
      'QUIT',
    ])
    expect(commands.some(command => /^DATA/i.test(command))).toBe(false)
  })
})

describe('smtpDialogue — sur un vrai socket', () => {
  let server: Server
  let port = 0
  const received: string[] = []

  beforeAll(async () => {
    server = createServer(socket => {
      socket.write('220 mx.test ESMTP\r\n')
      socket.on('data', chunk => {
        for (const line of chunk.toString().split('\r\n').filter(Boolean)) {
          received.push(line)
          if (line.startsWith('RCPT TO:<nobody')) socket.write('550 no such user\r\n')
          else if (line === 'QUIT') socket.end('221 bye\r\n')
          else socket.write('250 ok\r\n')
        }
      })
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    port = (server.address() as { port: number }).port
  })

  afterAll(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()))
  })

  it('rend un code par étape (accueil compris) et n’envoie que les commandes données', async () => {
    const codes = await smtpDialogue(
      '127.0.0.1',
      ['HELO bellum.ai', 'MAIL FROM:<>', 'RCPT TO:<a@test>', 'RCPT TO:<nobody@test>', 'QUIT'],
      2000,
      port,
    )
    expect(codes).toEqual([220, 250, 250, 250, 550, 221])
    expect(received).toEqual(['HELO bellum.ai', 'MAIL FROM:<>', 'RCPT TO:<a@test>', 'RCPT TO:<nobody@test>', 'QUIT'])
  })

  it('lève sur un délai dépassé plutôt que d’attendre', async () => {
    const silent = createServer(() => undefined)
    await new Promise<void>(resolve => silent.listen(0, '127.0.0.1', resolve))
    const silentPort = (silent.address() as { port: number }).port
    await expect(smtpDialogue('127.0.0.1', ['QUIT'], 150, silentPort)).rejects.toThrow()
    await new Promise<void>(resolve => silent.close(() => resolve()))
  })
})
