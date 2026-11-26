import {
  Briefcase,
  Building2,
  Check,
  ChevronRight,
  Globe,
  MapPin,
  RefreshCw,
  TrendingUp,
  User,
  Users,
} from 'lucide-react'
import { cn, Text } from '@bellum/ui'
import type { ChoiceIconKey } from '@/features/onboarding/lib/questions'

/**
 * #2087.9 — registre FERMÉ clé → icône : `ChoiceRow` reste la seule à savoir
 * quel composant chaque `iconKey` dessine (GA-26, un seul endroit). Le type
 * `Record<ChoiceIconKey, …>` force l'exhaustivité : une clé ajoutée à
 * `CHOICE_ICON_KEYS` (`lib/questions/types.ts`) sans son composant ici ne
 * compile pas. `trending-up`/`refresh` ont rejoint le registre avec la
 * réparation du 18/09 (`maturite.ts`).
 */
const CHOICE_ICONS: Record<ChoiceIconKey, typeof Building2> = {
  building: Building2,
  users: Users,
  'map-pin': MapPin,
  briefcase: Briefcase,
  globe: Globe,
  user: User,
  'trending-up': TrendingUp,
  refresh: RefreshCw,
}

type ChoiceRowProps = {
  label: string
  selected: boolean
  disabled?: boolean
  onClick: () => void
  /**
   * #2088.2 / #2088.27 — `list` (défaut) reste la ligne pleine largeur SANS
   * bordure propre, pensée pour vivre dans un {@link ChoiceList} (les
   * dividers du conteneur séparent les lignes). `card` est une carte
   * AUTONOME — bordure entière, coins arrondis — pensée pour un choix `single`
   * COURT rendu en grille : une carte isolée ne peut pas compter sur un
   * conteneur partagé pour se délimiter.
   */
  layout?: 'list' | 'card'
  /**
   * #2088.3 — texte secondaire, sous le libellé, pour un choix LONG rendu en
   * liste recherchable. Déjà TRADUIT par l'appelant (`ChoiceRow` ne connaît
   * pas `Question`/`Choice`, seulement des chaînes affichables).
   */
  description?: string
  /** #2087.9 — phrase d'exemple, pour une carte `layout="card"`. Idem : déjà traduite. */
  example?: string
  /** #2087.9 — icône décorative, carte seulement. */
  iconKey?: ChoiceIconKey
}

/**
 * A single choice control: full-width row inside a {@link ChoiceList}
 * (`layout="list"`), or a standalone card in a grid (`layout="card"`).
 *
 * #2088.27 — « état sélectionné très évident : fond + bord + coche +
 * contraste ». Avant, la sélection ne tenait qu'à un fond partagé avec le
 * hover et à la couleur du chevron — rien qui survive au daltonisme ou à un
 * écran mal calibré (GA-67 : une couleur porte un état, mais un état qui NE
 * TIENT QUE sur une couleur échoue). La coche est l'indice non coloré ; le
 * trio `--accent-soft-bg/-border/-text` (déjà mesuré AA dans les deux thèmes,
 * `contrast.test.ts`) porte le fond, la bordure ET le texte — jamais une
 * nuance fixe de la gamme primaire (D79).
 */
export function ChoiceRow({
  label,
  selected,
  disabled,
  onClick,
  layout = 'list',
  description,
  example,
  iconKey,
}: ChoiceRowProps) {
  const Icon = iconKey ? CHOICE_ICONS[iconKey] : null
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        'flex items-center justify-between gap-3 text-left text-sm transition-colors',
        layout === 'list' && 'w-full px-4 py-3.5',
        layout === 'card' && 'rounded-lg border p-4 pointer-coarse:min-h-11',
        selected
          ? layout === 'card'
            ? 'border-[var(--accent-soft-border)] bg-[var(--accent-soft-bg)] text-[var(--accent-soft-text)]'
            : 'border-transparent bg-[var(--bellum-surface-2)] text-[var(--bellum-text-primary)]'
          : layout === 'card'
            ? 'border-[var(--bellum-border)] bg-transparent text-[var(--bellum-text-primary)] hover:bg-[var(--bellum-bg-lighter)]'
            : 'border-transparent bg-transparent text-[var(--bellum-text-primary)] hover:bg-[var(--bellum-bg-lighter)]',
        disabled && 'cursor-not-allowed opacity-40 hover:bg-transparent hover:text-[var(--bellum-text-primary)]',
      )}
    >
      <span className="flex min-w-0 items-start gap-2.5">
        {/* #2087.9 — icône décorative : la carte reste identifiable au NOM
            (label) sans elle, jamais le seul porteur de sens. */}
        {Icon && <Icon className="mt-0.5 h-4 w-4 shrink-0 opacity-80" aria-hidden="true" />}
        <span className="flex flex-col items-start gap-0.5">
          <span>{label}</span>
          {/* #2088.3 — description du choix LONG, sous le libellé. */}
          {description && (
            <Text element="span" size="xs" className="text-[var(--bellum-text-secondary)]">
              {description}
            </Text>
          )}
          {/* #2087.9 — exemple de la carte, sous le libellé. */}
          {example && (
            <Text element="span" size="xs" className="text-[var(--bellum-text-secondary)]">
              {example}
            </Text>
          )}
        </span>
      </span>
      {layout === 'card' ? (
        selected && (
          <Check
            data-testid="choice-row-check"
            className="h-4 w-4 shrink-0 text-[var(--accent-soft-text)]"
            aria-hidden="true"
          />
        )
      ) : (
        <span className="flex h-4 w-4 shrink-0 items-center justify-center">
          {selected ? (
            <Check
              data-testid="choice-row-check"
              className="h-4 w-4 text-[var(--bellum-text-accent)]"
              aria-hidden="true"
            />
          ) : (
            // #2021.3 — le chevron d'une ligne SÉLECTIONNÉE était écrit en
            // `--bellum-primary-500`, une nuance fixe qui tombe à 2,68:1 en
            // thème sombre : sous le seuil de 3:1 d'un élément graphique
            // porteur de sens (GA-33). Au repos il reste discret.
            <ChevronRight className="h-4 w-4 text-[var(--bellum-text-muted)]" aria-hidden="true" />
          )}
        </span>
      )}
    </button>
  )
}
