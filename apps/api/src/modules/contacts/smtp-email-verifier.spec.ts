import * as net from 'net'
import type { AddressInfo } from 'net'

import { NOOP_EMAIL_VERIFIER, servableFreeEmail } from './enrichment-cascade'
import { createEmailVerifierFromEnv, SMTP_MAX_CANDIDATES_PER_CONTACT, SmtpEmailVerifier } from './smtp-email-verifier'

type Script = {
  /** Réponse au RCPT TO selon l'adresse. */
  rcpt: (address: string) => string
  /** true : ne répond jamais (timeout). */
  silent?: boolean
}

type Fake = { port: number; commands: string[]; connections: () => number; close: () => Promise<void> }

async function startFakeSmtp(script: Script): Promise<Fake> {
  const commands: string[] = []
  let connections = 0
  const server = net.createServer(socket => {
    connections += 1
    if (script.silent) return
    let buffer = ''
    socket.write('220 fake ESMTP\r\n')
    socket.on('data', chunk => {
      buffer += chunk.toString()
      let idx: number
      while ((idx = buffer.indexOf('\r\n')) >= 0) {
        const line = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 2)
        commands.push(line)
        const upper = line.toUpperCase()
        if (upper.startsWith('EHLO')) socket.write('250-fake\r\n250 PIPELINING\r\n')
        else if (upper.startsWith('MAIL FROM')) socket.write('250 2.1.0 ok\r\n')
        else if (upper.startsWith('RCPT TO')) {
          const address = line.slice(line.indexOf('<') + 1, line.indexOf('>'))
          socket.write(script.rcpt(address) + '\r\n')
        } else if (upper.startsWith('QUIT')) {
          socket.write('221 bye\r\n')
          socket.end()
        } else socket.write('502 unexpected\r\n')
      }
    })
    socket.on('error', () => undefined)
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const sockets = new Set<net.Socket>()
  server.on('connection', s => sockets.add(s))
  return {
    port: (server.address() as AddressInfo).port,
    commands,
    connections: () => connections,
    close: () =>
      new Promise<void>(resolve => {
        sockets.forEach(s => s.destroy())
        server.close(() => resolve())
      }),
  }
}

describe('SmtpEmailVerifier (#4107)', () => {
  let fake: Fake | undefined
  afterEach(async () => {
    await fake?.close()
    fake = undefined
  })

  const make = (port: number, extra: Partial<ConstructorParameters<typeof SmtpEmailVerifier>[0]> = {}) =>
    new SmtpEmailVerifier({
      heloDomain: 'probe.bellum.test',
      mailFrom: 'sonde@bellum.test',
      port,
      host: () => '127.0.0.1',
      resolveMx: jest.fn(async () => [
        { exchange: 'mx2.acme.com', priority: 20 },
        { exchange: 'mx1.acme.com', priority: 10 },
      ]),
      timeoutMs: 1000,
      ...extra,
    })

  it('250 sur le candidat, domaine non catch-all → valid ; jamais de DATA', async () => {
    fake = await startFakeSmtp({ rcpt: a => (a.startsWith('sofia.nardi@') ? '250 ok' : '550 5.1.1 no such user') })
    const verifier = make(fake.port)
    expect(await verifier.verify('sofia.nardi@acme.com')).toBe('valid')
    expect(fake.commands.some(c => c.toUpperCase().startsWith('DATA'))).toBe(false)
    expect(fake.commands[0]).toBe('EHLO probe.bellum.test')
    expect(fake.commands[1]).toBe('MAIL FROM:<sonde@bellum.test>')
    expect(fake.commands[fake.commands.length - 1]).toBe('QUIT')
  })

  it('utilise le MX de priorité la plus basse', async () => {
    fake = await startFakeSmtp({ rcpt: a => (a.startsWith('sofia.nardi@') ? '250 ok' : '550 no') })
    const hosts: string[] = []
    const verifier = make(fake.port, {
      host: mx => {
        hosts.push(mx)
        return '127.0.0.1'
      },
    })
    await verifier.verify('sofia.nardi@acme.com')
    expect(hosts).toEqual(['mx1.acme.com'])
  })

  it('550 → invalid', async () => {
    fake = await startFakeSmtp({ rcpt: () => '550 5.1.1 unknown' })
    expect(await make(fake.port).verify('nobody@acme.com')).toBe('invalid')
  })

  it('551 et 553 → invalid', async () => {
    fake = await startFakeSmtp({ rcpt: a => (a.startsWith('a@') ? '551 user not local' : '553 bad mailbox') })
    const verifier = make(fake.port)
    expect(await verifier.verify('a@acme.com')).toBe('invalid')
    expect(await verifier.verify('b@beta.com')).toBe('invalid')
  })

  it('domaine catch-all (le RCPT aléatoire est accepté) → unknown, jamais valid', async () => {
    fake = await startFakeSmtp({ rcpt: () => '250 ok' })
    expect(await make(fake.port).verify('sofia.nardi@acme.com')).toBe('unknown')
  })

  it('451 (greylisting) → unknown', async () => {
    fake = await startFakeSmtp({ rcpt: () => '451 4.7.1 greylisted, try later' })
    expect(await make(fake.port).verify('sofia.nardi@acme.com')).toBe('unknown')
  })

  it('552 / 554 (refus qui ne dit rien de la boîte) → unknown', async () => {
    fake = await startFakeSmtp({ rcpt: () => '554 5.7.1 blocked by policy' })
    expect(await make(fake.port).verify('sofia.nardi@acme.com')).toBe('unknown')
  })

  it('timeout → unknown', async () => {
    fake = await startFakeSmtp({ rcpt: () => '250 ok', silent: true })
    expect(await make(fake.port, { timeoutMs: 150 }).verify('sofia.nardi@acme.com')).toBe('unknown')
  })

  it('pas de MX / erreur DNS → unknown, sans connexion', async () => {
    fake = await startFakeSmtp({ rcpt: () => '250 ok' })
    const noMx = make(fake.port, { resolveMx: jest.fn(async () => []) })
    expect(await noMx.verify('x.y@acme.com')).toBe('unknown')
    const dnsDown = make(fake.port, {
      resolveMx: jest.fn(async () => {
        throw new Error('ENOTFOUND')
      }),
    })
    expect(await dnsDown.verify('x.y@acme.com')).toBe('unknown')
    expect(fake.connections()).toBe(0)
  })

  it('messageries grand public exclues : aucune connexion, aucun DNS', async () => {
    fake = await startFakeSmtp({ rcpt: () => '250 ok' })
    const resolveMx = jest.fn(async () => [{ exchange: 'x', priority: 1 }])
    const verifier = make(fake.port, { resolveMx })
    for (const domain of ['gmail.com', 'outlook.com', 'yahoo.fr', 'hotmail.com', 'orange.fr']) {
      expect(await verifier.verify(`sofia.nardi@${domain}`)).toBe('unknown')
    }
    expect(resolveMx).not.toHaveBeenCalled()
    expect(fake.connections()).toBe(0)
  })

  it('cache 7 jours par adresse : le second appel ne se reconnecte pas', async () => {
    fake = await startFakeSmtp({ rcpt: a => (a.startsWith('sofia.nardi@') ? '250 ok' : '550 no') })
    let now = 1_000_000
    const verifier = make(fake.port, { now: () => now })
    expect(await verifier.verify('sofia.nardi@acme.com')).toBe('valid')
    const after = fake.connections()
    expect(await verifier.verify('Sofia.Nardi@acme.com')).toBe('valid')
    expect(fake.connections()).toBe(after)
    now += 7 * 24 * 3600 * 1000 + 1
    await verifier.verify('sofia.nardi@acme.com')
    expect(fake.connections()).toBe(after + 1)
  })

  it('le verdict catch-all du domaine est mis en cache : une seule sonde aléatoire', async () => {
    fake = await startFakeSmtp({ rcpt: a => (a.startsWith('a.') || a.startsWith('b.') ? '250 ok' : '550 no') })
    const verifier = make(fake.port)
    expect(await verifier.verify('a.x@acme.com')).toBe('valid')
    expect(await verifier.verify('b.x@acme.com')).toBe('valid')
    const probes = fake.commands.filter(c => c.startsWith('RCPT TO') && !/<(a|b)\.x@/.test(c))
    expect(probes).toHaveLength(1)
  })

  it('une seule connexion simultanée par domaine', async () => {
    let live = 0
    let peak = 0
    const server = net.createServer(socket => {
      live += 1
      peak = Math.max(peak, live)
      socket.on('error', () => undefined)
      socket.write('220 hi\r\n')
      socket.on('data', chunk => {
        for (const line of chunk.toString().split('\r\n').filter(Boolean)) {
          const u = line.toUpperCase()
          if (u.startsWith('EHLO') || u.startsWith('MAIL')) socket.write('250 ok\r\n')
          else if (u.startsWith('RCPT')) setTimeout(() => socket.write('550 no\r\n'), 30)
          else if (u.startsWith('QUIT')) {
            live -= 1
            socket.end('221 bye\r\n')
          }
        }
      })
    })
    await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
    const port = (server.address() as AddressInfo).port
    const verifier = make(port)
    await Promise.all(['a.x', 'b.x', 'c.x'].map(l => verifier.verify(`${l}@acme.com`)))
    server.close()
    expect(peak).toBe(1)
  })

  it('plafond d’essais par minute : au-delà, unknown sans connexion', async () => {
    fake = await startFakeSmtp({ rcpt: () => '550 no' })
    const verifier = make(fake.port, { maxAttemptsPerMinute: 2 })
    expect(await verifier.verify('a@one.com')).toBe('invalid')
    expect(await verifier.verify('a@two.com')).toBe('invalid')
    const before = fake.connections()
    expect(await verifier.verify('a@three.com')).toBe('unknown')
    expect(fake.connections()).toBe(before)
  })
})

describe('createEmailVerifierFromEnv', () => {
  it('flag off, absent, ou HELO / MAIL FROM manquant → NOOP (chemin byte-identique)', () => {
    expect(createEmailVerifierFromEnv({})).toBe(NOOP_EMAIL_VERIFIER)
    expect(
      createEmailVerifierFromEnv({
        EMAIL_SMTP_VERIFY_ENABLED: 'false',
        EMAIL_SMTP_VERIFY_HELO_DOMAIN: 'a.b',
        EMAIL_SMTP_VERIFY_MAIL_FROM: 'x@a.b',
      }),
    ).toBe(NOOP_EMAIL_VERIFIER)
    expect(createEmailVerifierFromEnv({ EMAIL_SMTP_VERIFY_ENABLED: 'true' })).toBe(NOOP_EMAIL_VERIFIER)
    expect(
      createEmailVerifierFromEnv({ EMAIL_SMTP_VERIFY_ENABLED: 'true', EMAIL_SMTP_VERIFY_HELO_DOMAIN: 'a.b' }),
    ).toBe(NOOP_EMAIL_VERIFIER)
    expect(
      createEmailVerifierFromEnv({ EMAIL_SMTP_VERIFY_ENABLED: 'true', EMAIL_SMTP_VERIFY_MAIL_FROM: 'x@a.b' }),
    ).toBe(NOOP_EMAIL_VERIFIER)
  })

  it('activé et configuré → SmtpEmailVerifier', () => {
    const v = createEmailVerifierFromEnv({
      EMAIL_SMTP_VERIFY_ENABLED: 'true',
      EMAIL_SMTP_VERIFY_HELO_DOMAIN: 'a.b',
      EMAIL_SMTP_VERIFY_MAIL_FROM: 'x@a.b',
    })
    expect(v).toBeInstanceOf(SmtpEmailVerifier)
  })
})

describe('cascade + SMTP', () => {
  it('un candidat valid est servi', async () => {
    const verifier = { verify: jest.fn(async (e: string) => (e === 'b@acme.com' ? 'valid' : 'unknown')) }
    const r = await servableFreeEmail(['a@acme.com', 'b@acme.com'], verifier as never)
    expect(r.email).toBe('b@acme.com')
  })

  it('unknown / invalid → rien servi (la cascade continue vers les fournisseurs)', async () => {
    const verifier = { verify: jest.fn(async (e: string) => (e.startsWith('a') ? 'unknown' : 'invalid')) }
    expect((await servableFreeEmail(['a@acme.com', 'b@acme.com'], verifier as never)).email).toBeNull()
  })

  it(`au plus ${SMTP_MAX_CANDIDATES_PER_CONTACT} candidats testés par contact`, async () => {
    const verifier = { verify: jest.fn(async () => 'unknown' as const) }
    const many = ['1', '2', '3', '4', '5', '6'].map(n => `p${n}@acme.com`)
    await servableFreeEmail(many, verifier as never, { limit: SMTP_MAX_CANDIDATES_PER_CONTACT })
    expect(verifier.verify).toHaveBeenCalledTimes(SMTP_MAX_CANDIDATES_PER_CONTACT)
  })
})
