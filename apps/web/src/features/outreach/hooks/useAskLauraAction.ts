import { useNavigate } from '@tanstack/react-router'
import type { NavigateOptions } from '@tanstack/react-router'
import { useCallback } from 'react'
import { useOpenLauraInPlace } from '@/features/laura/bubble/use-open-laura-in-place'

/**
 * Théo C sequences-* — « Laura prépare » depuis une fenêtre : la question part PRÉ-REMPLIE, jamais envoyée
 * (le copilote prépare, le commercial envoie). Sur bureau la bulle s'ouvre sur place ; ailleurs (mobile, sous
 * une surcouche, sur `/chat`) on ouvre le fil, comme `AskLaura`. Un seul chemin pour les deux cas.
 */
export function useAskLauraAction(): (question: string) => void {
  const openInPlace = useOpenLauraInPlace()
  const navigate = useNavigate()
  return useCallback(
    (question: string) => {
      if (openInPlace) {
        openInPlace(question)
        return
      }
      void navigate({ to: '/chat', search: { prompt: question } } as NavigateOptions)
    },
    [navigate, openInPlace],
  )
}
