import type { ManagerPeriodDays } from '@bellum/contracts'
import { useManagerStats } from './useManagerStats'

/**
 * Théo D team-activite.R1 — les FAITS de la période pour « Équipe › Activité » : le fil des gestes
 * commerciaux (`period_activity`) et les membres qui les ont posés. Même porte d'équipe que le cockpit
 * (`useManagerStats`), lue ici, dans `features/manager`, comme GA-254 l'exige.
 */
export function useTeamActivityJournal(days: ManagerPeriodDays) {
  const stats = useManagerStats(days)
  return {
    isLoading: stats.isLoading,
    isError: stats.isError,
    refetch: stats.refetch,
    loaded: stats.data !== undefined,
    members: stats.data?.members ?? [],
    /** `null` = l'API n'a pas répondu sur cette période (jamais « 0 fait »). */
    activity: stats.data?.period_activity ?? null,
  }
}
