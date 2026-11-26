/**
 * #4107 — vérification SMTP des e-mails DEVINÉS (étape gratuite de la cascade #4106), avant de
 * payer un fournisseur. Principe de Reacher / check-if-email-exists : MX → EHLO → MAIL FROM →
 * RCPT TO → QUIT. JAMAIS de DATA : aucun e-mail n'est envoyé.
 *
 * Verdicts : `valid` (250, domaine non catch-all), `invalid` (550/551/553), `unknown` (tout
 * le reste : catch-all, 4xx, timeout, erreur, domaine grand public…). Seul `valid` sert.
 * Sans configuration complète le vérificateur est `NOOP_EMAIL_VERIFIER` (zéro réseau).
 */
import { randomBytes } from 'crypto'
import { resolveMx as dnsResolveMx } from 'dns/promises'
import * as net from 'net'

import { type EmailVerdict, type EmailVerifier, NOOP_EMAIL_VERIFIER } from './enrichment-cascade'

export const SMTP_MAX_CANDIDATES_PER_CONTACT = 3
const SMTP_MAX_ATTEMPTS_PER_MINUTE = 30
const SMTP_CONNECT_TIMEOUT_MS = 8000
const SMTP_CACHE_TTL_MS = 7 * 24 * 3600 * 1000
const SMTP_CACHE_MAX_ENTRIES = 5000

/** Messageries grand public : on ne sonde que le professionnel. */
const CONSUMER_DOMAINS: ReadonlySet<string> = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'outlook.fr',
  'hotmail.com',
  'hotmail.fr',
  'live.com',
  'live.fr',
  'msn.com',
  'yahoo.com',
  'yahoo.fr',
  'ymail.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'orange.fr',
  'wanadoo.fr',
  'free.fr',
  'sfr.fr',
  'laposte.net',
  'bbox.fr',
  'neuf.fr',
  'gmx.com',
  'gmx.fr',
  'proton.me',
  'protonmail.com',
  'mail.com',
  'zoho.com',
])

type MxRecord = { exchange: string; priority: number }

type SmtpEmailVerifierOptions = {
  heloDomain: string
  mailFrom: string
  port?: number
  timeoutMs?: number
  maxAttemptsPerMinute?: number
  resolveMx?: (domain: string) => Promise<MxRecord[]>
  /** Nom d'hôte à joindre pour un MX (injectable en test). */
  host?: (mxExchange: string) => string
  now?: () => number
}

type CacheEntry<T> = { value: T; at: number }

type Reply = { code: number; text: string }

/** Une session SMTP minimale : une commande, une réponse (multi-lignes gérées). */
class SmtpSession {
  private buffer = ''
  private waiter: ((r: Reply) => void) | null = null
  private failure: ((e: Error) => void) | null = null
  private pending: Reply[] = []
  private dead: Error | null = null

  private constructor(private readonly socket: net.Socket) {
    socket.setEncoding('utf8')
    socket.on('data', (chunk: string) => this.onData(chunk))
    const fail = (e: Error): void => {
      this.dead = e
      this.failure?.(e)
    }
    socket.on('error', fail)
    socket.on('close', () => fail(new Error('closed')))
  }

  static connect(host: string, port: number, timeoutMs: number): Promise<SmtpSession> {
    return new Promise((resolve, reject) => {
      const socket = net.connect({ host, port })
      const timer = setTimeout(() => {
        socket.destroy()
        reject(new Error('connect timeout'))
      }, timeoutMs)
      socket.once('connect', () => {
        clearTimeout(timer)
        resolve(new SmtpSession(socket))
      })
      socket.once('error', e => {
        clearTimeout(timer)
        reject(e)
      })
    })
  }

  private onData(chunk: string): void {
    this.buffer += chunk
    let idx: number
    while ((idx = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, idx).replace(/\r$/, '')
      this.buffer = this.buffer.slice(idx + 1)
      this.lines.push(line)
      if (/^\d{3} /.test(line) || /^\d{3}$/.test(line)) {
        const reply: Reply = { code: Number(line.slice(0, 3)), text: this.lines.join('\n') }
        this.lines = []
        if (this.waiter) {
          const w = this.waiter
          this.waiter = null
          w(reply)
        } else this.pending.push(reply)
      }
    }
  }
  private lines: string[] = []

  read(timeoutMs: number): Promise<Reply> {
    const queued = this.pending.shift()
    if (queued) return Promise.resolve(queued)
    if (this.dead) return Promise.reject(this.dead)
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiter = null
        this.failure = null
        reject(new Error('timeout'))
      }, timeoutMs)
      this.waiter = r => {
        clearTimeout(timer)
        this.failure = null
        resolve(r)
      }
      this.failure = e => {
        clearTimeout(timer)
        this.waiter = null
        reject(e)
      }
    })
  }

  async command(line: string, timeoutMs: number): Promise<Reply> {
    this.socket.write(`${line}\r\n`)
    return this.read(timeoutMs)
  }

  close(): void {
    this.socket.destroy()
  }
}

const INVALID_CODES: ReadonlySet<number> = new Set([550, 551, 553])

export class SmtpEmailVerifier implements EmailVerifier {
  private readonly port: number
  private readonly timeoutMs: number
  private readonly maxAttempts: number
  private readonly resolveMx: (domain: string) => Promise<MxRecord[]>
  private readonly hostFor: (mx: string) => string
  private readonly now: () => number
  private readonly addressCache = new Map<string, CacheEntry<EmailVerdict>>()
  private readonly catchAllCache = new Map<string, CacheEntry<boolean>>()
  private readonly domainQueues = new Map<string, Promise<unknown>>()
  private attempts: number[] = []

