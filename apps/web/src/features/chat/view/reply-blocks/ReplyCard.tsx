import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ExternalLink, type LucideIcon } from 'lucide-react'
import type { ReplyBlock } from '@bellum/contracts'
import { Badge, Text } from '@bellum/ui'
import { appRouteTarget } from '@/components/navigation/known-routes'
import { appLocale } from '@/lib/locale'
import { InternalLink, renderInlineMarkdown } from '../markdown'
import { ReplyInsightCard } from '../reply-kit'

/**
 * #1914 — LES PIÈCES COMMUNES DES CARTES DE RÉPONSE.
 *
 * Une carte montre un résultat « sans devenir un tableau de bord dans le chat » :
 * un cadre, un titre, des lignes lisibles — et les quatre règles que chaque carte
 * applique au même endroit plutôt que huit fois :
 *
 *  - #1914.11 LA LARGEUR DE LECTURE : le texte passe par `Text`, qui porte la
 *    borne des 70 caractères (D81). Une comparaison, elle, est un tableau : pleine
 *    largeur, et elle défile dans SON conteneur (`Table`).
 *  - #1914.12 TOP 3 PUIS « VOIR LES AUTRES » : `TopThenRest`, un `<button>` qui se
 *    tabule, s'annonce déplié ou non, et fait 44 px au doigt (GA-30).
 *  - #1914.13 CE QUI N'EXISTE PAS NE S'AFFICHE PAS : un logo seulement depuis le
 *    site que la carte porte (servi par notre origine, repli sur l'initiale) ;
 *    une PERSONNE n'a jamais d'image, seulement ses initiales ; un badge de
 *    source seulement quand la source est écrite.
 *  - UN LIEN MÈNE À UN ÉCRAN QUI EXISTE : `appRouteTarget` (GA-277), comme le
 *    moteur markdown — une route inventée reste un libellé lisible.
 */

export type BlockOf<T extends ReplyBlock['type']> = Extract<ReplyBlock, { type: T }>

const TOP_COUNT = 3

export function ReplyCard({
  type,
  title,
  icon: Icon,
  children,
}: {
  type: ReplyBlock['type']
  title: string
  icon: LucideIcon
  children: ReactNode
}) {
  // #3761 — le cadre d'une carte de bloc est la carte d'insight de la
  // bibliothèque de réponses (`reply-kit`) : un seul style de carte.
  return (
    <ReplyInsightCard title={title} icon={Icon} blockType={type}>
      {children}
    </ReplyInsightCard>
  )
}

/** #4610.4 — un lien de ligne tenu au doigt : cible ≥ 44 px sur pointeur grossier (GA-35), même teinte que le lien courant. */
const TOUCH_LINK_CLASS =
  'inline-flex items-center text-[var(--bellum-text-accent)] underline underline-offset-2 pointer-coarse:min-h-11'

export function CardLink({
  href,
  children,
  touchTarget = false,
}: {
  href?: string | null
  children: ReactNode
  touchTarget?: boolean
}) {
  const target = href ? appRouteTarget(href) : null
  if (!target) {
    // #2594 — SANS `href` structuré, le lien voyage parfois DANS la phrase
    // (`missing_data.how` : « … depuis [Contacts](/contacts) »). Le même
    // moteur qui rend le corps d'un message le repère ici, au lieu de
    // laisser passer les crochets et l'URL tels quels.
    return <>{typeof children === 'string' ? renderInlineMarkdown(children) : children}</>
  }
  return <InternalLink to={target} label={children} className={touchTarget ? TOUCH_LINK_CLASS : undefined} />
}

/** Un nom en tête de ligne — cliquable seulement vers un écran réel. */
export function ItemName({
  name,
  href,
  touchTarget = false,
}: {
  name: string
  href?: string | null
  touchTarget?: boolean
}) {
  return (
    <span className="text-sm font-semibold text-[var(--bellum-text-primary)]">
      <CardLink href={href} touchTarget={touchTarget}>
        {name}
      </CardLink>
    </span>
  )
}

export function TopThenRest<T>({
  items,
  renderItem,
  columns = false,
  announceCount = false,
}: {
  items: readonly T[]
  renderItem: (item: T, index: number) => ReactNode
  /** Les éléments sont des CARTES : deux colonnes dès qu'il y a la place (réponse de Laura, refonte Théo). */
  columns?: boolean
  /** #4748 — replié, la liste DIT combien de lignes elle porte (« 3 sur 20 affichés ») : jamais 3 lignes sans le total. */
  announceCount?: boolean
}) {
  const { t } = useTranslation('chat')
  const [open, setOpen] = useState(false)
  const hidden = items.length - TOP_COUNT
  const shown = open || hidden <= 0 ? items : items.slice(0, TOP_COUNT)
  return (
    <div className="space-y-2">
      <ol className={columns ? 'grid gap-3 md:grid-cols-2' : 'space-y-3'}>
        {shown.map((item, index) => (
          <li key={`item-${index}`} className="w-full">
            {renderItem(item, index)}
          </li>
        ))}
      </ol>
      {announceCount && hidden > 0 && !open ? (
        <Text size="xs" color="text-[var(--bellum-text-muted)]">
          {t('blocks.shownOfTotal', { shown: TOP_COUNT, total: items.length })}
        </Text>
      ) : null}
      {hidden > 0 ? (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(value => !value)}
          className="text-sm font-medium text-[var(--bellum-text-accent)] underline-offset-2 hover:underline pointer-coarse:min-h-11"
        >
          {open ? t('blocks.showLess') : t('blocks.showMore', { count: hidden })}
        </button>
      ) : null}
    </div>
  )
}

