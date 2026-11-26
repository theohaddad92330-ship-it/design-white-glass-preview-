import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { CustomerPage } from '@/components/page/CustomerPage'
import { AnalysisBatchDetail } from '@/features/analysis-batches/view/AnalysisBatchDetail'

/** #2293.5 / .6 — un lot d'analyses : son statut agrégé et ses sous-jobs. */
function AnalysisBatchRoute() {
  const { t } = useTranslation('discover')
  const { batchId } = Route.useParams()
  return (
    <CustomerPage
      pageTitle={t('batches.detailTitle')}
      breadcrumbs={[
        { label: t('batches.discover'), to: '/discover' },
        { label: t('batches.title'), to: '/discover/lots' },
        { label: t('batches.detailTitle') },
      ]}
      contentClassName="px-0 py-4"
    >
      <AnalysisBatchDetail batchId={batchId} />
    </CustomerPage>
  )
}

export const Route = createFileRoute('/discover/lots/$batchId')({
  component: AnalysisBatchRoute,
})
