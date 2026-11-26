import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { EsnAnswers } from '@bellum/contracts'
import { profileContextKeys } from '@/features/profile-context/api'
import { useSaveEsnProfile } from '@/features/profile/hooks/useSaveEsnProfile'

/**
 * #4425 — corriger UNE réponse du profil depuis un autre écran que le
 * questionnaire (audit, restitution « Ce que Bellum a compris »).
 *
 * C'est le MÊME `PUT /esn-profile` que l'auto-save de `ProfileStagePage`
 * (`useSaveEsnProfile`) : aucune route neuve. Le serveur relance la génération
 * du contexte (`updateMine` → `triggerGeneration`, `reedited: true`) ; on
 * invalide donc la lecture du contexte pour que l'audit se RECALCULE sur la
 * valeur corrigée au lieu de servir l'ancienne.
 *
 * Rejette si l'écriture échoue : l'appelant (`InlineProfileValue`) garde son
 * champ ouvert et le dit, il ne croit pas avoir enregistré.
 */
export function useSaveEsnField(): <K extends keyof EsnAnswers>(key: K, value: EsnAnswers[K]) => Promise<void> {
  const save = useSaveEsnProfile()
  const queryClient = useQueryClient()
  const { mutateAsync } = save
  return useCallback(
    async (key, value) => {
      await mutateAsync({ [key]: value } as Partial<EsnAnswers>)
      await queryClient.invalidateQueries({ queryKey: profileContextKeys.me })
    },
    [mutateAsync, queryClient],
  )
}
