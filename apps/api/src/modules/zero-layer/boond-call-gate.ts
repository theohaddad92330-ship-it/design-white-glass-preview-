/**
 * Le limiteur et le coupe-circuit des appels BoondManager (#4693) — PAR CONNEXION, jamais global : le quota est celui du
 * client, et une instance morte chez l'un ne ralentit pas les autres.
 *
 * C'est la RAFALE de 10 s qui mord, pas la minute : Tier 2 = 100 appels / 10 s alors que 500/min n'en autoriserait
 * que 83 en moyenne. On tient donc les deux fenêtres. Chiffres officiels (doc.boondmanager.com).
 *
 * Les compteurs sont par connexion (donc par espace) et ne s'additionnent jamais (GA-43) : aucune méthode d'agrégat.
 */

type BoondTier = 1 | 2 | 3

const LIMITS: Record<BoondTier, { burst: number; perMinute: number }> = {
  1: { burst: 500, perMinute: 2000 },
  2: { burst: 100, perMinute: 500 },
  3: { burst: 20, perMinute: 100 },
}
const BURST_WINDOW_MS = 10_000
const MINUTE_MS = 60_000

const BREAKER_THRESHOLD = 5
const BREAKER_OPEN_MS = 30_000

/** Palier d'une route. Tier 2 par défaut : lectures de recherche, dictionnaire — la borne prudente. */
export function tierFor(path: string): BoondTier {
  return path.split('?')[0] === '/application/current-user' ? 1 : 2
}

export type GateClock = { now: () => number; sleep: (ms: number) => Promise<void> }

const realClock: GateClock = { now: () => Date.now(), sleep: ms => new Promise(resolve => setTimeout(resolve, ms)) }

type ConnectionState = {
  calls: Array<{ at: number; tier: BoondTier }>
  failures: number
  openUntil: number
  total: number
}

export class BoondCallGate {
  private readonly states = new Map<string, ConnectionState>()

  constructor(private readonly clock: GateClock = realClock) {}

  private state(key: string): ConnectionState {
    let s = this.states.get(key)
    if (!s) {
      s = { calls: [], failures: 0, openUntil: 0, total: 0 }
      this.states.set(key, s)
    }
    return s
  }

  /** Attend (notre limiteur, pas Boond) jusqu'à ce que les deux fenêtres laissent passer, puis enregistre l'appel. */
  async acquire(key: string, tier: BoondTier): Promise<void> {
    const s = this.state(key)
    const { burst, perMinute } = LIMITS[tier]
    for (;;) {
      const now = this.clock.now()
      s.calls = s.calls.filter(c => now - c.at < MINUTE_MS)
      const inBurst = s.calls.filter(c => c.tier === tier && now - c.at < BURST_WINDOW_MS)
      const inMinute = s.calls.filter(c => c.tier === tier)
      let wait = 0
      if (inBurst.length >= burst)
        wait = Math.max(wait, (inBurst[inBurst.length - burst] as { at: number }).at + BURST_WINDOW_MS - now)
      if (inMinute.length >= perMinute)
        wait = Math.max(wait, (inMinute[inMinute.length - perMinute] as { at: number }).at + MINUTE_MS - now)
      if (wait <= 0) break
      await this.clock.sleep(wait)
    }
    s.calls.push({ at: this.clock.now(), tier })
    s.total += 1
  }

  /** Nombre d'appels partis POUR CETTE connexion. Jamais sommé entre connexions. */
  callCount(key: string): number {
    return this.states.get(key)?.total ?? 0
  }

  isOpen(key: string): boolean {
    return (this.states.get(key)?.openUntil ?? 0) > this.clock.now()
  }

  recordSuccess(key: string): void {
    this.state(key).failures = 0
  }

  /** Panne de l'instance (réseau, 5xx, délai) — pas un refus métier. */
  recordFailure(key: string): void {
    const s = this.state(key)
    s.failures += 1
    if (s.failures >= BREAKER_THRESHOLD) s.openUntil = this.clock.now() + BREAKER_OPEN_MS
  }
}

/** La passerelle partagée du process : un état PAR CLÉ de connexion, pas un état global. */
export const sharedBoondCallGate = new BoondCallGate()

/** Back-off 1/2/4 s avec jitter (±25 %). `Retry-After` (secondes), quand il est rendu, l'emporte et se respecte à la seconde. */
export function retryDelayMs(
  attempt: number,
  retryAfterSeconds: number | null,
  random: () => number = Math.random,
): number {
  if (retryAfterSeconds !== null) return retryAfterSeconds * 1000
  const base = 1000 * 2 ** Math.min(attempt, 2)
  return Math.round(base * (0.75 + random() * 0.5))
}
