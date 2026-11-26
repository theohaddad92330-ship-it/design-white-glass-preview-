import type { CreateMessageLibraryEntry, MessageLibraryEntry } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'

/** #3427 — client HTTP de la bibliothèque d'exemples commerciaux (`GET /message-library`), lecture seule. */
export const messageLibraryApi = {
  list(): Promise<MessageLibraryEntry[]> {
    return apiFetch<MessageLibraryEntry[]>({ path: '/message-library' })
  },
  /** #4158.50 — ajoute UN exemple écrit à la main (`POST /message-library`, `records:write`). */
  create(body: CreateMessageLibraryEntry): Promise<MessageLibraryEntry> {
    return apiFetch<MessageLibraryEntry>({ path: '/message-library', method: 'POST', body })
  },
  /** Pose les séquences livrées dans l'espace — idempotent, aucune n'est activée par l'import. */
  importDefaults(): Promise<{ imported: number; alreadyThere: number }> {
    return apiFetch<{ imported: number; alreadyThere: number }>({
      path: '/message-library/import-defaults',
      method: 'POST',
    })
  },
  /** #3439.1 — confirme UN fait obligatoire (qui, quand côté serveur). */
  confirmFact(id: string, fact: string): Promise<MessageLibraryEntry> {
    return apiFetch<MessageLibraryEntry>({
      path: `/message-library/${id}/confirm-fact`,
      method: 'POST',
      body: { fact },
    })
  },
  /** #3437 / #3438 — confirme UNE affirmation (chiffre, résultat, délai) ; qui et quand côté serveur. */
  confirmClaim(id: string, claimIndex: number): Promise<MessageLibraryEntry> {
    return apiFetch<MessageLibraryEntry>({
      path: `/message-library/${id}/confirm-claim`,
      method: 'POST',
      body: { claimIndex },
    })
  },
}
