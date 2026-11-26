import { createFileRoute, redirect } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { PlanFeatureRoute } from '@/features/plan-features/PlanFeatureRoute'
import { TalentDetailPage } from '@/features/consultants/view/detail/TalentDetailPage'
import { consultantDetailSearchSchema } from '@/features/consultants/view/detail/consultantDetailSearch'

/** La fiche d'un talent (PDF 3 §7). Même palier que le vivier lui-même. */
export const Route = createFileRoute('/consultants/$id')({
  validateSearch: consultantDetailSearchSchema,
  /**
   * #4528.2 — `/consultants/submissions` (ancien onglet, sans fichier de route depuis #4359) tombait ici avec
   * l'identifiant « submissions » : il mène à Affaires › Présentations, avant que `$id` le prenne pour un talent.
   */
  beforeLoad: ({ params }) => {
    if (params.id === 'submissions') {
      throw redirect({ to: '/projects/presentations', replace: true })
    }
  },
  component: GatedTalentDetail,
})

function GatedTalentDetail() {
  const { t } = useTranslation('nav')
  const { id } = Route.useParams()
  const { tab } = Route.useSearch()
  return (
    <PlanFeatureRoute feature="talent_pool" withShell pageTitle={t('items.consultants')}>
      <TalentDetailPage talentId={id} initialTab={tab} />
    </PlanFeatureRoute>
  )
}
