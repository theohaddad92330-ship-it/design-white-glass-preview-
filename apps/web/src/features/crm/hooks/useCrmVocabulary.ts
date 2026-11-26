import { useQuery } from '@tanstack/react-query'
import { crmApi, type CrmVocabulary } from '@/features/crm/api'
import { useSession } from '@/lib/hooks/use-session'

/**
 * #2031.5 / #2045.5 — décision Louis 18/09/2026 : « PROPOSER sans remplir ».
 *
 * Le vocabulaire BRUT du CRM branché à l'espace, pour l'aide à la saisie du
 * questionnaire d'entrée (`CrmVocabularyHint`). Un espace sans CRM connecté
 * obtient `provider: null` — le composant qui consomme ce hook reste alors
 * silencieux (aucun texte, jamais un exemple ni un « 0 » inventé).
 */
export function useCrmVocabulary() {
  const { user } = useSession()

  return useQuery<CrmVocabulary>({
    queryKey: ['crm', 'vocabulary'],
    queryFn: () => crmApi.vocabulary(),
    enabled: !!user,
    staleTime: 5 * 60_000,
  })
}
