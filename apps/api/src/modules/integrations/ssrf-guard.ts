import { lookup } from 'node:dns/promises'
import net from 'node:net'

/**
 * Anti-SSRF guard for self-serve integration webhooks.
 *
 * The regex host-pinning in `integration-providers.ts` does NOT stop a pasted
 * URL from resolving to an internal host (the generic `webhook` provider pins
 * nothing, and `mattermost` allows any host). Before we POST to a user-supplied
 * URL we therefore resolve the hostname and reject any target that maps to a
 * loopback / private / link-local / CGNAT / multicast address — which blocks
 * cloud-metadata (169.254.169.254), localhost and internal 10.x/192.168.x hosts.
 *
 * Residual risk: a DNS name that resolves public here but private at connect
 * time (rebinding). We resolve every A/AAAA record and block if ANY is internal,
 * which closes split-horizon; full rebinding protection would require pinning the
 * resolved IP into the socket.
 */

const BLOCKED_HOSTNAMES = new Set(['localhost', 'metadata.google.internal', 'metadata'])

export function ipv4IsBlocked(ip: string): boolean {
  const p = ip.split('.').map(Number)
  if (p.length !== 4 || p.some(n => Number.isNaN(n) || n < 0 || n > 255)) return true
  const [a, b] = p
  if (a === 0 || a === 10 || a === 127) return true // this-network, private, loopback
  if (a === 169 && b === 254) return true // link-local incl. 169.254.169.254 metadata
  if (a === 172 && b >= 16 && b <= 31) return true // private
  if (a === 192 && b === 168) return true // private
  if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
  if (a >= 224) return true // multicast / reserved
  return false
}

export function ipv6IsBlocked(ip: string): boolean {
  const lower = ip
    .toLowerCase()
    .replace(/^\[|\]$/, '')
    .replace(/\]$/, '')
  if (lower === '::1' || lower === '::') return true // loopback / unspecified
  if (lower.startsWith('fe80') || lower.startsWith('fc') || lower.startsWith('fd')) return true // link-local + ULA
  const mapped = lower.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/) // IPv4-mapped
  if (mapped) return ipv4IsBlocked(mapped[1])
  return false
}

export function ipIsBlocked(ip: string): boolean {
  const type = net.isIP(ip)
  if (type === 4) return ipv4IsBlocked(ip)
  if (type === 6) return ipv6IsBlocked(ip)
  return true // not a parseable IP → block
}

/**
 * Throws if `url` is not an https URL resolving exclusively to public addresses.
 *
 * #4406.1 — `allowHttp` : le tunnel que l'utilisateur a DÉCLARÉ devant son Beeper Desktop peut
 * parler http. Il n'ouvre que le protocole : localhost et les IP privées restent refusés.
 */
export async function assertSafeOutboundUrl(url: string, options: { allowHttp?: boolean } = {}): Promise<void> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('URL invalide.')
  }
  const httpAllowed = options.allowHttp === true && parsed.protocol === 'http:'
  if (parsed.protocol !== 'https:' && !httpAllowed) throw new Error('URL https requise.')
  const host = parsed.hostname.replace(/^\[/, '').replace(/\]$/, '')
  if (BLOCKED_HOSTNAMES.has(host.toLowerCase())) throw new Error('Cible interne interdite.')
  if (net.isIP(host)) {
    if (ipIsBlocked(host)) throw new Error('Cible interne interdite.')
    return
  }
  const results = await lookup(host, { all: true })
  if (results.length === 0) throw new Error('Hôte introuvable.')
  for (const { address } of results) {
    if (ipIsBlocked(address)) throw new Error('Cible interne interdite.')
  }
}
