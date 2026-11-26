import type { RestitutionSummary } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'

export const restitutionApi = {
  /**
   * Le total du vivier de l'espace — un des blocs « BellumAI ne repart pas de
   * zéro » (#2080.5). `null`, jamais `0`, quand le plan n'inclut pas le vivier
   * de consultants (403) ou que la lecture échoue : ce bloc est un COMPLÉMENT
   * du panneau, pas son cœur, et son absence ne doit jamais empêcher de voir
   * ce que l'import ou la connexion vient de produire.
   */
  async consultantsTotal(): Promise<number | null> {
    try {
      const stats = await apiFetch<{ total: number } | undefined>({ path: '/talents/stats' })
      return stats?.total ?? null
    } catch {
      return null
    }
  },

  /**
   * Les cinq blocs qui demandaient une LECTURE (#2080.3/.4/.6/.7/.8).
   *
   * `sessionId` désigne le LOT qui vient d'entrer : sans lui, « données
   * manquantes » n'a rien à compter et le serveur rend `null`. Une lecture en
   * échec rend `null` tout entier — le panneau retombe alors sur « non mesuré »
   * bloc par bloc, ce qu'il savait déjà faire. À aucun moment un zéro n'est
   * fabriqué pour remplir un trou.
   */
  async summary(sessionId: string | null): Promise<RestitutionSummary | null> {
    try {
      const query = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ''
      return (await apiFetch<RestitutionSummary | undefined>({ path: `/import/restitution${query}` })) ?? null
    } catch {
      return null
    }
  },
}
