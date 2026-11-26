import { ModeTabs, type ModeTabItem } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import type { SiteViewMode } from '../../components/sites/siteStyles'
export type { SiteViewMode } from '../../components/sites/siteStyles'

export function SiteViewTabs({
  value,
  onChange,
  available,
}: {
  value: SiteViewMode
  onChange: (mode: SiteViewMode) => void
  /** Categories that actually carry a site — the empty ones are never offered.
   *  `all` is always shown. Omit to show every category (back-compat). */
  available?: Exclude<SiteViewMode, 'all'>[]
}) {
  const { t } = useTranslation('accountSites')
  // i18n keys: categories.all | categories.headquarters | categories.office | categories.establishment | categories.industrial
  const keys: SiteViewMode[] = ['all', ...(available ?? ['headquarters', 'office', 'establishment', 'industrial'])]
  const items: Array<ModeTabItem<SiteViewMode>> = keys.map(key => ({ key, label: t(`categories.${key}`) }))
  return <ModeTabs items={items} value={value} onChange={onChange} />
}
