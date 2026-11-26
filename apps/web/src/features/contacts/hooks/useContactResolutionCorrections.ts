import { useMutation } from '@tanstack/react-query'
import type { ContactResolutionCorrectionRequest, ContactResolutionCorrection } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'

/**
 * #2159.35 — « ce n'est pas la même personne » : le geste qui corrige un
 * rapprochement d'import (e-mail générique partagé — accueil@, secretariat@)
 * une fois pour toutes (`POST /contacts/:id/resolution-corrections`).
 *
 * Aucun hook de LECTURE ici : le seul appelant aujourd'hui (le rapport
 * d'import, `ImportWizard.tsx`) n'a besoin que d'ÉCRIRE le geste, jamais de
 * relire l'historique d'une fiche — contrairement à `EntityResolutionPanel`
 * (comptes) qui affiche les corrections passées sur une carte dédiée. Un
 * hook de lecture sans appelant serait exactement l'anti-motif que ce dépôt
 * nomme : du code testé que personne n'appelle. Rien à invalider non plus,
 * pour la même raison : aucune requête mise en cache ne lit ce geste.
 */
export function useRecordContactResolutionCorrection(contactId: string) {
  return useMutation<ContactResolutionCorrection, Error, ContactResolutionCorrectionRequest>({
    mutationFn: request =>
      apiFetch<ContactResolutionCorrection, ContactResolutionCorrectionRequest>({
        path: `/contacts/${contactId}/resolution-corrections`,
        method: 'POST',
        body: request,
      }),
  })
}
