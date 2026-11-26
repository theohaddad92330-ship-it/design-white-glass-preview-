import { createFileRoute } from '@tanstack/react-router'
import { SignalWatchesPage } from '@/features/signals-library/view/SignalWatchesPage'

/** Théo A signaux-veilles — « Mes veilles » : cadence, comptes suivis, types d'actualité, règles. */
export const Route = createFileRoute('/signals/watches')({
  component: SignalWatchesPage,
})
