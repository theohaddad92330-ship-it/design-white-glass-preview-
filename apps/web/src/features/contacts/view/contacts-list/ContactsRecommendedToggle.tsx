import { cn } from '@bellum/ui'
import { useTranslation } from 'react-i18next'

export type RecommendedFilterValue = 'recommended' | 'all'

type Props = {
  /**
   * #3942.2 — chaque chiffre est INDÉPENDANT : la portée active connaît son
   * propre total (`totalContacts`, paginé) plus le `recommendedTally.all`
   * que l'API rend avec lui, mais l'AUTRE portée n'a pas été interrogée —
   * son chiffre reste `undefined` (jamais deviné) tant qu'on n'a pas basculé
   * sur elle.
   */
  counts: { recommended: number | undefined; all: number | undefined } | undefined
  value: RecommendedFilterValue
  /** #4581 — un filtre est posé : les deux chiffres comptent la VUE, pas l'espace, et le disent. */
  filtered?: boolean
  onChange: (next: RecommendedFilterValue) => void
  className?: string
}

/**
 * #3942.1 — spec de Louis (#3942, 08/10) : « n'afficher par défaut que les
 * contacts recommandés par compte ». Doctrine : le copilote PROPOSE, il ne
 * filtre jamais une liste en silence — donc un FILTRE visible, retirable en
 * un clic (« Tous les contacts »), jamais une liste amputée sans le dire.
 *
 * Toujours visible, hors du pli « Filtres » : le défaut qui change ce qu'on
 * voit en arrivant sur l'écran doit se voir, et se défaire, sans ouvrir une
 * section repliée (même raisonnement que `ContactsCoordinateQuickFilters`).
 */
export function ContactsRecommendedToggle({ counts, value, onChange, filtered = false, className }: Props) {
  const { t } = useTranslation('contacts')

  // #4503.4 (contrat Louis 24/10) — la bascule RESTE, sous la forme sobre de la maquette (`.t-seg`) : deux
  // segments « Tous · Recommandés », le chiffre en retrait quand il est connu (jamais deviné, voir `counts`).
  const options = [
    {
      value: 'all' as const,
      label: t(filtered ? 'recommended.chipAllInView' : 'recommended.chipAll'),
      count: counts?.all,
    },
    {
      value: 'recommended' as const,
      label: t(filtered ? 'recommended.chipRecommendedInView' : 'recommended.chipRecommended'),
      count: counts?.recommended,
    },
  ]

  return (
    <div
      role="group"
      aria-label={t('recommended.filterAria')}
      title={t('recommended.legend')}
      data-testid="contacts-recommended-toggle"
      className={cn(
        'inline-flex shrink-0 items-center rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-0.5',
        className,
      )}
    >
      {options.map(option => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => {
              if (!active) onChange(option.value)
            }}
            className={cn(
              'inline-flex min-h-9 items-center gap-1.5 rounded px-3 text-xs font-medium transition-colors pointer-coarse:min-h-11',
              active
                ? 'bg-card text-[var(--bellum-text-primary)] shadow-sm'
                : 'text-[var(--bellum-text-muted)] hover:text-[var(--bellum-text-primary)]',
            )}
          >
            {option.label}
            {/* #4661 (GA-26) — le segment actif ne répète pas le total de l'en-tête du répertoire (« 878 recommandés ») :
                un chiffre, un endroit. L'AUTRE segment garde le sien — c'est ce que le clic ferait voir. */}
            {!active && option.count !== undefined ? (
              <span className="tabular-nums text-[var(--bellum-text-muted)]">{option.count}</span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
