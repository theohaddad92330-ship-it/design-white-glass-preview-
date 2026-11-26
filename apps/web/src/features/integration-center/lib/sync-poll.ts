/** #4591 — plancher du sondage d'un run : jamais plus d'un appel toutes les 5 s, même après une réponse. */
export const SYNC_POLL_FLOOR_MS = 5_000
const SYNC_POLL_CEILING_MS = 30_000

/** Le délai avant le prochain sondage : recul exponentiel (5 s, 10 s, 20 s…) borné à 30 s. */
export function nextPollDelayMs(attempt: number): number {
  const rank = Number.isFinite(attempt) ? Math.max(0, Math.floor(attempt)) : 0
  return Math.min(SYNC_POLL_FLOOR_MS * 2 ** Math.min(rank, 10), SYNC_POLL_CEILING_MS)
}

/** Les minutes ENTIÈRES depuis le départ du run ; `null` sous la minute ou si la date est illisible/future. */
export function waitingMinutes(startedAt: string, now: Date): number | null {
  const started = Date.parse(startedAt)
  if (Number.isNaN(started)) return null
  const minutes = Math.floor((now.getTime() - started) / 60_000)
  return minutes >= 1 ? minutes : null
}
