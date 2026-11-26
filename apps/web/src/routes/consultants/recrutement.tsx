import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { CustomerPage } from '@/components/page/CustomerPage'
import { PlanFeatureRoute } from '@/features/plan-features/PlanFeatureRoute'
import { RecruitmentPage } from '@/features/consultants/recruitment/RecruitmentPage'

/**
 * Théo C talents-recrutement — `/consultants/recrutement` : le kanban de recrutement des personnes (Talents ›
 * Recrutement). Même palier que le vivier (`talent_pool`). Atteint depuis la barre Vivier · Recrutement ·
 * Présentations, posée en tête du vivier.
 */
export const Route = createFileRoute('/consultants/recrutement')({
  component: GatedRecruitment,
})

function GatedRecruitment() {
  const { t } = useTranslation('nav')
  const { t: tc } = useTranslation('consultants')
  return (
    <PlanFeatureRoute feature="talent_pool" withShell pageTitle={t('items.consultants')}>
      {/* L'écran nomme son h1 LUI-MÊME : l'entête ne lui en donne pas un second (GA-347). */}
      <CustomerPage anchorId="recrutement" titleInScreen pageTitle={tc('recruitment.title')}>
        <RecruitmentPage />
      </CustomerPage>
    </PlanFeatureRoute>
  )
}
