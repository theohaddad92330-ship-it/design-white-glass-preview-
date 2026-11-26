import {
  teamResearchResponseSchema,
  type RecordTeamResearch,
  type TeamResearchKind,
  type TeamResearchResponse,
} from '@bellum/contracts'
import { apiFetch } from '@/lib/api'

/** Équipe › Recherches — parsé à la frontière, comme les autres lectures d'équipe. */
export const teamResearchApi = {
  async list(kind?: TeamResearchKind): Promise<TeamResearchResponse> {
    const path = kind ? `/team-research?kind=${kind}` : '/team-research'
    return teamResearchResponseSchema.parse(await apiFetch<unknown>({ path }))
  },
  /** Découvrir poste chaque recherche LANCÉE (le même périmètre remonte la ligne). */
  async record(body: RecordTeamResearch): Promise<void> {
    await apiFetch<void, RecordTeamResearch>({ path: '/team-research', method: 'POST', body })
  },
}
