import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { CustomerPage } from '@/components/page/CustomerPage'
import { PlanFeatureRoute } from '@/features/plan-features/PlanFeatureRoute'
import { TechnologyRadarScreen } from '@/features/technology-radar/view/TechnologyRadarScreen'

/**
 * #4282.10 — le radar par technologie de Découvrir. `technology` vit dans l'URL : le
 * lien que Laura rend (`discover_path`) rouvre le MÊME radar, mêmes comptes, même ordre.
 * `.catch(undefined)` — un lien collé de travers rouvre l'écran vide, jamais cassé.
 */
const technologyRadarSearchSchema = z.object({
  technology: z.string().max(80).optional().catch(undefined),
})

function TechnologyRadarRoute() {
  const { t } = useTranslation('technologyRadar')
  const { technology } = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <CustomerPage pageTitle={t('pageTitle')} pageSubtitle={t('intro')}>
      <PlanFeatureRoute feature="discover">
        <TechnologyRadarScreen
          technology={technology ?? ''}
          onTechnologyChange={next => void navigate({ search: { technology: next } })}
        />
      </PlanFeatureRoute>
    </CustomerPage>
  )
}

export const Route = createFileRoute('/discover/radar')({
  validateSearch: technologyRadarSearchSchema,
  component: TechnologyRadarRoute,
})
