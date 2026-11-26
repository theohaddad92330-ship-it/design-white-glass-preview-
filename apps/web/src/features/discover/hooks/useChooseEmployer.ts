import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { DiscoverEmployerCandidate } from '@bellum/contracts'
import { discoverApi } from '@/features/discover/api/discover-api'

/**
 * #4419.8 — « Choisir l'entreprise » sur une ligne « Plusieurs entreprises portent ce nom ». Le choix est écrit pour
 * l'espace ; `onChosen` relance la recherche, où la ligne rejoint la liste des comptes (le choix gagne sur le calcul).
 */
export function useChooseEmployer(onChosen: () => void) {
  const { t } = useTranslation('discoverSkill')
  return useMutation<{ chosen: true }, Error, { employerName: string; candidate: DiscoverEmployerCandidate }>({
    mutationFn: ({ employerName, candidate }) =>
      discoverApi.chooseEmployer({ employerName, siren: candidate.siren, legalName: candidate.name }),
    onSuccess: () => onChosen(),
    onError: () => toast.error(t('pending.chooseError')),
  })
}
