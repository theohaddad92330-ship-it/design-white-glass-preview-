import type { AccountMarketContext } from '@bellum/contracts'
import type { TFunction } from 'i18next'

/**
 * #2837 — LA LIGNE MÉMOIRE MARCHÉ, UNE SEULE DÉRIVATION POUR LES 4 VUES.
 *
 * `OrgInfluenceMap.tsx` (carte de l'entité racine, #2837 première tranche) porte
 * ce calcul depuis `useAccountMarketContext` (le même hook qu'`AccountMarketMemoryCard`,
 * #1640.3 — GA-258, un objet, plusieurs écrans). `HierarchyOrgView`/`GroupOrgView`/
 * `FocalOrgView` le réutilisent tel quel plutôt que de recopier la même chaîne de
 * ternaires trois fois (GA-26 : un réglage vit à un seul endroit).
 *
 * Chaque appelant reste responsable d'APPELER `useAccountMarketContext` lui-même
 * (un hook ne se factorise pas hors composant) et de ne poser la ligne QUE sur une
 * entité RACINE — jamais sur une colonne ou une direction fille (voir GA-391 :
 * `market_company_signal` est un agrégat par ENTREPRISE, sans ventilation par
 * famille/niveau, donc incapable de désigner une entité fille précise).
 */
export function orgMarketMemoryLine(
  tAccounts: TFunction<'accounts'>,
  args: {
    accountId: string | undefined | null
    isPending: boolean
    isError: boolean
    data: AccountMarketContext | null | undefined
  },
): string | null {
  if (!args.accountId) return null
  const value = args.isPending
    ? tAccounts('marketContext.loading')
    : args.isError
      ? tAccounts('marketContext.unavailable')
      : args.data
        ? tAccounts('marketContext.paths', { count: args.data.paths_observed })
        : tAccounts('marketContext.notMeasured')
  return `${tAccounts('marketContext.title')} · ${value}`
}
