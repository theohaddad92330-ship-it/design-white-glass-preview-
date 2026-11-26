import { cn, Popover, PopoverContent, PopoverTrigger, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { normalizeContactPriority, priorityTone, type PriorityTone } from '../lib/contactPriority'

const TONE_CLASS: Record<PriorityTone, string> = {
  strong: 'border-emerald-500/40 bg-emerald-500/15 text-[var(--success-soft-text)]',
  medium: 'border-amber-500/40 bg-amber-500/15 text-[var(--warning-soft-text)]',
  weak: 'border-slate-500/40 bg-slate-500/15 text-slate-700 dark:text-slate-300',
}

/**
 * Renders `contact.priority` as what it is — an ordinal rank where 1 is the
 * best — instead of a score circle that read bigger-is-better and inverted the
 * meaning. The rank is always shown with its « P » prefix.
 *
 * #2622.1 — la bulle qui explique le rang (pourquoi / quoi faire) ne tenait
 * QUE sur l'attribut `title` : ni tabulable au clavier, ni ouvrable au
 * toucher (un `title` ne déclenche rien sous un doigt). Le badge est
 * maintenant un VRAI bouton (`PopoverTrigger`), ouvert au clic, au clavier
 * (focus natif + Entrée/Espace) et au toucher — GA-32/GA-35.
 */
export function ContactPriorityBadge({ value, className }: { value: number | null; className?: string }) {
  const { t } = useTranslation('accountOrg')
  const rank = normalizeContactPriority(value)
  const tone = priorityTone(rank)

  if (rank === null || tone === null) {
    return <span className="text-[var(--bellum-text-muted)]">{'—'}</span>
  }

  return (
    <Popover>
      <PopoverTrigger
        type="button"
        aria-label={t('priority.rankTitle', { rank })}
        className={cn(
          'inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums',
          'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)]',
          'pointer-coarse:min-h-11 pointer-coarse:px-3',
          TONE_CLASS[tone],
          className,
        )}
      >
        {t('priority.rankShort', { rank })}
      </PopoverTrigger>
      <PopoverContent align="start" side="top" sideOffset={8} className="w-64 p-3">
        <Text element="p" size="xs" weight="semibold" className="text-foreground">
          {t('priority.rankTitle', { rank })}
        </Text>
        <Text element="p" size="xs" className="mt-2 text-muted-foreground">
          {t('priority.explainWhy')}
        </Text>
        <Text element="p" size="xs" className="mt-2 text-muted-foreground">
          {t(`priority.explainAction_${tone}`)}
        </Text>
      </PopoverContent>
    </Popover>
  )
}
