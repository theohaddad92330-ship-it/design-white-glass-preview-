import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { CustomerPage } from '@/components/page/CustomerPage'
import { NewAnalysisBatch } from '@/features/analysis-batches/view/NewAnalysisBatch'

/**
 * #2157.43 (épopée #2962) — « Analyser les comptes » depuis une cible : la
 * liste envoie les noms des comptes qu'elle porte, ce lot les PRÉ-REMPLIT dans
 * le lot d'analyse — jamais un second moteur de lancement, le MÊME chemin que
 * `NewAnalysisBatch` (préview, coût, doublons déjà analysés). `.catch([])` —
 * un lien collé de travers rouvre l'écran vide, jamais une page cassée (même
 * défense que `discoverSearchSchema`).
 */
const analysisBatchSearchSchema = z.object({
  names: z.array(z.string()).optional().catch(undefined),
})

/** #2293 — analyser une liste d'entreprises en un geste (lot multi-comptes). */
function AnalysisBatchesRoute() {
  const { t } = useTranslation('discover')
  const { names } = Route.useSearch()
  return (
    <CustomerPage
      pageTitle={t('batches.title')}
      pageSubtitle={t('batches.intro')}
      breadcrumbs={[{ label: t('batches.discover'), to: '/discover' }, { label: t('batches.title') }]}
      contentClassName="px-0 py-4"
    >
      <NewAnalysisBatch initialNames={names} />
    </CustomerPage>
  )
}

export const Route = createFileRoute('/discover/lots/')({
  validateSearch: analysisBatchSearchSchema,
  component: AnalysisBatchesRoute,
})
