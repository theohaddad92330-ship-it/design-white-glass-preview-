import { useMemo } from 'react'
import { accountPropagationById, usePropagationDigest } from '@/features/propagation/api'
import { useInvoiceReadiness } from '@/features/missions/api'
import {
  accountInvoiceReadinessOf,
  buildAccountInvoiceReadinessIndex,
  type AccountInvoiceReadinessBadge,
} from './accountInvoiceReadiness'

/**
 * LA LENTILLE « PRÊT À FACTURER », CÔTÉ PORTEFEUILLE (manque A du 30/08).
 *
 * Deux lectures — c'était trois avant le §9 du 30/08 :
 *
 *  1. `usePropagationDigest()` — QUELS comptes ont au moins une mission. Seule
 *     source non plafonnée ; elle tranche `none` avant tout le reste.
 *  2. `useInvoiceReadiness()` — l'état, les bloqueurs ET `accountId`, PAR
 *     MISSION, pour le mois par défaut (le mois précédent, comme l'écran
 *     Facturation).
 *
 * ⚠️ `useMissions()` a DISPARU d'ici. Avant que `GET /delivery/invoice-
 * readiness` ne rende `accountId` (§9), la seule jointure fiable passait par
 * `missionId → account_id`, lu sur `GET /delivery/missions` — plafonné à 200
 * lignes sans pagination : un compte dont TOUTES les missions tombaient
 * au-delà du plafond s'affichait « non mesuré » sans raison. `accountId`
 * étant désormais porté par la ligne de facturation elle-même, cette colonne
 * n'a plus besoin de la liste plafonnée pour savoir à quel compte appartient
 * une ligne (voir `accountInvoiceReadiness.ts`, et la garde `GA-203`).
 *
 * Une SEULE requête réseau par lecture, partagée par les vingt-cinq lignes de
 * la page (même clé de cache que les écrans qui les appellent déjà) — jamais
 * un appel par ligne.
 */
export type AccountInvoiceReadinessColumn = {
  /** Une des deux lectures a échoué — « cassé » ne se lit pas comme « rien à
   *  facturer », même règle que `AccountRevenueColumn.failed`. */
  failed: boolean
  get(accountId: string): AccountInvoiceReadinessBadge
}

export function useAccountInvoiceReadiness(): AccountInvoiceReadinessColumn {
  const digest = usePropagationDigest()
  const readiness = useInvoiceReadiness()

  const accountIdsWithMission = useMemo(() => new Set(accountPropagationById(digest.data).keys()), [digest.data])

  const index = useMemo(
    () => buildAccountInvoiceReadinessIndex(accountIdsWithMission, readiness.data?.items ?? []),
    [accountIdsWithMission, readiness.data],
  )

  return {
    failed: digest.isError || readiness.isError,
    get: accountId => accountInvoiceReadinessOf(index, accountId),
  }
}
