import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { z } from 'zod'
import { SettingsPage } from '@/components/page/SettingsPage'
import { MyDataTabs, type MyDataTab } from '@/features/settings/view/MyDataTabs'

/**
 * Réglages › Mes données — la réversibilité affichée (PDF 7 §9.2) ; deux onglets, Exports · Imports (#4533).
 *
 * ⚠️ Le chemin est en FRANÇAIS, contrairement au reste des routes. C'est la
 * source qui le nomme (`/settings/mes-donnees`), et c'est une adresse qu'un
 * dirigeant peut recevoir par courriel avant même d'avoir un compte : elle se
 * lit. Le renommer en `my-data` casserait ce lien sans rien gagner.
 *
 * `?tab=exports|imports` (défaut Exports). `.catch(undefined)` : une valeur abîmée dans un lien collé ouvre Exports.
 */
export const myDataSearchSchema = z.object({
  tab: z.enum(['exports', 'imports']).optional().catch(undefined),
})

export function resolveMyDataTab(tab: MyDataTab | undefined): MyDataTab {
  return tab ?? 'exports'
}

export const Route = createFileRoute('/settings/mes-donnees')({
  validateSearch: myDataSearchSchema,
  component: MyDataPage,
})

function MyDataPage() {
  const { tab } = Route.useSearch()
  const navigate = useNavigate({ from: '/settings/mes-donnees' })
  return (
    <SettingsPage>
      <MyDataTabs
        tab={resolveMyDataTab(tab)}
        onTabChange={next => void navigate({ search: { tab: next }, replace: true })}
      />
    </SettingsPage>
  )
}
