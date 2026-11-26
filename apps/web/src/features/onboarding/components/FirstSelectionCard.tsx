import { Link } from '@tanstack/react-router'
import { Compass } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button, Text } from '@bellum/ui'
import { useFirstSelection } from '@/features/onboarding/hooks/useOnboarding'

/**
 * #2626.2 — « montrer une première sélection de comptes en fin de Temps 1 » :
 * la raison tangible d'avoir répondu, montrée sur l'écran de relecture
 * (`OnboardingReviewPage`), AVANT que la génération longue (3-6 min, Temps 2)
 * ne démarre. Dérivée du secteur ciblé tout juste répondu, via le même moteur
 * de découverte que « comptes similaires à explorer ».
 *
 * Ne rend RIEN pendant le chargement au-delà d'une ligne d'attente, et RIEN
 * du tout quand la liste est vide (secteur pas assez précis, découverte
 * indisponible) : jamais un « 0 compte trouvé » — une valeur absente ne
 * s'affiche jamais « 0 » (GA-18/GA-19).
 */
export function FirstSelectionCard() {
  const { t } = useTranslation('onboarding')
  const { data, isLoading } = useFirstSelection()

  if (isLoading) {
    return (
      <div
        className="rounded-card border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-6"
        data-testid="first-selection-loading"
      >
        <Text element="p" size="sm" className="text-[var(--bellum-text-muted)]">
          {t('review.firstSelection.loading')}
        </Text>
      </div>
    )
  }

  const suggestions = data?.suggestions ?? []
  if (suggestions.length === 0) return null

  return (
    <div
      className="flex flex-col rounded-card border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-6"
      data-testid="first-selection-card"
    >
      <div className="space-y-2">
        <Text
          element="p"
          size="xs"
          weight="semibold"
          className="uppercase tracking-[0.12em] text-[var(--bellum-text-accent)]"
        >
          {t('review.firstSelection.eyebrow')}
        </Text>
        <Text element="h2" size="xl" weight="semibold">
          {t('review.firstSelection.title')}
        </Text>
        <Text element="p" size="sm" className="text-[var(--bellum-text-secondary)]">
          {t('review.firstSelection.description')}
        </Text>
      </div>
      <ul className="mt-5 divide-y divide-[var(--bellum-border)] border-t border-[var(--bellum-border)]">
        {suggestions.map(suggestion => (
          <li key={`${suggestion.siren || suggestion.name}`} className="flex items-start gap-4 py-4">
            <span
              aria-hidden="true"
              className="flex size-10 shrink-0 items-center justify-center rounded-control bg-[var(--bellum-surface-2)] text-xs font-semibold text-[var(--bellum-text-secondary)]"
            >
              {initialsOf(suggestion.name)}
            </span>
            <span className="min-w-0">
              <Text element="span" size="sm" weight="semibold" className="block truncate">
                {suggestion.name}
              </Text>
              {(suggestion.sector || suggestion.city) && (
                <Text element="span" size="xs" className="block text-[var(--bellum-text-muted)]">
                  {[suggestion.sector, suggestion.city].filter(Boolean).join(' · ')}
                </Text>
              )}
            </span>
          </li>
        ))}
      </ul>
      <Button asChild variant="soft" className="mt-2 w-fit">
        <Link to="/discover">
          <Compass aria-hidden="true" className="mr-2 h-4 w-4" />
          {t('review.firstSelection.discover')}
        </Link>
      </Button>
    </div>
  )
}

/** Les initiales d'un compte (deux lettres), comme les pastilles de la maquette. */
function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const letters = words.length > 1 ? `${words[0]![0] ?? ''}${words[1]![0] ?? ''}` : name.trim().slice(0, 2)
  return letters.toUpperCase()
}
