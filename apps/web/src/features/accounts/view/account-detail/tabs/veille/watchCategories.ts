import {
  BriefcaseBusiness,
  CircleDollarSign,
  FileText,
  Landmark,
  History,
  UserRound,
  type LucideIcon,
} from 'lucide-react'
import { i18n } from '@/i18n'
import type { WatchCategory } from '@/features/accounts/model/watch'

type WatchCategoryDefinition = {
  id: WatchCategory
  label: string
  shortLabel: string
  icon: LucideIcon
}

// #2617.1 — les SIX catégories métier demandées par Simon (recrutement · appel
// d'offres · marché public · nomination · budget · historique), plus le
// catch-all `historique` qui remplace l'ancien `news`.
//
// Fonction (et non constante module-level) pour que les libellés suivent la langue courante.
// i18n keys: accountWatch:categories.recrutement.label | categories.appel_offres.label |
// categories.marche_public.label | categories.nomination.label | categories.budget.label |
// categories.historique.label (+ variantes .short)
export function getWatchCategories(): WatchCategoryDefinition[] {
  return [
    {
      id: 'recrutement',
      label: i18n.t('accountWatch:categories.recrutement.label'),
      shortLabel: i18n.t('accountWatch:categories.recrutement.short'),
      icon: BriefcaseBusiness,
    },
    {
      id: 'appel_offres',
      label: i18n.t('accountWatch:categories.appel_offres.label'),
      shortLabel: i18n.t('accountWatch:categories.appel_offres.short'),
      icon: FileText,
    },
    {
      id: 'marche_public',
      label: i18n.t('accountWatch:categories.marche_public.label'),
      shortLabel: i18n.t('accountWatch:categories.marche_public.short'),
      icon: Landmark,
    },
    {
      id: 'nomination',
      label: i18n.t('accountWatch:categories.nomination.label'),
      shortLabel: i18n.t('accountWatch:categories.nomination.short'),
      icon: UserRound,
    },
    {
      id: 'budget',
      label: i18n.t('accountWatch:categories.budget.label'),
      shortLabel: i18n.t('accountWatch:categories.budget.short'),
      icon: CircleDollarSign,
    },
    {
      id: 'historique',
      label: i18n.t('accountWatch:categories.historique.label'),
      shortLabel: i18n.t('accountWatch:categories.historique.short'),
      icon: History,
    },
  ]
}
