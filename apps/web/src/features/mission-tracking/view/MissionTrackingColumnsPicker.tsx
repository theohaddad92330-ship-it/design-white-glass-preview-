import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@bellum/ui'
import { SlidersHorizontal } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  MISSION_TRACKING_COLUMN_KEYS,
  PINNED_MISSION_TRACKING_COLUMNS,
  type MissionTrackingColumnKey,
} from '../columns'

/**
 * Le sélecteur de colonnes de la grande table — même patron que
 * `@/features/missions/view/MissionColumnsPicker.tsx` : il ne DÉCLARE rien
 * (les colonnes vivent dans `columns.ts`, le choix dans
 * `useMissionTrackingColumns`), il ne fait que le rendre (GA-26).
 */
export function MissionTrackingColumnsPicker({
  visible,
  onToggle,
  onReset,
}: {
  visible: readonly MissionTrackingColumnKey[]
  onToggle: (key: MissionTrackingColumnKey, visible: boolean) => void
  onReset: () => void
}) {
  const { t } = useTranslation('missionTracking')

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <SlidersHorizontal className="mr-2 size-4" aria-hidden="true" />
          {t('table.columnsCta')}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{t('table.columnsLabel')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {MISSION_TRACKING_COLUMN_KEYS.map(key => {
          const pinned = PINNED_MISSION_TRACKING_COLUMNS.has(key)
          return (
            <DropdownMenuCheckboxItem
              key={key}
              checked={visible.includes(key)}
              disabled={pinned}
              title={pinned ? t('table.columnsPinned') : undefined}
              onSelect={event => event.preventDefault()}
              onCheckedChange={checked => onToggle(key, checked === true)}
            >
              {t(`table.columns.${key}`)}
            </DropdownMenuCheckboxItem>
          )
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onReset()}>{t('table.columnsReset')}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
