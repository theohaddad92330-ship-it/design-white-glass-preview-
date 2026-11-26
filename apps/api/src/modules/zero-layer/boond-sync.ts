/**
 * Webhooks entrants et resynchro BoondManager (#4693).
 *
 * Un webhook n'est JAMAIS une preuve : Boond ne garantit rien (best-effort, sans retry, sans signature documentée). Il
 * déclenche un refetch par l'API, et son payload n'écrit RIEN — seuls `resource` et `id` sont lus pour savoir quoi relire.
 */

type BoondWebhookEvent = { resource: string; id: string }

const DEDUP_WINDOW_MS = 60_000

export class BoondWebhookRefetcher {
  private readonly seen = new Map<string, number>()

  constructor(private readonly now: () => number = () => Date.now()) {}

  /** Rend `true` si un refetch est parti, `false` si l'évènement est un doublon récent (même connexion, même objet). */
  async receive(
    connectionKey: string,
    event: BoondWebhookEvent,
    refetch: (e: BoondWebhookEvent) => Promise<void>,
  ): Promise<boolean> {
    const key = `${connectionKey}|${event.resource}|${event.id}`
    const at = this.now()
    for (const [k, t] of this.seen) if (at - t >= DEDUP_WINDOW_MS) this.seen.delete(k)
    if (this.seen.has(key)) return false
    this.seen.set(key, at)
    await refetch({ resource: event.resource, id: event.id })
    return true
  }
}

type SyncValue = { value: unknown; correctedByHuman: boolean }

/** Une correction humaine gagne TOUJOURS, quelle que soit sa date : la resynchro ne l'écrase jamais. */
export function mergeResynced(existing: SyncValue | undefined, incoming: unknown): SyncValue {
  if (existing?.correctedByHuman) return existing
  return { value: incoming, correctedByHuman: false }
}

/** Fenêtre de resynchro quotidienne : 48 h glissantes, bornes rendues pour être rejouables à l'identique. */
export function resyncWindow(now: Date, hours = 48): { from: Date; to: Date } {
  return { from: new Date(now.getTime() - hours * 3_600_000), to: now }
}
