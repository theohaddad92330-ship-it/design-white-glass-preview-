import type { ReverseMarketSettings, UpdateReverseMarketSettings } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'

/**
 * `#2035.10` — LE MARCHÉ INVERSÉ, côté client : une seule route pour les trois
 * réglages du sujet.
 *
 * ⚠️ #2035.10 / #2035.11 — fusionné le 21/09, deux implémentations concurrentes.
 * Il y avait DEUX clients : celui-ci (`/reverse-market/settings`, vague 2, le
 * nombre de recruteurs affichés) et `reverse-market-capacity-settings-api.ts`
 * (`/workspaces/reverse-market-settings`, vague 3, l'activation et la capacité
 * de réponse). L'API n'a plus qu'une porte, celle du module `workspace`, et ce
 * fichier est le seul client (GA-26).
 *
 * `responseCapacityPerWeek: null` en écriture repasse le réglage à « non
 * renseigné » ; `undefined` (champ omis) ne le touche pas — un formulaire qui
 * n'envoie qu'un champ n'efface pas les deux autres.
 */
export const reverseMarketSettingsApi = {
  get(): Promise<ReverseMarketSettings> {
    return apiFetch<ReverseMarketSettings>({ path: '/workspaces/reverse-market-settings' })
  },

  update(patch: UpdateReverseMarketSettings): Promise<ReverseMarketSettings> {
    return apiFetch<ReverseMarketSettings, UpdateReverseMarketSettings>({
      path: '/workspaces/reverse-market-settings',
      method: 'PATCH',
      body: patch,
    })
  },
}
