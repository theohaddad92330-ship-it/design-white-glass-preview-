import { Logger } from '@nestjs/common'

/**
 * #4694 point 4 — l'alerte « l'IP sortante observée a changé ».
 *
 * BellumAI déclare à BoondManager ses adresses sortantes (Static Outbound IP de Railway, trois adresses, voir
 * `agent_docs/env-reference.md`). Si Railway en change une — changement de région, adresse reprise — TOUTES les requêtes
 * Boond de TOUS les clients sont refusées en même temps, et rien dans nos journaux ne dit pourquoi. Cette sonde lit
 * l'adresse réellement observée depuis le conteneur et la compare à la liste DÉCLARÉE.
 *
 * Trois règles, chacune testée :
 *  - la liste vient de la CONFIGURATION (`BOONDMANAGER_DECLARED_EGRESS_IPS`), jamais d'une constante : absente = no-op strict,
 *    zéro appel réseau, aucune alerte — jamais une liste devinée ;
 *  - adresse dans la liste = RIEN (la sonde tourne toutes les heures : pas même un journal `info`) ;
 *  - un échec de lecture (écho injoignable, délai dépassé, corps illisible) est `unknown`, pas « changée » : un timeout
 *    n'est pas un échec, et une page d'erreur n'est pas une adresse.
 */

/** Le service public d'écho d'adresse. IPv4 seulement : c'est l'adresse que Railway déclare. */
const ECHO_URL = 'https://api.ipify.org'
const ECHO_TIMEOUT_MS = 5_000

/** Une seule alerte « IP » à la fois : le sujet est constant, la dé-duplication du dispatcheur fait le reste. */
const EGRESS_IP_ALERT_SUBJECT = 'egress-ip'

const IPV4 = /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/

export type EgressIpAlert = {
  dispatch(input: {
    kind: 'ip_sortante_changee'
    subject: string
    title: string
    detail: string
    resolved: boolean
  }): Promise<unknown>
}

/** Le jeton Nest : GA-07 interdit l'import d'un service d'un autre module, la composition vit dans `routines.module.ts`. */
export const EGRESS_IP_ALERT = 'EGRESS_IP_ALERT'

/** `null` = variable absente ou sans aucune adresse valide : la sonde est éteinte. */
export function parseDeclaredEgressIps(raw: string | undefined): string[] | null {
  const ips = (raw ?? '')
    .split(',')
    .map(entry => entry.trim())
    .filter(entry => IPV4.test(entry))
  return ips.length > 0 ? ips : null
}

export function judgeEgressIp(observed: string | null, declared: readonly string[]): 'ok' | 'changed' | 'unknown' {
  if (observed === null) return 'unknown'
  return declared.includes(observed) ? 'ok' : 'changed'
}

/** L'adresse vue du dehors, ou `null`. Ne lève JAMAIS : toute raison de ne pas savoir est `null`. */
export async function readObservedEgressIp(
  fetchImpl: typeof fetch,
  url: string = ECHO_URL,
  timeoutMs: number = ECHO_TIMEOUT_MS,
): Promise<string | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetchImpl(url, { signal: controller.signal })
    if (!res.ok) return null
    const body = (await res.text()).trim()
    return IPV4.test(body) ? body : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

type EgressIpResult =
  { verdict: 'disabled' } | { verdict: 'ok' } | { verdict: 'unknown' } | { verdict: 'changed'; observed: string }

export class EgressIpProbe {
  private readonly logger = new Logger(EgressIpProbe.name)

  constructor(
    private readonly deps: {
      /** La valeur BRUTE de `BOONDMANAGER_DECLARED_EGRESS_IPS` (adresses d'exploitation, pas un secret). */
      declared: string | undefined
      fetchImpl: typeof fetch
      alerts?: EgressIpAlert
    },
  ) {}

  async run(): Promise<EgressIpResult> {
    const declared = parseDeclaredEgressIps(this.deps.declared)
    if (!declared) return { verdict: 'disabled' }

    const observed = await readObservedEgressIp(this.deps.fetchImpl)
    const verdict = judgeEgressIp(observed, declared)
    if (verdict === 'unknown' || observed === null) return { verdict: 'unknown' }

    if (verdict === 'ok') {
      // Retour dans la liste : on résout une alerte éventuellement levée (le dispatcheur ignore la résolution d'une
      // alerte jamais levée). Aucun journal.
      await this.notify('L’adresse sortante observée est de nouveau dans la liste déclarée.', true)
      return { verdict: 'ok' }
    }

    const detail = `Adresse sortante observée : ${observed}. Adresses déclarées à BoondManager : ${declared.join(', ')}. Toutes les requêtes Boond de tous les clients risquent d'être refusées (liste blanche d'IP) tant que la liste déclarée chez Boond et l'adresse réelle ne coïncident pas.`
    this.logger.error(`Egress IP changed — ${detail}`)
    await this.notify(detail, false)
    return { verdict: 'changed', observed }
  }

  /** Ne lève JAMAIS : une alerte en échec ne fait pas tomber la sonde. */
  private async notify(detail: string, resolved: boolean): Promise<void> {
    if (!this.deps.alerts) return
    try {
      await this.deps.alerts.dispatch({
        kind: 'ip_sortante_changee',
        subject: EGRESS_IP_ALERT_SUBJECT,
        title: 'L’IP sortante vue par BoondManager a changé',
        detail,
        resolved,
      })
    } catch (error) {
      this.logger.warn('Egress IP probe: could not dispatch the operator alert (non-fatal)', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
}
