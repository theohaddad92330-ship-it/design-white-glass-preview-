import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { SettingsPage } from '@/components/page/SettingsPage'
import { LauraRoutinesPage } from '@/features/settings/view/LauraRoutinesPage'

/**
 * Réglages › Laura › Routines & veilles (maquette `settings-laura`, Théo V22 — Louis 22/10/2026). `?routine=<clé>`
 * ouvre le détail d'une routine dans un TIROIR, la liste restant en vue ; `/settings/routines/<clé>` y renvoie.
 */
export const Route = createFileRoute('/settings/routines')({
  validateSearch: z.object({ routine: z.string().min(1).optional().catch(undefined) }),
  component: RoutinesSettingsPage,
})

function RoutinesSettingsPage() {
  const { routine } = Route.useSearch()
  return (
    <SettingsPage>
      <LauraRoutinesPage routineKey={routine} />
    </SettingsPage>
  )
}
