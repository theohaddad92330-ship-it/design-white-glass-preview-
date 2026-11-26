import type { AnalysisContextPreset } from '@bellum/contracts'
import { cn, DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from '@bellum/ui'
import { Building2, CalendarDays, Check, Plus, Target, Users, type LucideIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { INTENT_SUGGESTIONS } from '../lib/intentSuggestions'

type IntentPickerProps = {
  preset: AnalysisContextPreset
  onPick: (preset: AnalysisContextPreset) => void
  /** Les libellés cochés, à chaque changement — pour que l'écran de vérification les rappelle. */
  onSelectedChange?: (labelKeys: string[]) => void
}

/**
 * Les quatre objectifs les plus fréquents restent à portée de clic ; les autres sont sous « Autres
 * objectifs » (refonte Théo R1 — les pertinents d'abord, le reste derrière UN menu, rien de retiré).
 */
const PRIMARY_INTENTS: readonly string[] = [
  'intent.openAccount',
  'intent.knownAccount',
  'intent.findDecisionMakers',
  'intent.understandSubsidiaries',
]

/** Le symbole de chaque tuile (`.an15-intent .icon`). */
const INTENT_ICONS: Record<string, LucideIcon> = {
  'intent.openAccount': Target,
  'intent.knownAccount': CalendarDays,
  'intent.findDecisionMakers': Users,
  'intent.understandSubsidiaries': Building2,
}

// #4086 — le libellé allumé à l'arrivée (preset venu de l'URL/Découvrir) : le
// PREMIER libellé qui porte ce preset, jamais tous ceux qui le partagent.
function initialSelection(preset: AnalysisContextPreset): string[] {
  const first = INTENT_SUGGESTIONS.find(s => s.preset === preset)
  return first ? [first.labelKey] : []
}

/**
 * #1589 (première moitié) — « Ce que tu veux obtenir » : les presets existants
 * (`searchComposerPresets.ts`), rendus visibles. Chaque choix RÉUTILISE le preset EXISTANT via
 * `INTENT_SUGGESTIONS` — cette liste ne calcule ni ne stocke rien de nouveau, elle traduit un
 * clic en `onPick(preset)`.
 *
 * « Autre » (texte libre) reste TOUJOURS proposé, à part des suggestions : « Un autre objectif »,
 * dans le menu. Multi-sélection additive, dans l'ordre des clics ; le contexte (un seul preset)
 * suit le DERNIER libellé coché (#4086).
 */
export function IntentPicker({ preset, onPick, onSelectedChange }: IntentPickerProps) {
  const { t } = useTranslation('search')
  const [selected, setSelected] = useState<string[]>(() => initialSelection(preset))

  useEffect(() => {
    onSelectedChange?.(selected)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- notifie la sélection, pas l'identité du rappel
  }, [selected])

  // Preset changé de l'extérieur (reset, modèle de contexte, autre écran) : la sélection suit.
  useEffect(() => {
    const last = selected[selected.length - 1]
    const lastPreset = INTENT_SUGGESTIONS.find(s => s.labelKey === last)?.preset
    if (last === undefined ? preset !== 'free' : lastPreset !== preset) setSelected(initialSelection(preset))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ne réagit qu'au preset externe
  }, [preset])

  const toggle = (labelKey: string) => {
    const next = selected.includes(labelKey) ? selected.filter(k => k !== labelKey) : [...selected, labelKey]
    setSelected(next)
    const last = next[next.length - 1]
    const nextPreset = INTENT_SUGGESTIONS.find(s => s.labelKey === last)?.preset ?? 'free'
    onPick(nextPreset)
  }
  const otherActive = selected.length === 0 && preset === 'free'
  const secondary = INTENT_SUGGESTIONS.filter(s => !PRIMARY_INTENTS.includes(s.labelKey))
  const secondaryCount = secondary.filter(s => selected.includes(s.labelKey)).length + (otherActive ? 1 : 0)

  return (
    <div className="flex flex-col gap-1.5">
      {/* `.an15-intents` : quatre tuiles en grille 2 × 2, l'objectif retenu teinté d'accent et coché. */}
      <div role="group" aria-label={t('intent.label')} data-analyze-intents className="grid grid-cols-2 gap-2">
        {PRIMARY_INTENTS.map(labelKey => {
          const on = selected.includes(labelKey)
          const Icon = INTENT_ICONS[labelKey] ?? Target
          return (
            <button
              key={labelKey}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(labelKey)}
              className={cn(
                'flex min-h-11 min-w-0 items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs leading-snug transition-colors duration-immediate md:min-h-10',
                on
                  ? 'border-[var(--bellum-accent-line)] bg-[var(--bellum-accent-bg)] font-semibold text-[var(--bellum-text-accent)]'
                  : 'border-[var(--bellum-border)] bg-card text-[var(--bellum-text-primary)] hover:bg-[var(--bellum-surface-2)]',
              )}
            >
              <Icon
                className={cn(
                  'size-4 shrink-0',
                  on ? 'text-[var(--bellum-text-accent)]' : 'text-[var(--bellum-text-muted)]',
                )}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1">{t(labelKey)}</span>
              <Check
                className={cn(
                  'size-3 shrink-0',
                  on ? 'text-[var(--bellum-text-accent)]' : 'text-[var(--bellum-text-muted)] opacity-50',
                )}
                aria-hidden="true"
              />
            </button>
          )
        })}
      </div>
      <div className="flex min-h-7 flex-wrap items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={t('intent.moreAria', { count: secondaryCount })}
              className={cn(
                'inline-flex min-h-11 items-center gap-1.5 py-1 text-xs transition-colors duration-immediate md:min-h-7',
                secondaryCount > 0
                  ? 'font-semibold text-[var(--bellum-text-accent)]'
                  : 'text-[var(--bellum-text-secondary)] hover:text-[var(--bellum-text-accent)]',
              )}
            >
              <Plus className="size-3.5" aria-hidden="true" />
              {t('intent.more')}
              {secondaryCount > 0 ? <span aria-hidden="true">· {secondaryCount}</span> : null}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {secondary.map(s => (
              <DropdownMenuCheckboxItem
                key={s.labelKey}
                checked={selected.includes(s.labelKey)}
                onCheckedChange={() => toggle(s.labelKey)}
                onSelect={event => event.preventDefault()}
              >
                {t(s.labelKey)}
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuCheckboxItem
              checked={otherActive}
              onCheckedChange={() => {
                setSelected([])
                onPick('free')
              }}
            >
              {t('intent.other')}
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
