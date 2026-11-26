import { createFileRoute } from '@tanstack/react-router'
import { SettingsPage } from '@/components/page/SettingsPage'
import { PlanFeatureRoute } from '@/features/plan-features/PlanFeatureRoute'
import { DisabledProductRoute } from '@/features/product-gating/DisabledProductRoute'
import { isProductRouteDisabled } from '@/features/product-gating/disabledRoutes'
import { lauraDocumentsSearchSchema } from '@/features/settings/model/hub-tabs'
import { LauraDocumentsPage } from '@/features/settings/view/LauraDocumentsPage'

/**
 * Réglages › Laura › Documents & références (la base de connaissance, re-hébergée ici : D1).
 * Maquette `settings-laura` (Théo V22, Louis 22/10/2026) : deux onglets — Documents, Style & exemples.
 */
export const Route = createFileRoute('/settings/knowledge')({
  validateSearch: lauraDocumentsSearchSchema,
  component: SettingsKnowledgePage,
})

function SettingsKnowledgePage() {
  const { onglet } = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <SettingsPage anchorId="memoire-collective" titleInScreen>
      {isProductRouteDisabled('knowledge') ? (
        <DisabledProductRoute route="knowledge" />
      ) : (
        <PlanFeatureRoute feature="knowledge_base">
          <LauraDocumentsPage
            tab={onglet ?? 'documents'}
            onTabChange={next => void navigate({ search: { onglet: next }, replace: true })}
          />
        </PlanFeatureRoute>
      )}
    </SettingsPage>
  )
}
