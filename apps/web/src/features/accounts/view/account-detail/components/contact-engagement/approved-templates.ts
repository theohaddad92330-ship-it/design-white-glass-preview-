import type { ApprovedTemplateCandidatesResponse, ApprovedTemplateScenarioId, OutreachPersona } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'
import type { EngagementChannel } from './types'

/**
 * #3417 (retour bêta 30/09, fiche contact) — la bibliothèque versionnée des
 * scripts et messages approuvés, lue depuis le composer. `channel === 'task'`
 * n'a pas de modèle à proposer (une tâche ne s'envoie pas, voir
 * `EngagementChannel`) — l'appelant ne monte alors pas le picker du tout.
 */
export const APPROVED_TEMPLATE_CHANNEL_FOR_ENGAGEMENT: Partial<
  Record<EngagementChannel, 'email' | 'linkedin' | 'phone'>
> = {
  email: 'email',
  linkedin: 'linkedin',
  phone: 'phone',
}

export async function fetchApprovedTemplateCandidates(
  contactId: string,
  channel: 'email' | 'linkedin' | 'phone',
  scenario: ApprovedTemplateScenarioId,
  persona?: OutreachPersona,
): Promise<ApprovedTemplateCandidatesResponse> {
  const query = new URLSearchParams({ channel, scenario })
  if (persona) query.set('persona', persona)
  return apiFetch<ApprovedTemplateCandidatesResponse>({
    path: `/outreach-templates/${contactId}?${query.toString()}`,
    method: 'GET',
  })
}
