import { useQuery } from '@tanstack/react-query'
import type { AccessBarrierClass } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'

/** Une ligne de `GET /accounts/access-summary` — voir `AccountAccessController`.
 *  Non exporté : consommé par le seul hook ci-dessous, et inféré par
 *  l'appelant depuis `useQuery`. `pnpm lint:exports:types` refuse un type
 *  exporté qui ne sort pas de son fichier. */
type AccessSummaryRow = { accountId: string; accessClass: AccessBarrierClass | null }

/**
 * Le résumé d'accessibilité du PORTEFEUILLE (manque B du 30/08) : une classe
 * A-D par compte, pour tout le workspace.
 *
 * `raw_analysis.access_barrier` existe déjà par compte et atteint déjà
 * l'onglet Accès depuis le 29/08 — mais rien ne le faisait remonter à la
 * LISTE des comptes. `GET /accounts/access-summary` sert la MÊME donnée que
 * l'onglet Accès, lue par le MÊME service (`AccountAccessService`), jamais
 * recalculée (GA-26) : voir son commentaire pour la raison d'un second
 * endpoint plutôt qu'un champ ajouté à `GET /accounts` (hors périmètre — un
 * autre agent y travaille).
 *
 * Pas de `queryKey` scopé par utilisateur ni `enabled: !!user` : comme
 * `TabAccess.tsx` pour `/accounts/:id/access`, l'endpoint est authentifié par
 * cookie de session, et le composant appelant sait déjà s'il doit monter ce
 * hook.
 */
export function useAccessSummary() {
  return useQuery({
    queryKey: ['accounts', 'access-summary'],
    queryFn: () => apiFetch<AccessSummaryRow[]>({ path: '/accounts/access-summary' }),
  })
}
