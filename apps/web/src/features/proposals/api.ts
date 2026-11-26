import type { ProposalOutline } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'

type ProposalStudioView = {
  project: { id: string; label: string; accountId: string; accountName: string | null }
  outline: ProposalOutline
}

/**
 * Le studio de proposition — UNE lecture, aucune écriture (Théo C HT-6 : le sélecteur d'affaires est retiré, le plan s'ouvre depuis une présentation).
 *
 * L'absence de `create`, de `update` et d'`send` n'est pas un oubli : le studio
 * prépare, le commercial envoie. Il n'existe aucune route serveur à appeler pour
 * modifier le plan — on corrige l'objet qui porte le champ, et le plan se relit.
 */
export const proposalsApi = {
  get(projectId: string): Promise<ProposalStudioView> {
    return apiFetch({ path: `/proposals/${projectId}` })
  },
}

export const proposalsKeys = {
  outline: (projectId: string) => ['proposals', 'outline', projectId] as const,
}
