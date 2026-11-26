import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@bellum/ui'
import { Check, Languages } from 'lucide-react'
import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  LANGUAGE_LABELS,
  LANGUAGE_SHORT_LABELS,
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
  isSupportedLanguage,
} from './config'

/**
 * Resolve the active language to one of the supported codes (i18next may report
 * a region-tagged value such as `fr-FR`).
 */
function activeLanguage(raw: string): SupportedLanguage {
  const base = raw.split('-')[0]
  return isSupportedLanguage(base) ? base : 'fr'
}

type LanguageSwitcherProps = {
  /**
   * `icon` (default): round icon button for the sidebar footer row.
   * `inline`: a labelled control for a settings panel.
   */
  variant?: 'icon' | 'inline'
  align?: 'start' | 'center' | 'end'
  side?: 'top' | 'right' | 'bottom' | 'left'
}

export const LanguageSwitcher = memo<LanguageSwitcherProps>(function LanguageSwitcher({
  variant = 'icon',
  align = 'start',
  side = 'right',
}) {
  const { t, i18n } = useTranslation('common')
  const current = activeLanguage(i18n.language)

  const change = (next: string) => {
    if (isSupportedLanguage(next) && next !== current) {
      void i18n.changeLanguage(next)
    }
  }

  const content = (
    <DropdownMenuContent
      side={side}
      align={align}
      sideOffset={8}
      className="min-w-40 rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-1.5 text-[var(--bellum-text-primary)] shadow-[var(--shadow-elevated)]"
    >
      <DropdownMenuRadioGroup value={current} onValueChange={change}>
        {SUPPORTED_LANGUAGES.map(lng => (
          <DropdownMenuRadioItem
            key={lng}
            value={lng}
            className="gap-2.5 rounded-lg px-2.5 py-2 text-sm text-[var(--bellum-text-secondary)] focus:bg-[var(--bellum-surface-2)] focus:text-[var(--bellum-text-primary)] cursor-pointer [&>span:first-child]:hidden"
          >
            <span className="flex-1">{LANGUAGE_LABELS[lng]}</span>
            {lng === current && <Check className="size-4 text-[var(--bellum-text-accent)]" />}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  )

  if (variant === 'inline') {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="min-w-36 justify-between gap-2"
            aria-label={t('language.select')}
          >
            <span className="inline-flex items-center gap-2">
              <Languages className="size-4 text-[var(--bellum-text-muted)]" />
              {LANGUAGE_LABELS[current]}
            </span>
            <span className="text-[var(--bellum-text-muted)]">{LANGUAGE_SHORT_LABELS[current]}</span>
          </Button>
        </DropdownMenuTrigger>
        {content}
      </DropdownMenu>
    )
  }

  return (
    <DropdownMenu>
      <Tooltip delayDuration={1000}>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              aria-label={t('language.select')}
              className={cn(
                'relative size-7 pointer-coarse:size-11 cursor-pointer rounded-full border border-[var(--bellum-border)] bg-[var(--bellum-bg-lighter)] text-[var(--bellum-text-muted)] shadow-xs hover:bg-[var(--bellum-surface-2)] hover:text-[var(--bellum-text-primary)]',
              )}
            >
              <Languages className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="right">{t('language.label')}</TooltipContent>
      </Tooltip>
      {content}
    </DropdownMenu>
  )
})
