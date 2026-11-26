import { Button, cn, Tooltip, TooltipContent, TooltipTrigger } from '@bellum/ui'
import { Moon, Sun } from 'lucide-react'
import { memo, type MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useTheme } from '@/features/theme/theme-provider'

/**
 * One-click light↔dark toggle sitting in the sidebar footer row, next to the
 * help / notifications / changelog buttons. Shows a sun while dark (click →
 * light) and a moon while light (click → dark). Passing the click event to
 * `toggleTheme` keeps the circular view-transition ripple.
 */
export const ThemeToggle = memo(function ThemeToggle() {
  const { resolvedTheme, toggleTheme } = useTheme()
  const { t } = useTranslation('nav')
  const isDark = resolvedTheme === 'dark'
  const Icon = isDark ? Sun : Moon
  const label = isDark ? t('theme.toLight') : t('theme.toDark')

  return (
    <Tooltip delayDuration={1000}>
      <TooltipTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          aria-label={label}
          onClick={(e: MouseEvent) => toggleTheme(e)}
          className={cn(
            'relative size-7 pointer-coarse:size-11 cursor-pointer rounded-full border border-[var(--bellum-border)] bg-[var(--bellum-bg-lighter)] text-[var(--bellum-text-muted)] shadow-xs hover:bg-[var(--bellum-surface-2)] hover:text-[var(--bellum-text-primary)]',
          )}
        >
          <Icon className="w-4 h-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  )
})
