import { createFileRoute } from '@tanstack/react-router'
import { SignalsLibraryPage } from '@/features/signals-library/view/SignalsLibraryPage'

/**
 * Théo A signaux — la bibliothèque d'informations par compte. Remplace `/mes-cibles` (qui y redirige).
 * Lot 768 — `?q=` : la recherche (Actuel comme Historique) vit dans l'URL, pour être partagée. Un nombre (`?q=5`)
 * est relu comme du texte.
 */
export const Route = createFileRoute('/signals/')({
  validateSearch: (search: Record<string, unknown>): { q?: string } => {
    const q = search['q'] === undefined || search['q'] === null ? '' : String(search['q'])
    return q.trim() === '' ? {} : { q }
  },
  component: SignalsLibraryPage,
})
