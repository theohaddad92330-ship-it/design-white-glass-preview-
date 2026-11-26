import type { Contact, EnrichmentChannel } from '@bellum/contracts'

/** Intervalle puis nombre de relectures : ~6 minutes au total, la réponse du fournisseur arrivant en minutes. */
const FOLLOW_INTERVAL_MS = 15_000
const FOLLOW_MAX_ATTEMPTS = 24

type Conclusion = 'found' | 'not_found' | 'open'

/**
 * #4063 (recette R15, 15/10) — le toast « Recherche en cours » est juste (un timeout n'est pas un
 * échec), mais il ne doit pas rester la dernière chose dite. Relit la fiche jusqu'à ce que la
 * coordonnée soit CONCLUE par le serveur (webhook / rattrapage) :
 * - `found` — la valeur est sur la fiche (ou l'état serveur le dit) ;
 * - `not_found` — le serveur a conclu « introuvable » (jamais déduit d'un silence) ;
 * - `open` — rien de conclu à l'échéance, panne de lecture ou annulation : on ne dit RIEN de plus.
 */
export async function followCoordinateConclusion(input: {
  fetchContact: () => Promise<Contact>
  channel: Extract<EnrichmentChannel, 'phone' | 'email'>
  wait?: (ms: number) => Promise<void>
  intervalMs?: number
  maxAttempts?: number
  signal?: AbortSignal
}): Promise<Conclusion> {
  const wait = input.wait ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)))
  const maxAttempts = input.maxAttempts ?? FOLLOW_MAX_ATTEMPTS
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (input.signal?.aborted) return 'open'
    try {
      const contact = await input.fetchContact()
      const value = input.channel === 'phone' ? contact.phone : contact.email
      const state = contact.enrichment_coordinates?.[input.channel]?.state
      if (value || state === 'found') return 'found'
      if (state === 'not_found') return 'not_found'
    } catch {
      // Une lecture ratée n'est pas une réponse : on réessaie, on ne conclut rien.
    }
    if (attempt < maxAttempts - 1) await wait(input.intervalMs ?? FOLLOW_INTERVAL_MS)
  }
  return 'open'
}