/**
 * Une liste nommée — rendue seulement quand elle porte au moins une ligne.
 *
 * #2594 — chaque ligne est une phrase que Laura a rédigée (raisons, limites,
 * points à aborder…) : le même moteur inline qui rend le corps d'un message
 * rend chaque puce, au lieu de l'interpoler brute.
 */
export function LabeledLines({ label, lines }: { label: string; lines?: readonly string[] | null }) {
  if (!lines?.length) return null
  return (
    <div>
      <Text size="xs" weight="semibold" color="text-[var(--bellum-text-primary)]">
        {label}
      </Text>
      <ul className="mt-0.5 space-y-0.5">
        {lines.map((line, index) => (
          <li key={`line-${index}`} className="flex gap-1.5 text-sm text-[var(--bellum-text-secondary)]">
            <span aria-hidden className="text-[var(--bellum-text-accent)]">
              •
            </span>
            <span>{renderInlineMarkdown(line)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** « Libellé : contenu » sur une ligne. `children` porte déjà du JSX rendu par
 *  l'appelant (texte simple, `CardLink`, ou `renderInlineMarkdown` pour une
 *  phrase de Laura — #2594) : ce composant ne décide pas de la nature du champ. */
export function InlineLabel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Text size="sm" color="text-[var(--bellum-text-secondary)]">
      <span className="font-medium text-[var(--bellum-text-primary)]">{label}</span> {children}
    </Text>
  )
}

/** Ce qui n'a pas pu être évalué, NOMMÉ — un classement n'est jamais nu. */
export function NotEvaluated({ items }: { items?: readonly string[] | null }) {
  const { t } = useTranslation('chat')
  if (!items?.length) return null
  return (
    <Text size="xs" color="text-[var(--bellum-text-muted)]">
      {t('blocks.notEvaluated')} {items.join(' · ')}
    </Text>
  )
}

export function SourceBadge({
  source,
}: {
  source?: { label: string; as_of?: string; basis?: 'proof' | 'interpretation' | 'history'; url?: string } | null
}) {
  const { t } = useTranslation('chat')
  if (!source) return null
  const date = source.as_of ? formatAsOf(source.as_of) : null
  // #3776.5 — le FONDEMENT de la citation, jamais deviné : absent sur une
  // source non qualifiée (le prompt ne le remplit pas encore partout), donc
  // rien de plus qu'avant ce point — une absence ne fait aucune ligne.
  const basis = source.basis ? t(`blocks.basis.${source.basis}`) : null
  // Théo B l1-laura — le LIEN vers la page de l'éditeur, VISIBLE sur la carte (Louis 22/10) : nouvel onglet,
  // cible ≥ 44 px, nom accessible. Seul un lien https passe (le contrat le refuse déjà ; cette lecture le redit) ;
  // pas d'URL = pas de lien, jamais un lien deviné.
  const url = source.url && /^https:\/\//i.test(source.url) ? source.url : null
  return (
    <span className="inline-flex max-w-full flex-wrap items-center gap-1">
      <Badge variant="outline" className="max-w-full overflow-hidden">
        {t('blocks.source')} {renderInlineMarkdown(source.label)}
        {date ? ` · ${date}` : ''}
        {basis ? ` · ${basis}` : ''}
      </Badge>
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t('blocks.openSource', { site: source.label })}
          className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1 text-xs text-[var(--bellum-text-accent)] underline underline-offset-2"
        >
          <ExternalLink className="size-3 shrink-0" aria-hidden />
        </a>
      ) : null}
    </span>
  )
}

/**
 * « 2026 », « juin 2026 » ou « 3 juillet 2026 » — la précision que la source
 * donne, pas plus.
 *
 * #2271.16 (recette écran 18/09/2026) — la locale passe par `appLocale()`
 * (`@/lib/locale`, GA-26), jamais par `i18n.language` en clair : ce dernier
 * vaut `'fr'`/`'en'` selon le runtime, quand l'app a délibérément choisi
 * `fr-FR`/`en-GB` (le couple qui distingue le produit d'un `en-US` vendu à une
 * clientèle européenne — voir l'en-tête de `lib/locale.ts`).
 */
export function formatAsOf(asOf: string): string {
  const [year, month, day] = asOf.split('-').map(Number)
  if (!year) return asOf
  if (!month) return String(year)
  const date = new Date(Date.UTC(year, month - 1, day || 1))
  return date.toLocaleDateString(appLocale(), {
    ...(day ? { day: 'numeric' } : {}),
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}
