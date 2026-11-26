import { resolveSignalSourceLink, type SignalNature } from '@bellum/contracts'
import {
  Badge,
  Button,
  Checkbox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Text,
} from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import {
  Award,
  BadgeCheck,
  CircleHelp,
  ExternalLink,
  FileText,
  History,
  Layers,
  ListPlus,
  MoreHorizontal,
  Newspaper,
  NotebookPen,
  TrendingUp,
  UserPlus,
  type LucideIcon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { CompanyAvatar } from '@/components/ui/CompanyAvatar'
import { formatSignalDate } from '@/lib/signal-date'
import { OfferRequesterLine } from '@/features/discover/view/OfferRequesterLine'
import { OutOfTradeTag } from '@/features/discover/view/OutOfTradeTag'
import { itemNeedKind, offerAttachmentView } from '@/features/watchlist/model/watchlist'
import { sourceKindOf } from '../model/signal-library'
import type { LibraryRow } from '../model/signal-library'

type SignalCardProps = {
  row: LibraryRow
  selected: boolean
  followed: boolean
  onToggleSelect: () => void
  onOpen: () => void
  onSetState: (state: 'saved' | 'discarded' | 'trashed' | null) => void
  onToggleFollow: () => void
  onMakeAction: () => void
  onRefresh: () => void
}

const STATE_LABEL = {
  saved: 'card.stateSaved',
  discarded: 'card.stateDiscarded',
  trashed: 'card.stateTrashed',
} as const

const ITEM_CLASS = 'gap-2 rounded-lg px-2.5 py-2 text-sm min-h-11'

/** L'icône de chaque nature (maquette V22 `.v12-kind-icon`) — une nature, une icône. */
const NATURE_ICON: Record<SignalNature, LucideIcon> = {
  press: Newspaper,
  project: Layers,
  hiring: UserPlus,
  field: NotebookPen,
  history: History,
  need: CircleHelp,
  tender: FileText,
  award: Award,
  nomination: BadgeCheck,
  investment: TrendingUp,
}

/**
 * L'icône de nature reste NEUTRE + accent : la maquette teinte certaines natures (presse, investissement…), mais une
 * nature est une CATÉGORIE et une couleur porte un état, jamais une catégorie (GA-67). L'icône suffit à distinguer.
 */
const NEUTRAL_TONE = 'bg-[var(--bellum-surface-2)] text-[var(--bellum-text-accent)] border-[var(--bellum-border)]'

/**
 * #4505 — UNE CARTE DE LA BIBLIOTHÈQUE, au dessin de la maquette V22 (`.v12-signal`).
 *
 * De haut en bas : la nature (icône + libellé) avec la case et « … » ; le logo et le compte ; le TITRE ; le résumé
 * (trois lignes) ; les mises en garde (« Recrutement salarié ≠ mission ouverte ») et le « Besoin probable » quand il
 * est IDENTIFIÉ ; « En faire une action » ; puis le pied « source · date ». La source est cliquable (site de
 * l'éditeur + ↗, nouvel onglet) et son clic n'ouvre pas la lecture. Pas d'URL vérifiée = pas de lien.
 */
export function SignalCard({
  row,
  selected,
  followed,
  onToggleSelect,
  onOpen,
  onSetState,
  onToggleFollow,
  onMakeAction,
  onRefresh,
}: SignalCardProps) {
  const { t } = useTranslation('signalsLibrary')
  const { t: tWatchlist } = useTranslation('watchlist')
  const { item, nature, state } = row
  const label = item.displayLabel ?? item.signalLabel
  const link = resolveSignalSourceLink({ url: item.sourceUrl, source_kind: item.sourceKind })
  // Lot 772 — la source se nomme par sa NATURE (Presse, Offre d'emploi…), jamais par son domaine.
  const sourceKind = sourceKindOf(item)
  const site = sourceKind ? t(`card.source.${sourceKind}`) : null
  // « Besoin probable » seulement quand un besoin est IDENTIFIÉ : jamais un besoin inventé.
  const needKind = itemNeedKind(item)
  // #4437.5 — l'intitulé libre rattaché (compétence, famille) ou « non rattaché » ; rien de posé = aucune ligne.
  const attachment = offerAttachmentView(item.offerAttachment)
  const NatureIcon = nature ? NATURE_ICON[nature] : null

  return (
    <li
      data-testid="signal-card"
      className={`flex min-w-0 flex-col overflow-hidden rounded-card border bg-[var(--bellum-surface-1)] ${
        selected ? 'border-[var(--bellum-primary)]' : 'border-[var(--bellum-border)]'
      }`}
    >
      <div data-testid="signal-card-head" className="flex min-w-0 items-center justify-between gap-2 px-4 pb-2 pt-3">
        <div className="flex min-w-0 items-center gap-2 text-xs font-semibold text-[var(--bellum-text-secondary)]">
          {NatureIcon && nature ? (
            <>
              <span
                aria-hidden
                className={`grid size-7 shrink-0 place-items-center rounded-control border ${NEUTRAL_TONE}`}
              >
                <NatureIcon className="size-4" />
              </span>
              <span className="truncate">{t(`natures.${nature}`)}</span>
            </>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center">
          <div className="flex size-11 items-center justify-center">
            <Checkbox checked={selected} onCheckedChange={onToggleSelect} aria-label={t('card.select', { label })} />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="min-h-11 min-w-11"
                aria-label={t('card.menu', { label })}
              >
                <MoreHorizontal className="size-4" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {state === 'saved' ? (
                <DropdownMenuItem className={ITEM_CLASS} onSelect={() => onSetState(null)}>
                  {t('actions.unsave')}
                </DropdownMenuItem>
              ) : state === null ? (
                <DropdownMenuItem className={ITEM_CLASS} onSelect={() => onSetState('saved')}>
                  {t('actions.save')}
                </DropdownMenuItem>
              ) : null}
              {state === 'discarded' || state === 'trashed' ? (
                <DropdownMenuItem className={ITEM_CLASS} onSelect={() => onSetState(null)}>
                  {t('actions.restore')}
                </DropdownMenuItem>
              ) : (
                <>
                  <DropdownMenuItem className={ITEM_CLASS} onSelect={() => onSetState('discarded')}>
                    {t('actions.discard')}
                  </DropdownMenuItem>
                  <DropdownMenuItem className={ITEM_CLASS} onSelect={() => onSetState('trashed')}>
                    {t('actions.trash')}
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem className={ITEM_CLASS} onSelect={onRefresh}>
                {t('actions.refresh')}
              </DropdownMenuItem>
              <DropdownMenuItem className={ITEM_CLASS} onSelect={onToggleFollow}>
                {followed ? t('actions.unfollow') : t('actions.follow')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col px-4">
        <div className="mb-2 flex min-w-0 items-center gap-2">
          <CompanyAvatar name={item.companyName} size="sm" logoUrl={item.logoUrl} website={item.website} />
          <Link
            to="/accounts/$id"
            params={{ id: item.accountId }}
            className="inline-flex min-h-11 min-w-0 items-center truncate text-xs text-[var(--bellum-text-secondary)] hover:underline"
          >
            {item.companyName}
          </Link>
          {/* #4403.1 — hors métier : nommé, jamais retiré (la carte descend dans la grille). */}
          {row.outOfTrade ? <OutOfTradeTag testId="signal-card-out-of-trade" /> : null}
          {state ? <Badge variant="secondary">{t(STATE_LABEL[state])}</Badge> : null}
          {followed ? <Badge variant="outline">{t('card.followingBadge')}</Badge> : null}
        </div>
        <h2 className="text-lg font-semibold leading-snug text-[var(--bellum-text-primary)]">
          <button
            type="button"
            onClick={onOpen}
            aria-label={t('card.openDetail', { label })}
            className="min-h-11 w-full rounded-sm text-left hover:underline"
          >
            {label}
          </button>
        </h2>
        {item.salesImplication ? (
          <Text size="sm" className="mt-1 line-clamp-3 text-[var(--bellum-text-secondary)]">
            {item.salesImplication}
          </Text>
        ) : null}
        {nature === 'hiring' ? (
          <Text size="xs" className="mt-2 text-[var(--warning-soft-text)]">
            {t('card.interpretHiring')}
          </Text>
        ) : null}
        {needKind ? (
          <Text size="sm" className="mt-2 text-[var(--bellum-text-secondary)]">
            <span className="mr-1 font-semibold text-[var(--bellum-text-primary)]">{t('card.probableNeed')}</span>
            {tWatchlist(`need.${needKind}`)}
          </Text>
        ) : null}
        {attachment ? (
          <Text size="xs" data-testid="offer-attachment" className="mt-2 text-[var(--bellum-text-secondary)]">
            {attachment.unclassified
              ? t('card.attachmentUnattached')
              : t('card.attachment', {
                  parts: [
                    ...attachment.skills,
                    attachment.family ? t(`discover:rail.jobFamily.${attachment.family}`) : null,
                  ]
                    .filter(Boolean)
                    .join(' · '),
                })}
          </Text>
        ) : null}
        {/* #4286.11 / #4286.12 (Louis 23/10) — une offre dit qui la demande : « Demandeur probable » quand son
            texte l'établit, « à identifier » (avec sa méthode) sinon. Pas de demandeur composé = pas de ligne. */}
        {item.requester ? (
          <div className="mt-2 text-xs text-[var(--bellum-text-secondary)]">
            <OfferRequesterLine requester={item.requester} />
          </div>
        ) : null}
        <div className="mt-auto pt-2">
          <Button type="button" variant="ghost" className="min-h-11 gap-1 px-2" onClick={onMakeAction}>
            <ListPlus className="size-4" aria-hidden />
            {t('actions.makeAction')}
          </Button>
        </div>
      </div>

      <footer
        data-testid="signal-card-footer"
        className="flex min-w-0 items-center justify-between gap-2 border-t border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] px-4 text-xs text-[var(--bellum-text-muted)]"
      >
        {link.kind !== 'none' && site ? (
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t('card.openSource', { site })}
            onClick={event => event.stopPropagation()}
            className="inline-flex min-h-11 min-w-11 max-w-[70%] items-center gap-1 text-[var(--bellum-text-accent)] underline underline-offset-2"
          >
            <span className="truncate">{site}</span>
            <ExternalLink className="size-3 shrink-0" aria-hidden />
          </a>
        ) : (
          <span className="min-h-11" />
        )}
        <span className="inline-flex min-h-11 items-center tabular-nums">{formatSignalDate(item.signalDate)}</span>
      </footer>
    </li>
  )
}
