import { Tooltip, TooltipContent, TooltipTrigger, cn } from '@bellum/ui'
import { AlignJustify, LayoutGrid } from 'lucide-react'
import { useTranslation } from 'react-i18next'

type ViewMode = 'list' | 'grid'

type ViewModeToggleProps = {
  viewMode: ViewMode
  onChangeViewMode: (mode: ViewMode) => void
}

const BUTTON = 'flex items-center justify-center w-7 h-7 rounded-md transition-all'
const ACTIVE = 'bg-violet-500/20 text-[var(--bellum-text-accent)]'
const IDLE = 'text-[var(--text-ghost)] hover:text-[var(--text-muted)]'

export function ViewModeToggle({ viewMode, onChangeViewMode }: ViewModeToggleProps) {
  const { t } = useTranslation('accounts')
  return (
    <div className="flex items-center rounded-lg p-0.5 bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => onChangeViewMode('list')}
            aria-label={t('viewMode.list')}
            className={cn(BUTTON, viewMode === 'list' ? ACTIVE : IDLE)}
          >
            <AlignJustify className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{t('viewMode.list')}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => onChangeViewMode('grid')}
            aria-label={t('viewMode.grid')}
            className={cn(BUTTON, viewMode === 'grid' ? ACTIVE : IDLE)}
          >
            <LayoutGrid className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{t('viewMode.grid')}</TooltipContent>
      </Tooltip>
    </div>
  )
}
