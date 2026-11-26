import { cn, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'

export type NetworkChannel = 'with_email' | 'with_phone'

type Props = {
  /** Contacts du répertoire. `undefined` = inconnu : aucun chiffre, jamais « 0 ». */
  total: number | undefined
  /** Chaque compte n'existe que s'il est CONNU (toutes les pages chargées) — sinon rien, jamais un zéro. */
  counts: { withEmail: number | undefined; withPhone: number | undefined; unattached: number | undefined }
  channel: NetworkChannel | null
  unattachedActive: boolean
  onChannelChange: (next: NetworkChannel | null) => void
  onUnattachedChange: (next: boolean) => void
  /**
   * #4503.2 — ce que le total COMPTE : `all` = tout le répertoire, `recommended` = les contacts recommandés (le défaut
   * de l'écran). Un compteur nomme ce qu'il mesure, ou il ment (c65) : « 828 dans tout le répertoire » alors que le
   * sélecteur dit « Tous 66746 » ne pouvait pas être vrai.
   */
  scope?: 'all' | 'recommended'
  /** #4493.4 — le total est un bouton comme les trois tuiles : il retire les filtres de canal / à rattacher. */
  onTotalSelect?: () => void
  /** #4601 — le chiffre compte la vue filtrée, pas tout le répertoire : l'en-tête le dit. */
  filtered?: boolean
  className?: string
}

type Tile = {
  key: string
  label: string
  count: number | undefined
  hint: string
  active: boolean
  onClick: () => void
}

/**
 * Théo B c1-repertoire.R5 — « Un réseau à faire vivre » : le total du répertoire et trois tuiles
 * (Avec e-mail · Avec téléphone · À rattacher) qui filtrent au clic. Elles lisent et écrivent les
 * MÊMES réglages que la rangée de filtres (canal, portée « à qualifier ») : un réglage, un endroit (GA-26).
 * D-3 : le chiffre s'écrit « 9 », jamais « 09 » ; une valeur inconnue n'a pas de chiffre.
 */
export function ContactsNetworkOverview({
  total,
  counts,
  channel,
  unattachedActive,
  onChannelChange,
  onUnattachedChange,
  scope = 'all',
  onTotalSelect,
  filtered = false,
  className,
}: Props) {
  const { t } = useTranslation('contacts')
  // #4601 — l'en-tête dit de quoi il parle : tout le répertoire, ou la vue filtrée.
  const scopeLabel = filtered
    ? t('overview.totalScopeFiltered')
    : scope === 'recommended'
      ? t('overview.totalScopeRecommended')
      : t('overview.totalScopeAll')
  const tiles: Tile[] = [
    {
      key: 'email',
      label: t('overview.withEmail'),
      hint: t('overview.withEmailHint'),
      count: counts.withEmail,
      active: channel === 'with_email',
      onClick: () => onChannelChange(channel === 'with_email' ? null : 'with_email'),
    },
    {
      key: 'phone',
      label: t('overview.withPhone'),
      hint: t('overview.withPhoneHint'),
      count: counts.withPhone,
      active: channel === 'with_phone',
      onClick: () => onChannelChange(channel === 'with_phone' ? null : 'with_phone'),
    },
    {
      key: 'unattached',
      label: t('overview.unattached'),
      hint: t('overview.unattachedHint'),
      count: counts.unattached,
      active: unattachedActive,
      onClick: () => onUnattachedChange(!unattachedActive),
    },
  ]
  return (
    // Théo B c1-repertoire `.v13-overview` : la carte du total (dégradé d'accent) et la carte des trois tuiles.
    <section
      aria-label={t('overview.title')}
      data-testid="contacts-network-overview"
      className={cn('grid gap-4 md:grid-cols-[1fr_1.2fr] lg:grid-cols-[1.05fr_1.55fr]', className)}
    >
      <div className="flex min-w-0 items-center gap-5 rounded-overlay border border-[var(--bellum-accent-line)] bg-[var(--bellum-accent-bg)] px-6 py-5 max-md:gap-3 max-md:px-4 max-md:py-3">
        {total !== undefined ? (
          // #4601 — `shrink-0` : le chiffre est un élément flex ; rétréci par le texte voisin, « 5727 » (121 px à 48 px de
          // police) débordait de sa boîte de 93 px et mordait sur l'invite. Il garde sa largeur, la carte absorbe.
          // #4493.4 — un BOUTON (focus clavier, cible ≥ 44 px — GA-35) : le quatrième compteur n'est plus un `div` mort.
          <button
            type="button"
            data-testid="contacts-overview-total"
            aria-pressed={channel === null && !unattachedActive}
            aria-label={`${t('overview.totalAria', { count: total })} ${scopeLabel}`}
            onClick={onTotalSelect}
            className="min-h-11 min-w-16 shrink-0 text-left text-5xl font-bold leading-none tracking-tight tabular-nums text-[var(--bellum-text-primary)] hover:text-[var(--bellum-text-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)] max-md:min-w-10 max-md:text-3xl"
          >
            {total}
          </button>
        ) : null}
        <div className="min-w-0">
          <strong className="mb-1 block text-base text-[var(--bellum-text-primary)] max-md:mb-0 max-md:text-sm">
            {t('overview.title')}
          </strong>
          {total !== undefined ? (
            <Text element="p" size="xs" className="mb-1 text-[var(--bellum-text-muted)]">
              {scopeLabel}
            </Text>
          ) : null}
          <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)] max-md:hidden">
            {t('overview.hint')}
          </Text>
          {/* #4613 — les cinq pastilles d'initiales ne sont plus rendues : « les cinq premières lignes chargées » n'est pas
              une règle qu'on peut nommer en une phrase, et un échantillon sans règle dite se lit comme un classement. */}
        </div>
      </div>
      <div className="flex rounded-overlay border border-[var(--bellum-border)] bg-card px-2 py-5 max-md:py-2.5">
        {tiles.map(tile => (
          <button
            key={tile.key}
            type="button"
            aria-pressed={tile.active}
            onClick={tile.onClick}
            className="group flex min-h-11 min-w-0 flex-1 flex-col justify-center border-r border-[var(--bellum-border)] px-5 text-left last:border-r-0 max-md:px-3"
          >
            <span className="block text-xs text-[var(--bellum-text-secondary)]">{tile.label}</span>
            {tile.count !== undefined ? (
              <strong
                className={cn(
                  'my-1 block text-3xl font-semibold tracking-tight tabular-nums max-md:my-0.5 max-md:text-xl',
                  tile.active
                    ? 'text-[var(--bellum-text-accent)]'
                    : 'text-[var(--bellum-text-primary)] group-hover:text-[var(--bellum-text-accent)]',
                )}
              >
                {tile.count}
              </strong>
            ) : null}
            <small className="block text-xs text-[var(--bellum-text-muted)] max-md:hidden">{tile.hint}</small>
          </button>
        ))}
      </div>
    </section>
  )
}
