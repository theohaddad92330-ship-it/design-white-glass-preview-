import { useEffect, useRef } from 'react'
import type { EsnAnswers } from '@bellum/contracts'
import { useSaveAnswers } from '@/features/onboarding/hooks/useOnboarding'
import type { Question } from '@/features/onboarding/lib/questions'
import { presentedValue } from '@/features/onboarding/lib/validation'
import { useOnboardingStore } from '@/stores/onboardingStore'

const DEBOUNCE_MS = 800

/**
 * Théo O onboarding-theme.R4 — « Enregistré » sans bouton. Le brouillon local
 * précède toujours (`onboardingStore`, #2026.1) ; ce hook y ajoute
 * l'enregistrement SERVEUR des seules questions du thème affiché, quelques
 * instants après la dernière frappe. Rien n'est envoyé tant que rien n'a
 * changé depuis la dernière sauvegarde.
 */
export function useFramingAutosave(questions: readonly Question[], enabled: boolean): void {
  const answers = useOnboardingStore(s => s.answers)
  const save = useSaveAnswers()
  const lastSaved = useRef<string | null>(null)
  const { mutate } = save

  useEffect(() => {
    if (!enabled) return
    const payload = Object.fromEntries(
      questions.map(q => [q.key, presentedValue(q, answers[q.key])]),
    ) as Partial<EsnAnswers>
    const snapshot = JSON.stringify(payload)
    // La première lecture n'est qu'un point de départ : on n'enregistre que ce qui BOUGE ensuite.
    if (lastSaved.current === null) {
      lastSaved.current = snapshot
      return
    }
    if (snapshot === lastSaved.current) return
    const timer = setTimeout(() => {
      lastSaved.current = snapshot
      mutate(payload)
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [answers, questions, enabled, mutate])
}
