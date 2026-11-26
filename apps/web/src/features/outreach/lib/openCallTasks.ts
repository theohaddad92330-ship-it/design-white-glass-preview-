import { useNavigate } from '@tanstack/react-router'
import { useCallback } from 'react'
import { toast } from 'sonner'
import { i18n } from '@/i18n'

/**
 * #4979.2 — où l'appel planifié se retrouve : « Appels à passer » (/actions/sequences).
 * Le routeur vient du CONTEXTE (`useNavigate`), jamais de `@/router` : même chargé par `import()`,
 * `@/router` ferme un cycle avec tout l'arbre de routes (90 violations `no-circular`, PR #5081).
 */
export function useOpenCallTasks(): () => void {
  const navigate = useNavigate()
  return useCallback(() => {
    void navigate({ to: '/actions/sequences' })
  }, [navigate])
}

/** #4979.2 — le toast « appel planifié » porte le lien vers l'endroit où il vit. */
export function toastCallTaskCreated(onSeeInCalls: () => void): void {
  toast.success(i18n.t('engagement:callTask.created'), {
    action: { label: i18n.t('engagement:callTask.seeInCalls'), onClick: onSeeInCalls },
  })
}
