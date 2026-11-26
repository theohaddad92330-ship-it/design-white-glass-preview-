import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { meaningfulFilters } from '@/features/discover/lib/discover-saved-searches'
import { searchHistoryLabel } from '@/features/discover/lib/discover-search-history-label'
import { applicationSectorLabel } from '@/features/discover/lib/discover-sectors'
import type { UnifiedFilters } from '@/features/discover/lib/discover-filters'
import { useRecordTeamResearch } from './useTeamResearch'

/**
 * Théo D team-recherches.N1 — chaque recherche Découvrir menée jusqu'à ses résultats est gardée pour
 * l'équipe (le périmètre et le NOMBRE de comptes, jamais les comptes eux-mêmes). Un rail sans critère
 * n'est pas une recherche. Un échec d'enregistrement ne gêne jamais la recherche.
 *
 * `resultCount === null` : les résultats ne sont pas (encore) là — rien n'est posté.
 */
export function useRecordDiscoverResearch(filters: UnifiedFilters, resultCount: number | null): void {
  const { t, i18n } = useTranslation('discover')
  const { mutate } = useRecordTeamResearch()
  const lastPosted = useRef('')

  useEffect(() => {
    if (resultCount === null) return
    const meaningful = meaningfulFilters(filters)
    const key = JSON.stringify(meaningful)
    if (key === '{}') return
    const signature = `${key}|${resultCount}`
    if (lastPosted.current === signature) return
    lastPosted.current = signature
    const title =
      searchHistoryLabel(filters, {
        preset: id => t(`presets.${id}.label`, { defaultValue: '' }),
        headcount: range => t(`headcount.${range}`, { defaultValue: '' }),
        sector: code => applicationSectorLabel(code, i18n.language),
      }) || t('sidebar.historyUntitled')
    mutate({ title, filters: meaningful, result_count: resultCount })
  }, [filters, resultCount, mutate, t, i18n.language])
}
