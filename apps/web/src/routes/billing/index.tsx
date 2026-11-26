import { createFileRoute } from '@tanstack/react-router'
import { SettingsPage } from '@/components/page/SettingsPage'
import { billingSearchSchema } from '@/features/billing/model/billing-search'
import { Billing } from '@/features/billing/view/Billing'

/**
 * `offers` / `topup` : l'INTENTION avec laquelle on arrive sur la facturation.
 *
 * Le bandeau « Voir les offres » et la carte d'upsell vivent sur toutes les
 * pages, facturation comprise. Sans paramètre, y cliquer depuis /billing
 * naviguait vers la route COURANTE : aucun effet, un bouton qui semble mort.
 * Le paramètre porte donc ce que l'utilisateur a demandé — voir les offres, ou
 * acheter des crédits — et l'écran s'ouvre dessus.
 *
 * `success` / `canceled` / `setup`, et le second sens de `topup`, sont les URLs
 * de RETOUR de la page de paiement (#2003.23). Le schéma vit dans la
 * fonctionnalité pour être testable — un fichier posé ici serait une route.
 */
export const Route = createFileRoute('/billing/')({
  validateSearch: billingSearchSchema,
  component: BillingPage,
})

function BillingPage() {
  const { offers } = Route.useSearch()
  return (
    <SettingsPage>
      <Billing openPlans={offers === true} />
    </SettingsPage>
  )
}
