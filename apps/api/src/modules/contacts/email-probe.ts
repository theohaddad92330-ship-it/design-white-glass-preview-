import { randomBytes } from 'node:crypto'
import { resolveMx as dnsResolveMx } from 'node:dns/promises'
import { connect } from 'node:net'

/**
 * #4016 L4.1 — VÉRIFIER une adresse estimée sans jamais écrire à personne.
 *
 * Le dialogue SMTP s'arrête à `RCPT TO` : le serveur dit s'il ACCEPTERAIT un
 * message pour cette adresse, puis `QUIT`. Aucune commande `DATA` ne part —
 * aucun message n'existe, aucun n'est envoyé (`email-probe.spec.ts` le
 * vérifie sur le fil).
 *
 * Trois verdicts, et le doute ne penche jamais vers « vrai » :
 *  - `deliverable` — l'adresse est acceptée ET une adresse tirée au hasard sur
 *    le même domaine est refusée (le serveur distingue réellement) ;
 *  - `undeliverable` — refus franc (5xx) de l'adresse ;
 *  - `unverifiable` — tout le reste : pas de MX, un 4xx (greylisting), un
 *    domaine qui accepte TOUT (catch-all), un port fermé, un délai dépassé.
 *    Une adresse invérifiable ne s'écrit pas.
 */
export type MailboxVerdict = 'deliverable' | 'undeliverable' | 'unverifiable'

export type MailboxProbeDeps = {
  resolveMx: (domain: string) => Promise<{ exchange: string; priority: number }[]>
  /** Rend le code de chaque réponse : l'accueil, puis une par commande. Lève sur délai ou erreur réseau. */
  dialogue: (host: string, commands: string[], timeoutMs: number) => Promise<number[]>
  randomLocalPart: () => string
  /** Budget TOTAL de la sonde (MX + SMTP). 0 = sonde éteinte. */
  timeoutMs: number
}

/** Le nom annoncé au serveur distant. Aucune adresse d'expéditeur : `MAIL FROM:<>`. */
const HELO_NAME = 'bellum.ai'

function withDeadline<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('email probe: délai dépassé')), timeoutMs)
    promise.then(
      value => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error instanceof Error ? error : new Error(String(error)))
      },
    )
  })
}

export async function probeMailbox(email: string, deps: MailboxProbeDeps): Promise<MailboxVerdict> {
  if (deps.timeoutMs <= 0) return 'unverifiable'
  const domain = email.split('@')[1]?.trim().toLowerCase()
  if (!domain) return 'unverifiable'
  const startedAt = Date.now()
  try {
    const records = await withDeadline(deps.resolveMx(domain), deps.timeoutMs)
    const host = [...records].sort((a, b) => a.priority - b.priority)[0]?.exchange
    if (!host) return 'unverifiable'
    const remaining = deps.timeoutMs - (Date.now() - startedAt)
    if (remaining <= 0) return 'unverifiable'
    const commands = [
      `HELO ${HELO_NAME}`,
      'MAIL FROM:<>',
      `RCPT TO:<${email}>`,
      `RCPT TO:<${deps.randomLocalPart()}@${domain}>`,
      'QUIT',
    ]
    const codes = await deps.dialogue(host, commands, remaining)
    const [greeting, helo, mailFrom, target, random] = codes
    if (greeting !== 220 || helo !== 250 || mailFrom !== 250 || target === undefined) return 'unverifiable'
    if (target >= 500 && target < 600) return 'undeliverable'
    if (target !== 250 && target !== 251) return 'unverifiable'
    // Le serveur accepte aussi une adresse inventée : il accepte TOUT, son
    // « oui » ne prouve rien.
    if (random === undefined || random < 500) return 'unverifiable'
    return 'deliverable'
  } catch {
    return 'unverifiable'
  }
}

/**
 * Le dialogue SMTP réel (port 25), borné par un délai TOTAL. Lit une réponse
 * (éventuellement sur plusieurs lignes `250-…`), envoie la commande suivante,
 * et ainsi de suite. Toujours refermé — y compris sur délai dépassé.
 */
export function smtpDialogue(host: string, commands: string[], timeoutMs: number, port = 25): Promise<number[]> {
  return new Promise<number[]>((resolve, reject) => {
    const socket = connect({ host, port })
    const codes: number[] = []
    let buffer = ''
    let next = 0
    const finish = (error: Error | null) => {
      clearTimeout(timer)
      socket.removeAllListeners('data')
      socket.destroy()
      if (error) reject(error)
      else resolve(codes)
    }
    const timer = setTimeout(() => finish(new Error('smtp: délai dépassé')), timeoutMs)
    socket.setEncoding('utf8')
    socket.on('error', error => finish(error))
    socket.on('data', (chunk: string) => {
      buffer += chunk
      let index = buffer.indexOf('\r\n')
      while (index !== -1) {
        const line = buffer.slice(0, index)
        buffer = buffer.slice(index + 2)
        index = buffer.indexOf('\r\n')
        const match = line.match(/^(\d{3})([ -])/)
        // Une ligne de continuation (`250-…`) n'est pas la fin de la réponse.
        if (!match || match[2] === '-') continue
        codes.push(Number(match[1]))
        if (next >= commands.length) {
          finish(null)
          return
        }
        socket.write(`${commands[next]}\r\n`)
        next += 1
      }
    })
    socket.on('close', () => finish(next >= commands.length ? null : new Error('smtp: connexion fermée')))
  })
}

/** Les dépendances réelles : DNS du système, port 25, un nom au hasard non devinable. */
export function realMailboxProbeDeps(timeoutMs: number): MailboxProbeDeps {
  return {
    resolveMx: domain => dnsResolveMx(domain),
    dialogue: (host, commands, budget) => smtpDialogue(host, commands, budget),
    randomLocalPart: () => `zz-bellum-${randomBytes(6).toString('hex')}`,
    timeoutMs,
  }
}
