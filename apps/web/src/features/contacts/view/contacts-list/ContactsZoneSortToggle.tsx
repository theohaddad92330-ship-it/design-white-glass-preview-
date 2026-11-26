import { cn } from '@bellum/ui'
import { MapPin } from 'lucide-react'
import { useTranslation } from 'react-i18next'

type Props = { active: boolean; onChange: (next: boolean) => void; className?: string }

/**
 * #4982.1 — « Trier par zone » : les plus proches d'abord, la zone inconnue en dernier. Le tri est fait EN SQL (la
 * liste est paginée) ; un geste visible et retirable, jamais un ordre imposé en silence. Pas de carte (#4982.2).
 */
export function ContactsZoneSortToggle({ active, onChange, className }: Props) {
  const { t } = useTranslation('contacts')
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={t('zoneSort.toggleAria')}
      title={t('zoneSort.toggleHint')}
      data-testid="contacts-zone-sort-toggle"
      onClick={() => onChange(!active)}
      className={cn(
        'inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-md border px-3 text-sm',
        active
          ? 'border-[var(--bellum-border-strong)] bg-[var(--bellum-surface-2)] text-[var(--bellum-text-primary)]'
          : 'border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] text-[var(--bellum-text-secondary)]',
        className,
      )}
    >
      <MapPin className="size-4" aria-hidden />
      {t('zoneSort.toggle')}
    </button>
  )
}
