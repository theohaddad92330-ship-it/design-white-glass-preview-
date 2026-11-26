import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown } from 'lucide-react'
import { LAURA_CONTEXT_MODES, type LauraContextMode } from '@bellum/contracts'
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  Text,
} from '@bellum/ui'
import { useIsMobile } from '@/features/mobile/useIsMobile'

/**
 * #2451.1 — LE composant de mode de contexte, UN seul pour toutes les surfaces :
 * le composeur de Laura (`ContextModeSelector`), Analyser et Découvrir
 * (`SurfaceContextChip`). Contrôlé : il ne sait ni où le mode est gardé (store
 * par fil, URL, état d'écran), ni ce qu'il retire — il montre la liste du
 * contrat (`LAURA_CONTEXT_MODES`, ou le sous-ensemble qu'une surface tient) et
 * rend le choix. La liste ne se dédouble jamais (GA-26) ; seul son habillage
 * change avec `useIsMobile` (popover sur bureau, feuille du bas sur mobile).
 */
export function ContextModePicker({
  value,
  onChange,
  modes = LAURA_CONTEXT_MODES,
  disabled,
}: {
  value: LauraContextMode
  onChange: (mode: LauraContextMode) => void
  /** Les modes que la surface tient réellement — un mode non tenu n'est pas proposé. */
  modes?: readonly LauraContextMode[]
  disabled?: boolean
}) {
  const { t } = useTranslation('workContexts')
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(false)
  const groupLabelId = useId()

  function choose(mode: LauraContextMode) {
    onChange(mode)
    setOpen(false)
  }

  const trigger = (
    // #3353 (LAU-UI-304) — `outline` plutôt que `ghost` : le même relief que
    // les autres pastilles du composeur (`ConnectedToolsStrip`, les amorces),
    // pour que le déclencheur se voie comme un vrai contrôle plutôt que comme
    // du texte flottant au milieu de la barre.
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={disabled}
      aria-label={t('mode.triggerLabel', { mode: t(`mode.modes.${value}.label`) })}
      // #3356 — 44 px au pointeur fin aussi (mesuré 127×32 en prod le 05/10).
      className="min-h-11 gap-1 rounded-full text-[var(--bellum-text-secondary)]"
    >
      {t(`mode.modes.${value}.label`)}
      <ChevronDown className="size-3.5 shrink-0" aria-hidden="true" />
    </Button>
  )

  const choices = (
    <div role="radiogroup" aria-labelledby={groupLabelId} className="flex flex-col gap-1">
      <Text id={groupLabelId} size="xs" className="px-2 text-[var(--bellum-text-secondary)]">
        {t('mode.intro')}
      </Text>
      {modes.map(mode => {
        const selected = mode === value
        return (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={t(`mode.modes.${mode}.label`)}
            aria-describedby={`${groupLabelId}-${mode}`}
            onClick={() => choose(mode)}
            className={`flex min-h-11 flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left outline-none transition-colors hover:bg-[var(--bg-glass)] focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)] ${
              selected ? 'border-[var(--bellum-primary-500)]' : 'border-[var(--bellum-border)]'
            }`}
          >
            <Text size="sm" weight="medium">
              {t(`mode.modes.${mode}.label`)}
              {selected ? ` · ${t('mode.selected')}` : ''}
            </Text>
            <span id={`${groupLabelId}-${mode}`} className="flex flex-col gap-0.5">
              <Text size="xs">{t(`mode.modes.${mode}.does`)}</Text>
              <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                {t(`mode.modes.${mode}.when`)}
              </Text>
            </span>
          </button>
        )
      })}
      <Text size="xs" className="px-2 pt-1 text-[var(--bellum-text-secondary)]">
        {t('mode.profileUntouched')}
      </Text>
    </div>
  )

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent
          side="bottom"
          closeLabel={t('common:actions.close')}
          className="gap-2 px-2 pb-[env(safe-area-inset-bottom)]"
        >
          <SheetHeader>
            <SheetTitle className="text-sm">{t('mode.title')}</SheetTitle>
          </SheetHeader>
          {choices}
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="start" className="w-80 space-y-2 p-2">
        <Text size="sm" weight="medium" className="px-2 pt-1">
          {t('mode.title')}
        </Text>
        {choices}
      </PopoverContent>
    </Popover>
  )
}
