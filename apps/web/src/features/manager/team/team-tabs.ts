import type { TabNavItem } from '@bellum/ui'
import type { TFunction } from 'i18next'

/**
 * Les sous-pages de l'espace Équipe (partagé). L'ordre est celui de Théo :
 * Vue d'ensemble · Objectifs & affaires · Plans & actions. Chaque entrée est une
 * ROUTE (atteignable, partageable), jamais un état local.
 */
export function teamSectionTabs(t: TFunction<'manager'>): TabNavItem[] {
  return [
    { key: 'overview', label: t('team.nav.overview'), to: '/team' },
    { key: 'business', label: t('team.nav.business'), to: '/team/business' },
    { key: 'plans', label: t('team.nav.plans'), to: '/team/plans' },
  ]
}
