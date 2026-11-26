import { useCredits } from '@/features/credits/hooks/useCredits'

/**
 * #5024 — ce que le SERVEUR dit de l'espace actif : `demo`, `real`, ou `unknown` tant que la réponse est
 * en vol. Une requête en échec vaut `real` : c'est toujours la démo qui doit se prouver.
 */
export function useDemoSpaceStatus(): 'demo' | 'real' | 'unknown' {
  const { data, isLoading } = useCredits()
  if (data?.is_demo === true) return 'demo'
  return isLoading ? 'unknown' : 'real'
}

/**
 * Vrai quand l'espace de travail actif est un espace de DÉMONSTRATION.
 *
 * Source : le champ `is_demo` de la charge crédits, la même que celle qui pilote
 * le bandeau « Mode démo ». Tant que la requête est en vol, `is_demo` est absent
 * → `false` : une surface réelle ne bascule jamais en démo par défaut, c'est
 * toujours la démo qui doit se prouver.
 */
export function useIsDemo(): boolean {
  return useDemoSpaceStatus() === 'demo'
}
