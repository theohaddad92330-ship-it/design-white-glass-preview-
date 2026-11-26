import { apiFetch } from '@/lib/api'

/**
 * #2420.17 — le seuil d'alerte de marge de l'espace, côté client des Réglages.
 *
 * Les DEUX routes existent déjà côté API : `GET /delivery/finance/margin`
 * (qui rend `threshold`, la MÊME lecture que celle affichée sur
 * `/pilotage/finance` — GA-26, un réglage vit à un seul endroit) et
 * `PATCH /delivery/finance/margin-threshold`. Ce fichier ne fait
 * qu'appeler l'une et l'autre : `PATCH margin-threshold` n'avait jusqu'ici
 * aucun appelant web (`git grep` vide côté `apps/web`), donc aucun écran ne
 * pouvait poser ce réglage.
 */
export const marginThresholdApi = {
  /** `threshold: null` = alerte ÉTEINTE, jamais un défaut deviné. */
  get(): Promise<{ threshold: number | null }> {
    return apiFetch<{ threshold: number | null }>({ path: '/delivery/finance/margin' })
  },
  // #2420.15 — le seuil de l'espace, posé depuis l'écran : sans cet appel, les
  // sept alertes de `mission-margin-engine.ts` (dont `below_threshold`)
  // restaient éteintes chez tous les clients, faute de seuil à comparer.
  /** `thresholdPercent: null` REMET « non réglé » — le seul geste de retour arrière. */
  set(thresholdPercent: number | null): Promise<{ thresholdPercent: number | null }> {
    return apiFetch<{ thresholdPercent: number | null }, { thresholdPercent: number | null }>({
      path: '/delivery/finance/margin-threshold',
      method: 'PATCH',
      body: { thresholdPercent },
    })
  },
}