  constructor(private readonly opts: SmtpEmailVerifierOptions) {
    this.port = opts.port ?? 25
    this.timeoutMs = opts.timeoutMs ?? SMTP_CONNECT_TIMEOUT_MS
    this.maxAttempts = opts.maxAttemptsPerMinute ?? SMTP_MAX_ATTEMPTS_PER_MINUTE
    this.resolveMx = opts.resolveMx ?? dnsResolveMx
    this.hostFor = opts.host ?? (mx => mx)
    this.now = opts.now ?? Date.now
  }

  async verify(email: string): Promise<EmailVerdict> {
    const address = email.trim().toLowerCase()
    const at = address.lastIndexOf('@')
    if (at <= 0) return 'unknown'
    const domain = address.slice(at + 1)
    if (CONSUMER_DOMAINS.has(domain)) return 'unknown'
    const cached = this.fresh(this.addressCache.get(address))
    if (cached !== undefined) return cached
    // Au plus une connexion simultanée par domaine : les sondes d'un même domaine font la queue.
    const previous = this.domainQueues.get(domain) ?? Promise.resolve()
    const run = previous.then(() => this.probe(address, domain))
    const tail = run.catch(() => undefined)
    this.domainQueues.set(domain, tail)
    void tail.then(() => {
      if (this.domainQueues.get(domain) === tail) this.domainQueues.delete(domain)
    })
    return run
  }

  private fresh<T>(entry: CacheEntry<T> | undefined): T | undefined {
    return entry && this.now() - entry.at < SMTP_CACHE_TTL_MS ? entry.value : undefined
  }

  private remember<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T): void {
    if (cache.size >= SMTP_CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value as string)
    cache.set(key, { value, at: this.now() })
  }

  private allowAttempt(): boolean {
    const t = this.now()
    this.attempts = this.attempts.filter(a => t - a < 60_000)
    if (this.attempts.length >= this.maxAttempts) return false
    this.attempts.push(t)
    return true
  }

  private async probe(address: string, domain: string): Promise<EmailVerdict> {
    const cached = this.fresh(this.addressCache.get(address))
    if (cached !== undefined) return cached
    if (!this.allowAttempt()) return 'unknown'
    let mx: MxRecord[]
    try {
      mx = await this.resolveMx(domain)
    } catch {
      return 'unknown'
    }
    const best = [...mx].sort((a, b) => a.priority - b.priority)[0]
    if (!best?.exchange) return 'unknown'
    let session: SmtpSession | null = null
    try {
      session = await SmtpSession.connect(this.hostFor(best.exchange), this.port, this.timeoutMs)
      return await this.dialogue(session, address, domain)
    } catch {
      return 'unknown'
    } finally {
      session?.close()
    }
  }

  private async dialogue(s: SmtpSession, address: string, domain: string): Promise<EmailVerdict> {
    const t = this.timeoutMs
    if ((await s.read(t)).code !== 220) return 'unknown'
    if ((await s.command(`EHLO ${this.opts.heloDomain}`, t)).code !== 250) return 'unknown'
    if ((await s.command(`MAIL FROM:<${this.opts.mailFrom}>`, t)).code !== 250) return 'unknown'
    const rcpt = await s.command(`RCPT TO:<${address}>`, t)
    if (INVALID_CODES.has(rcpt.code)) {
      await s.command('QUIT', t).catch(() => undefined)
      this.remember(this.addressCache, address, 'invalid')
      return 'invalid'
    }
    if (rcpt.code !== 250) return 'unknown'
    let catchAll = this.fresh(this.catchAllCache.get(domain))
    if (catchAll === undefined) {
      const random = `bellum-${randomBytes(6).toString('hex')}@${domain}`
      const probe = await s.command(`RCPT TO:<${random}>`, t)
      if (probe.code === 250) catchAll = true
      else if (probe.code >= 500 && probe.code < 600) catchAll = false
      // 4xx sur la sonde : on ne sait pas → pas de conclusion, rien en cache.
      if (catchAll !== undefined) this.remember(this.catchAllCache, domain, catchAll)
    }
    await s.command('QUIT', t).catch(() => undefined)
    if (catchAll === undefined) return 'unknown'
    const verdict: EmailVerdict = catchAll ? 'unknown' : 'valid'
    this.remember(this.addressCache, address, verdict)
    return verdict
  }
}

/** LE point de lecture des réglages (GA-26). Désactivé ou incomplet ⇒ no-op strict, zéro réseau. */
export function createEmailVerifierFromEnv(env: NodeJS.ProcessEnv = process.env): EmailVerifier {
  const enabled = (env['EMAIL_SMTP_VERIFY_ENABLED'] ?? '').trim().toLowerCase() === 'true'
  const heloDomain = (env['EMAIL_SMTP_VERIFY_HELO_DOMAIN'] ?? '').trim()
  const mailFrom = (env['EMAIL_SMTP_VERIFY_MAIL_FROM'] ?? '').trim()
  if (!enabled || !heloDomain || !mailFrom) return NOOP_EMAIL_VERIFIER
  return new SmtpEmailVerifier({ heloDomain, mailFrom })
}

let shared: { key: string; verifier: EmailVerifier } | null = null

/** Instance partagée du process : caches, file par domaine et plafond par minute doivent survivre entre contacts. */
export function sharedEmailVerifier(env: NodeJS.ProcessEnv = process.env): EmailVerifier {
  const key = [
    env['EMAIL_SMTP_VERIFY_ENABLED'],
    env['EMAIL_SMTP_VERIFY_HELO_DOMAIN'],
    env['EMAIL_SMTP_VERIFY_MAIL_FROM'],
  ].join('|')
  if (shared?.key !== key) shared = { key, verifier: createEmailVerifierFromEnv(env) }
  return shared.verifier
}
