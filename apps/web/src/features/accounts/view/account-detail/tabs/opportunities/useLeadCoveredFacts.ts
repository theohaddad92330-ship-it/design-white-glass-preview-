import type { ProjectReadRow } from '@bellum/contracts'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { apiFetch } from '@/lib/api'
import { accountQualificationLeads, type LeadDecisionRow } from './qualificationLeads'
import { missionCoveredFacts } from './account-missions'

/**
 * #3676.6 / #3676 (recette prod 08/10) — les faits qu'une MISSION dit déjà — une piste active OU
 * une affaire ouverte (`missionCoveredFacts`) — plus les pistes SNOOZÉES (encore des pistes,
 * juste repoussées), pour que la liste des signaux et la synthèse n'en fassent pas une seconde
 * ligne. Mêmes clés de cache que `QualificationLeadsQueue`/`AccountMissions` : aucun appel de
 * plus. Les pistes ÉCARTÉES ne comptent pas (elles ne sont plus affichées ; leur signal doit
 * rester lisible).
 */
export function useLeadCoveredFacts(accountId: string): { label: string; observed_on: string | null }[] {
  const projects = useQuery({
    queryKey: ['projects', 'by-account', accountId],
    queryFn: () => apiFetch<ProjectReadRow[]>({ path: `/projects?account_id=${accountId}` }),
  })
  const decisions = useQuery({
    queryKey: ['qualification-leads', 'decisions', accountId],
    queryFn: () => apiFetch<LeadDecisionRow[]>({ path: `/accounts/${accountId}/qualification-leads/decisions` }),
  })
  return useMemo(() => {
    const rows = projects.data ?? []
    const decisionRows = decisions.data ?? []
    const covered = missionCoveredFacts({ rows, decisions: decisionRows })
    const snoozedFacts = accountQualificationLeads({ rows, decisions: decisionRows }).snoozed.flatMap(
      lead => lead.source_facts,
    )
    return [...covered, ...snoozedFacts]
  }, [projects.data, decisions.data])
}
