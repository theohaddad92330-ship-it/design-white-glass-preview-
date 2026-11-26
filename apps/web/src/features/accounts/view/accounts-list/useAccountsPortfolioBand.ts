import type { MetricSeriesResponse } from '@bellum/contracts'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { apiFetch } from '@/lib/api'
import { summarizeAccountBilling } from './accountBillingLens'
import { buildPortfolioTiles, type PortfolioTile, type StaffingHeadline } from './accountsPortfolioTiles'
import { useAccountBillingLens } from './useAccountBillingLens'

/**
 * LES TROIS LECTURES DU BANDEAU DU PORTEFEUILLE (31/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROIS, ET ELLES ÉCHOUENT SÉPARÉMENT
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. la lentille de facturation — DÉJÀ chargée par la liste, même clé de
 *     cache : ce hook n'ajoute aucune requête pour les trois tuiles qu'elle
 *     nourrit ;
 *  2. `GET /delivery/staffing-headline` — missions actives, personnes en poste,
 *     et le nombre de missions sans affectation enregistrée, qui dit si le
 *     second chiffre est lisible ;
 *  3. `GET /accounts/portfolio-series` — les photos mensuelles, pour que
 *     « +5 ce mois » soit LU et non inventé.
 *
 * Une panne du delivery n'éteint pas « comptes prêts à facturer », qui n'en
 * dépend pas : c'est pourquoi chaque tuile porte SON absence, et pas le bandeau
 * entier. Un bandeau qui s'efface en bloc fait croire à une panne générale là
 * où quatre chiffres sur six restaient vrais.
 *
 * ⚠️ Toute la DÉCISION vit dans `buildPortfolioTiles` (pure, testée). Ce hook ne
 * fait que brancher des lectures : c'est ce qui empêche un `?? 0` de se glisser
 * entre la requête et l'écran.
 */

/** Les photos mensuelles de l'espace. Une lecture par écran, pas par tuile. */
function usePortfolioSeries() {
  return useQuery({
    queryKey: ['accounts', 'portfolio-series'] as const,
    queryFn: () => apiFetch<MetricSeriesResponse>({ path: '/accounts/portfolio-series' }),
    // Une photo mensuelle ne bouge pas dans la journée : la relire à chaque
    // retour d'onglet coûterait une requête pour un chiffre identique.
    staleTime: 5 * 60_000,
  })
}

/** Missions actives, personnes en poste, et la population qui les qualifie. */
function useStaffingHeadline() {
  return useQuery({
    queryKey: ['delivery', 'staffing-headline'] as const,
    queryFn: () => apiFetch<StaffingHeadline>({ path: '/delivery/staffing-headline' }),
    staleTime: 60_000,
  })
}

export function useAccountsPortfolioBand(input: {
  /** Le compteur SERVEUR des comptes suivis. `undefined` = pas encore lu. */
  followed: number | undefined
  /** Les comptes AFFICHÉS — le périmètre des trois tuiles de facturation. */
  accountIds: readonly string[]
}): PortfolioTile[] {
  const lens = useAccountBillingLens()
  const staffing = useStaffingHeadline()
  const series = usePortfolioSeries()

  // ⚠️ `new Date()` figée par le mémo : deux tuiles de la même page doivent
  // décider du « mois courant » au même instant. Recalculée à chaque rendu, une
  // page ouverte à cheval sur minuit le 31 rendrait deux mois différents.
  return useMemo(() => {
    const billing =
      lens.failed || lens.loading
        ? null
        : {
            ...summarizeAccountBilling(lens.get, input.accountIds),
            // Combien de comptes affichés ont un payeur DÉSIGNÉ. Dérivé du même
            // résolveur que les deux autres — un second comptage écrit à côté
            // divergerait sur « un compte non jugé ne compte nulle part ».
            withProfile: input.accountIds.filter(id => lens.get(id)?.profile).length,
          }
    return buildPortfolioTiles({
      followed: input.followed,
      billing,
      billingFailed: lens.failed,
      staffing: staffing.data ?? null,
      staffingFailed: staffing.isError,
      series: series.data,
      now: new Date(),
    })
  }, [input.followed, input.accountIds, lens, staffing.data, staffing.isError, series.data])
}
