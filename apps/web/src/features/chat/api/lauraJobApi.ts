import { lauraJobViewSchema, type LauraJobGesture, type LauraJobView } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'

/**
 * #2276 tranche 2 — les routes du job composite de Laura (`action-os/jobs/:id`).
 *
 * Chaque réponse est la vue RELUE du serveur, validée contre le contrat : l'état
 * suivant ne vient jamais d'une machine à états locale. Une forme inattendue
 * lève plutôt que d'afficher une carte à moitié devinée.
 */
type JobBody = Record<string, never> | { stepKey: string }

function read(response: { job: unknown }): LauraJobView {
  return lauraJobViewSchema.parse(response.job)
}

const EMPTY: Record<string, never> = {}

export const lauraJobApi = {
  /** La fiche vivante — relue pendant que le job tourne (on peut fermer l'onglet, #2276.52). */
  get(id: string): Promise<LauraJobView> {
    return apiFetch<{ job: unknown }>({ path: `/action-os/jobs/${encodeURIComponent(id)}` }).then(read)
  },
  /** Confirmer, reprendre, annuler — ou valider l'étape qui attend (`stepKey`). */
  gesture(id: string, name: LauraJobGesture, stepKey?: string): Promise<LauraJobView> {
    return apiFetch<{ job: unknown }, JobBody>({
      path: `/action-os/jobs/${encodeURIComponent(id)}/${name}`,
      method: 'POST',
      body: name === 'approve' && stepKey ? { stepKey } : EMPTY,
    }).then(read)
  },
}
