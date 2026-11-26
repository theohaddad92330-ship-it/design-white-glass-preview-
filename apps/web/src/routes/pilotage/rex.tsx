import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { CustomerPage } from '@/components/page/CustomerPage'
import { RexScreen } from '@/features/pilotage/rex/view/RexScreen'

export const Route = createFileRoute('/pilotage/rex')({
  component: RexRoute,
})

/**
 * Aucune garde d'offre ni de rôle sur la ROUTE, et c'est délibéré.
 *
 * `GET /capitalisation/rex` est ouvert à l'espace — celui qui revient de mission
 * écrit son retour, et ce n'est pas un geste de responsable. Un écran gardé plus
 * étroitement que son endpoint cacherait la porte à ceux à qui elle est ouverte ;
 * c'est le même raisonnement que `/pilotage/marche`. L'ÉCRITURE, elle, reste
 * gardée par `records:write`, côté serveur ET dans l'écran.
 */
function RexRoute() {
  const { t } = useTranslation('pilotage')
  return (
    <CustomerPage pageTitle={t('rex.title')} pageSubtitle={t('rex.subtitle')}>
      <RexScreen />
    </CustomerPage>
  )
}
