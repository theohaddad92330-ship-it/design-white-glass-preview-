import { useTranslation } from 'react-i18next'
import { Crosshair } from 'lucide-react'
import { cn } from '@bellum/ui'

/**
 * #4530.1 — « Ma cible » : UN bouton bascule dans la barre d'exploration (Louis 24/10). Il remplace le panneau
 * « Ta cible » et le sélecteur « Contexte ». Inactif = recherche neutre (#4529) ; actif = contexte « Mon activité »
 * et critères du profil dans les puces. `aria-pressed` dit l'état, la cible tactile fait 44 px, il se tabule.
 * `disabled` seulement le temps que le profil se lit : jamais une cible posée à moitié.
 */
export function MyTargetToggle({
  pressed,
  disabled,
  onToggle,
}: {
  pressed: boolean
  disabled: boolean
  onToggle: () => void
}) {
  const { t } = useTranslation('discover')
  return (
    <button
      type="button"
      data-testid="discover-my-target"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        'inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors disabled:cursor-wait disabled:opacity-60',
        pressed
          ? 'border-[var(--bellum-accent-line)] bg-[var(--bellum-accent-bg)] text-[var(--bellum-text-accent)]'
          : 'border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] text-[var(--bellum-text-primary)] hover:bg-[var(--bellum-surface-2)]',
      )}
    >
      <Crosshair className="size-4" aria-hidden="true" />
      {t('overview.myTarget')}
    </button>
  )
}
