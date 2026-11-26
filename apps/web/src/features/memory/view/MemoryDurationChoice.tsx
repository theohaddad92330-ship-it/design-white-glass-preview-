import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { Text, cn } from '@bellum/ui'
import {
  formatMemoryDate,
  memoryDurationIso,
  MEMORY_DURATIONS,
  type MemoryDuration,
} from '@/features/memory/lib/memory-dates'

/**
 * #1917.6 — « JUSQU'À QUAND ? », demandé AVANT d'épingler.
 *
 * Laura proposait d'épingler un fait sans jamais demander combien de temps il
 * vaut : tout ce qu'elle retenait valait POUR TOUJOURS. « On est en appel
 * d'offres » et « leur DSI s'appelle Julie » ne se périment pas au même rythme.
 *
 * Quatre choix, « Sans échéance » d'abord et coché par défaut : c'est ce que
 * faisait l'épinglage avant ce lot, et une mémoire ne se périme pas parce qu'un
 * écran a ajouté un champ. La DATE résolue est annoncée sous le choix — « 3
 * mois » ne se vérifie pas de tête.
 *
 * Le calcul n'est pas ici : il vient de `memoryDurationIso`, avec les autres
 * dates de la mémoire (GA-26). Des boutons radio natifs dans des `<label>` de
 * 44 px (GA-30) : ils se tabulent et s'annoncent sans rien réinventer (GA-35).
 */
export function MemoryDurationChoice({
  value,
  onChange,
  disabled = false,
}: {
  value: MemoryDuration
  onChange: (duration: MemoryDuration) => void
  disabled?: boolean
}) {
  const { t, i18n } = useTranslation('knowledge')
  const name = useId()
  const until = formatMemoryDate(memoryDurationIso(value), i18n.language, { utc: true })
  return (
    <fieldset disabled={disabled} className="mt-2.5 min-w-0 space-y-1.5">
      <legend className="mb-1 text-xs font-medium text-[var(--bellum-text-secondary)]">
        {t('memory.durationLegend')}
      </legend>
      <div className="flex flex-wrap gap-2">
        {MEMORY_DURATIONS.map(option => {
          const checked = value === option
          return (
            <label
              key={option}
              className={cn(
                'inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 text-xs transition-colors',
                'focus-within:ring-2 focus-within:ring-[var(--bellum-primary-500)]',
                checked
                  ? 'border-[var(--bellum-primary-500)] bg-[var(--bellum-surface-2)] text-[var(--bellum-text-primary)]'
                  : 'border-[var(--bellum-border)] text-[var(--bellum-text-secondary)]',
              )}
            >
              <input
                type="radio"
                name={name}
                value={option}
                checked={checked}
                onChange={() => onChange(option)}
                className="size-4 shrink-0 accent-[var(--bellum-primary-500)]"
              />
              {t(`memory.duration.${option}`)}
            </label>
          )
        })}
      </div>
      {/* Rien quand il n'y a pas d'échéance : une ligne vide se lirait comme une
          date qu'on n'a pas su calculer. */}
      {until ? (
        <Text size="xs" color="text-[var(--bellum-text-muted)]">
          {t('memory.until', { date: until })}
        </Text>
      ) : null}
    </fieldset>
  )
}
