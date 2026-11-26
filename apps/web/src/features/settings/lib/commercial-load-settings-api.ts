import type { CommercialLoadSettings, UpdateCommercialLoadSettings } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'

/**
 * `#2035.11` — LA CHARGE COMMERCIALE, côté client : une seule route pour les
 * deux plafonds du sujet.
 *
 * ⚠️ #2035.10 / #2035.11 — fusionné le 21/09, deux implémentations concurrentes.
 * Il y avait DEUX clients pour ce sujet, et le plafond de besoins ouverts
 * s'écrivait par les deux (`/projects/commercial-load-settings` et
 * `/workspaces/commercial-load-settings`). Il n'en reste qu'un, sur la porte du
 * module `workspace` (GA-26).
 *
 * Même convention que le marché inversé : `null` repasse un plafond à « non
 * renseigné », un champ omis ne le touche pas.
 */
export const commercialLoadSettingsApi = {
  get(): Promise<CommercialLoadSettings> {
    return apiFetch<CommercialLoadSettings>({ path: '/workspaces/commercial-load-settings' })
  },

  update(patch: UpdateCommercialLoadSettings): Promise<CommercialLoadSettings> {
    return apiFetch<CommercialLoadSettings, UpdateCommercialLoadSettings>({
      path: '/workspaces/commercial-load-settings',
      method: 'PATCH',
      body: patch,
    })
  },
}
