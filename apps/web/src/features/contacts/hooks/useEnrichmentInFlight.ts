import { useSyncExternalStore } from 'react'
import { contactsApi } from '@/features/contacts/api'

const IN_FLIGHT_POLL_MS = 5_000

/**
 * #AM.39 (#4063) — QUELS contacts sont en cours d'enrichissement, lu à UN index serveur léger
 * (`GET /contacts/enrichment/in-flight`, la file des jobs) : la liste /contacts, chaque ligne, `ContactContent` et la
 * fiche disent la même chose, et un retour sur l'écran retrouve l'opération sans relancer (aucun POST, aucun débit).
 *
 * Un magasin partagé (une seule lecture pour toutes les lignes, pas une par ligne) : relu à l'arrivée du premier
 * abonné, puis toutes les 5 s tant qu'un job est en vol. Une lecture en échec ne conclut RIEN : l'état d'avant
 * reste, jamais un « en cours » deviné ni une erreur à l'écran.
 */
let inFlightIds: ReadonlySet<string> = new Set()
const listeners = new Set<() => void>()
let timer: ReturnType<typeof setTimeout> | null = null

function emit(next: ReadonlySet<string>): void {
  const same = next.size === inFlightIds.size && [...next].every(id => inFlightIds.has(id))
  if (same) return
  inFlightIds = next
  for (const listener of listeners) listener()
}

async function refresh(): Promise<void> {
  timer = null
  try {
    const { contacts } = await contactsApi.enrichmentInFlight()
    emit(new Set(contacts.map(entry => entry.contactId)))
  } catch {
    // Une sonde muette n'est pas un état : on ne conclut rien.
  }
  if (listeners.size > 0 && inFlightIds.size > 0) timer = setTimeout(() => void refresh(), IN_FLIGHT_POLL_MS)
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  if (listeners.size === 1 && timer === null) void refresh()
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }
}

/** Pour les tests : repart d'un index vide. */
export function resetEnrichmentInFlight(): void {
  inFlightIds = new Set()
  if (timer !== null) clearTimeout(timer)
  timer = null
}

export function useEnrichmentInFlight(): { isInFlight: (contactId: string) => boolean; count: number } {
  const ids = useSyncExternalStore(
    subscribe,
    () => inFlightIds,
    () => inFlightIds,
  )
  return { isInFlight: contactId => ids.has(contactId), count: ids.size }
}
