import { CustomerPage } from '@/components/page/CustomerPage'
import { TargetListsContent } from './TargetListsContent'

/**
 * #2155.13 — l'écran « Mes cibles », troisième page du groupe Prospection.
 *
 * Refonte Théo (23/10/2026, maquettes `signaux` / `signaux-veilles`) — l'en-tête (titre « Signaux »,
 * Demander à Laura, Mes veilles, Ajouter un signal) est porté par `SignalsLibrary`, et « Mes veilles »
 * par `WatchesPage` : la page n'en déclare pas un second. La cloche « Paramétrer mes alertes » vit
 * dans Mes veilles (« Préférences de notification »).
 */
export function TargetListsPage() {
  return (
    <CustomerPage anchorId="cibles" titleInScreen contentClassName="px-0 py-4">
      <TargetListsContent />
    </CustomerPage>
  )
}
