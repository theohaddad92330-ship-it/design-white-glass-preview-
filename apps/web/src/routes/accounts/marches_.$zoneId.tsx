import { createFileRoute } from '@tanstack/react-router'
import { CustomerPage } from '@/components/page/CustomerPage'
import { MarketZoneScreen } from '@/features/market-brief/view/MarketZoneScreen'

/**
 * La fiche d'une zone. Le tiret bas final du segment parent reste (garde
 * GA-288) : sans lui, cette route deviendrait l'enfant de la liste.
 */
export const Route = createFileRoute('/accounts/marches_/$zoneId')({
  component: MarketZonePage,
})

function MarketZonePage() {
  const { zoneId } = Route.useParams()
  return (
    <CustomerPage titleInScreen>
      <MarketZoneScreen zoneId={zoneId} />
    </CustomerPage>
  )
}
