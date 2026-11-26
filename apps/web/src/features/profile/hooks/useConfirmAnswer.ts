import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { EsnAnswers } from '@bellum/contracts'
import { esnProfileApi, esnProfileKeys } from '@/features/profile/api'

/**
 * #4425.4 — « Confirmer » une réponse sans la réécrire.
 *
 * `POST /esn-profile/confirm-answer` rend la carte de statuts À JOUR : elle
 * remplace le cache de `useAnswerStatus` (même clé), l'origine se relit sans
 * deuxième requête. Rejette si le serveur refuse (verrou de rôle, réponse vide) :
 * l'appelant ne croit pas avoir confirmé.
 */
export function useConfirmAnswer(): (key: keyof EsnAnswers) => Promise<void> {
  const queryClient = useQueryClient()
  return useCallback(
    async key => {
      const meta = await esnProfileApi.confirmAnswer({ key })
      queryClient.setQueryData(esnProfileKeys.answerStatus, meta)
    },
    [queryClient],
  )
}
