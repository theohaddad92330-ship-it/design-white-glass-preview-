/**
 * #4293.11 — /briefing mettait plus de 30 s : une SEULE source lente (une messagerie ou un agenda externe qui
 * ne répond pas) retenait tout le `Promise.all` du brief. Deux outils, sans toucher au contrat :
 *
 * - `timedSource` mesure CHAQUE source (log `briefing.source`, `warn` au-delà de {@link SLOW_SOURCE_MS}) pour
 *   que la requête la plus lente se lise au journal au lieu de se deviner ;
 * - `withDeadline` borne une source EXTERNE : passé le délai, le bloc rend son repli honnête (`unavailable`,
 *   raison nommée) et l'écran affiche tout le reste. Jamais un bloc vide présenté comme « rien à signaler ».
 */
export const SLOW_SOURCE_MS = 3_000
/** Au-delà, une source externe est dite indisponible : le brief ne l'attend plus. */
export const EXTERNAL_SOURCE_DEADLINE_MS = 12_000

interface SourceTimingSink {
  log(message: string): void
  warn(message: string): void
}

export async function timedSource<T>(sink: SourceTimingSink, name: string, load: Promise<T>): Promise<T> {
  const startedAt = Date.now()
  try {
    return await load
  } finally {
    const ms = Date.now() - startedAt
    const line = `briefing.source name=${name} ms=${ms}`
    if (ms >= SLOW_SOURCE_MS) sink.warn(`${line} slow=true`)
    else sink.log(line)
  }
}

export async function withDeadline<T>(load: Promise<T>, ms: number, onTimeout: () => T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<T>(resolve => {
    timer = setTimeout(() => resolve(onTimeout()), ms)
  })
  try {
    return await Promise.race([load, deadline])
  } finally {
    if (timer) clearTimeout(timer)
  }
}
