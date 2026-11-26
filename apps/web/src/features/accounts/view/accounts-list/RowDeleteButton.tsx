import { Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface RowDeleteButtonProps {
  onClick: (e: React.MouseEvent) => void
}

/** Tiny delete button revealed on row hover (uses parent's `group-hover`). */
export function RowDeleteButton({ onClick }: RowDeleteButtonProps) {
  const { t } = useTranslation('accounts')
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t('common:actions.delete')}
      title={t('common:actions.delete')}
      // ⚠️ Visible au survol ET au focus clavier — `group-hover` seul rendait
      // ce bouton focusable mais INVISIBLE pour qui tabule sans souris.
      className="flex items-center justify-center w-7 h-7 rounded-sm opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 hover:bg-[var(--danger-soft-bg)] text-[var(--text-ghost)]"
    >
      <Trash2 className="size-3.5" />
    </button>
  )
}
