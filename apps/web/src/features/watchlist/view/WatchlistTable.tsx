import { OutOfTradeTag } from '@/features/discover/view/OutOfTradeTag'
import { OfferRequesterLine } from '@/features/discover/view/OfferRequesterLine'
import { OfferAttachmentLine } from './OfferAttachmentLine'
import { PAGE_GUTTER_X } from '@/components/page/page-gutter'
import type { WatchlistRule } from '@bellum/contracts'
import {
  Badge,
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
  cn,
} from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { Activity, CalendarDays, ChevronDown, ChevronRight, Eye, Zap } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  buildAccountRankLine,
  buildWhyLine,
  buildNextActionLabel,
  reconcileRecurrence,
  signalCountsOf,
  type WatchlistAccountGroup,
  type WatchlistItem,
} from '../model/watchlist'
import { useCreateSignalAction } from '../actions/useSignalAction'
import { CompanyAvatar } from '@/components/ui/CompanyAvatar'
import { formatSignalDate } from '@/lib/signal-date'
import { readableSource } from '@/lib/source-label'
import { SignalSourceLink } from '@/components/primitives/SignalSourceLink'
import { signalSourceLabel } from '@/lib/data-source-label'
import { compactSector } from '@bellum/utils'
import type { SignalRecurrence } from '@bellum/contracts'
import { useSignalRecurrences } from '@/features/account-facts/useSignalRecurrences'
import { AskLaura } from '@/components/primitives/AskLaura'
import { useAccountFollows, useToggleAccountFollow } from '@/features/account-follows/api'

/* Refonte Théo (maquette validée `decouvrir/mes-cibles.html`, « LE tableau, un seul composant ») :
   tableau bordé, en-tête sur fond creux, une ligne séparée de la suivante par un filet. */
const ROW_CELL =
  'border-b border-[var(--bellum-border)] px-3 group-last:border-b-0 transition-colors group-hover:bg-[var(--bellum-surface-2)] group-data-[state=selected]:bg-[color-mix(in_srgb,var(--bellum-text-primary)_7%,transparent)]'
const HEAD_CELL =
  'h-9 border-b border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] px-3 text-xs font-semibold text-[var(--bellum-text-muted)]'
const HOVER_OPEN_DELAY = 500
const HOVER_CLOSE_DELAY = 140

/**
 * #4088 — « CE QUI BOUGE SUR TES COMPTES » : UNE LIGNE = UN COMPTE.
 *
 * Cinq colonnes, dans l'ordre où un commercial lit : le compte (et la RAISON de son
 * rang, #4088.3) · ce qui bouge (le signal le plus fort, sa date, sa source, « +N
 * autres », #4088.2) · pourquoi ça compte (une phrase dérivée du TYPE, #4088.2) · qui
 * ça concerne (le décideur de tête, nom et poste en clair, #4088.2) · la prochaine
 * action (un verbe et une personne, #4088.4). Le badge de score nu a disparu : un
 * score n'est jamais nu, la ligne dit POURQUOI le compte est là.
 *
 * Sous 1024 px, les trois colonnes de droite passent SOUS le signal (`lg:hidden`) :
 * le mobile est le produit, rien n'y est masqué.
 */
export function WatchlistTable({
  groups,
  onSelect,
  rules = [],
  selectedAccountId,
}: {
  // Théo p.35 : une ligne par COMPTE, pas par signal.
  groups: WatchlistAccountGroup[]
  onSelect: (item: WatchlistItem) => void
  /** Les règles de veille du commercial — pour la raison « correspond à ta règle ». */
  rules?: WatchlistRule[]
  selectedAccountId?: string
}) {
  // #4072.4 — UNE requête pour toutes les cibles de la table (lecteur par lot).
  const recurrences = useSignalRecurrences(groups.map(group => group.accountId))
  const follows = useAccountFollows()
  const followedIds = new Set((follows.data?.followed ?? []).map(account => account.account_id))
  if (groups.length === 0) return <WatchlistEmpty />

  return (
    <div className="overflow-hidden rounded-card border border-[var(--bellum-border)] bg-card">
      <Table className="w-full table-fixed border-collapse" data-testid="watchlist-table">
        <WatchlistTableHeader />
        <TableBody>
          {groups.map(group => (
            <WatchlistRow
              key={group.accountId}
              group={group}
              rules={rules}
              recurrence={recurrences[group.accountId]}
              followed={followedIds.has(group.accountId)}
              selected={selectedAccountId === group.accountId}
              onSelect={onSelect}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function WatchlistTableHeader() {
  const { t } = useTranslation('watchlist')
  return (
    <TableHeader>
      <TableRow className="border-transparent hover:bg-transparent">
        {/* Refonte Théo — la Date en tête, comme dans Découvrir : même composant, même lecture. Le
            tableau reste rangé par signal le plus fort : la date se lit, elle ne trie pas. */}
        <TableHead className={cn(HEAD_CELL, 'hidden w-24 md:table-cell')}>{t('table.headers.date')}</TableHead>
        <TableHead className={cn(HEAD_CELL, 'w-[42%] md:w-[220px] lg:w-[18%]')}>{t('table.headers.account')}</TableHead>
        {/* #4403.2 — « Ce qui bouge » est la colonne principale : dès lg, les autres en pourcentage lui laissent la place. */}
        <TableHead className={cn(HEAD_CELL, 'w-auto')}>{t('table.headers.whatMoves')}</TableHead>
        <TableHead className={cn(HEAD_CELL, 'hidden w-[210px] lg:table-cell lg:w-[22%]')}>
          {t('table.headers.whyItMatters')}
        </TableHead>
        {/* « Qui ça concerne » rejoint « Prochaine action » (maquette validée) : l'action nomme la personne. */}
        <TableHead className={cn(HEAD_CELL, 'hidden w-[240px] lg:table-cell lg:w-[22%]')}>
          {t('table.headers.nextAction')}
        </TableHead>
      </TableRow>
    </TableHeader>
  )
}

function WatchlistRow({
  group,
  onSelect,
  rules,
  recurrence: recurrenceRaw,
  followed,
  selected,
}: {
  group: WatchlistAccountGroup
  onSelect: (item: WatchlistItem) => void
  rules: WatchlistRule[]
  recurrence?: SignalRecurrence
  followed: boolean
  selected: boolean
}) {
  const { latest } = group
  // #4072 — le rang de récurrence, « +N autres » et « N signaux ce mois-ci » lisent la MÊME liste (celle que la ligne
  // déplie) : un rang que cette liste ne retrouve pas (« 29e signal » au-dessus d'UN signal) ne s'affiche pas.
  const recurrence = reconcileRecurrence(recurrenceRaw, group)
  return (
    <TableRow
      data-state={selected ? 'selected' : undefined}
      onClick={() => onSelect(latest)}
      className="group cursor-pointer border-transparent"
    >
      <TableCell className={`${ROW_CELL} hidden w-24 py-3 align-top md:table-cell`}>
        <Text size="sm" noWrap className="tabular-nums text-[var(--bellum-text-secondary)]">
          {formatSignalDate(latest.signalDate)}
        </Text>
      </TableCell>
      <TableCell className={`${ROW_CELL} w-[42%] py-3 align-top md:w-[220px] lg:w-[18%]`}>
        <AccountCell group={group} rules={rules} followed={followed} />
      </TableCell>
      <TableCell className={`${ROW_CELL} w-auto max-w-none py-3 align-top`}>
        <SignalCell group={group} onSelect={onSelect} />
        {/* Sous 1024 px, les deux colonnes de droite empilées sous le signal. */}
        <div className="mt-3 flex flex-col gap-2 lg:hidden">
          <NeedLine item={latest} recurrence={recurrence} />
          <NextActionCell group={group} onSelect={onSelect} />
        </div>
      </TableCell>
      <TableCell className={`${ROW_CELL} hidden w-[210px] py-3 align-top lg:table-cell lg:w-[22%]`}>
        <NeedLine item={latest} recurrence={recurrence} />
      </TableCell>
      <TableCell className={`${ROW_CELL} hidden w-[240px] py-3 align-top lg:table-cell lg:w-[22%]`}>
        <NextActionCell group={group} onSelect={onSelect} />
      </TableCell>
    </TableRow>
  )
}

/** Le compte : son NOM est le lien vers la fiche (#4088.4), puis la raison de son rang (#4088.3). */
function AccountCell({
  group,
  rules,
  followed,
}: {
  group: WatchlistAccountGroup
  rules: WatchlistRule[]
  followed: boolean
}) {
  const { t } = useTranslation('watchlist')
  const item = group.latest
  // #4088.7 — un compte écarté dit POURQUOI il l'est, à la place d'une raison de rang.
  const reasons = group.discardReason ? [t(`discard.${group.discardReason}`)] : buildAccountRankLine(group, rules)
  return (
    <div className="flex min-w-0 items-start gap-3">
      {/* #1423 — l'avatar était monté À VIDE : il rendait donc l'initiale même
          quand le logo existait en base. */}
      <CompanyAvatar name={item.companyName} size="sm" logoUrl={item.logoUrl} website={item.website} />
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-1">
          <Link
            to="/accounts/$id"
            params={{ id: item.accountId }}
            aria-label={t('table.openAccount', { company: item.companyName })}
            onClick={event => event.stopPropagation()}
            // #4088.7bis — le NOM ne se tronque jamais (« BOUYGUES CONSTR… ») : il passe à la ligne.
            className="block min-h-6 min-w-0 break-words text-sm font-semibold text-[var(--bellum-text-primary)] hover:underline"
          >
            {item.companyName}
          </Link>
          {followed ? <FollowedEye accountId={item.accountId} companyName={item.companyName} /> : null}
        </div>
        {/* Le statut du fait, en pastille teintée : la couleur dit l'état (Nouveau · À qualifier). */}
        <Badge variant={group.status === 'new' ? 'success' : 'warning'} className="mt-1">
          {group.status === 'new' ? t('status.new') : t('status.toQualify')}
        </Badge>
        {/* #1315.3 — secteur lisible, texte d'enrichissement en infobulle. */}
        <Text
          size="xs"
          noWrap
          title={item.sector ?? undefined}
          className="mt-0.5 block truncate text-[var(--bellum-text-secondary)]"
        >
          {compactSector(item.sector)}
        </Text>
        {reasons.length > 0 ? (
          <Text size="xs" className="mt-1 block text-[var(--bellum-text-secondary)]">
            {reasons.join(' · ')}
          </Text>
        ) : null}
        {/* #4284.10 — une offre hors métier est rangée plus bas et se DIT, elle n'est pas écartée. */}
        {group.outOfTrade ? (
          <div className="mt-1">
            <OutOfTradeTag testId="watchlist-out-of-trade" />
          </div>
        ) : null}
      </div>
    </div>
  )
}

/** #4088.2 / #4088.12 — « pourquoi ça compte » : le besoin établi, sinon pourquoi la ligne est là (jamais vide). */
function NeedLine({ item, recurrence }: { item: WatchlistItem; recurrence?: SignalRecurrence }) {
  const { t } = useTranslation('watchlist')
  return (
    <>
      <Text size="sm" className="block break-words text-[var(--bellum-text-primary)]">
        {buildWhyLine(item)}
      </Text>
      {/* #4072.4 — « 3e signal de recrutement en 30 jours » ; une absence ne fait aucune ligne. */}
      {recurrence ? (
        <Text size="xs" className="mt-0.5 block break-words text-[var(--bellum-text-secondary)]">
          {t(`table.recurrence.${recurrence.kind}`, { count: recurrence.count, days: recurrence.windowDays })}
        </Text>
      ) : null}
    </>
  )
}

/** #4088.2 — « qui ça concerne » : nom et poste EN CLAIR ; sans contact connu, rien. */
/**
 * « Prochaine action » (maquette validée) : QUI d'abord — le décideur de tête, badge « Décideur » —
 * puis le geste, puis « Message préparé » : Laura ouvre le message déjà rédigé pour cette personne
 * et ce fait, éditable, sans quitter la page. Décision du 12/10 : quoi bouge · pourquoi · QUI.
 */
function NextActionCell({
  group,
  onSelect,
}: {
  group: WatchlistAccountGroup
  onSelect: (item: WatchlistItem) => void
}) {
  const { t } = useTranslation('watchlist')
  const person = group.decisionMaker
  const fact = group.latest.displayLabel ?? group.latest.signalLabel
  return (
    <div className="flex min-w-0 flex-col items-start gap-2">
      <DecisionMaker group={group} />
      <NextActionButton group={group} onSelect={onSelect} />
      <AskLaura
        alwaysVisible
        accountId={group.accountId}
        label={t('table.preparedMessage')}
        question={
          person
            ? t('table.preparedMessageQuestionPerson', { name: person.name, company: group.companyName, fact })
            : t('table.preparedMessageQuestion', { company: group.companyName, fact })
        }
      />
    </div>
  )
}

function DecisionMaker({ group }: { group: WatchlistAccountGroup }) {
  const { t } = useTranslation('watchlist')
  const person = group.decisionMaker
  if (!person) return null
  return (
    <div className="min-w-0" data-testid="watchlist-who">
      <span className="flex flex-wrap items-center gap-1.5">
        <Text size="sm" weight="semibold" className="block text-[var(--bellum-text-primary)]">
          {person.name}
        </Text>
        <Badge variant="primary">{t('table.decisionMakerBadge')}</Badge>
      </span>
      {person.title ? (
        <Text size="xs" className="block text-[var(--bellum-text-secondary)]">
          {person.title}
        </Text>
      ) : null}
    </div>
  )
}

/**
 * #4088.4 — la prochaine action : un verbe + une personne. Le geste réutilise
 * `useCreateSignalAction` (« En faire une action » du détail) : il ÉCRIT une action
 * dans le plan du compte, il n'envoie rien (le copilote prépare, le commercial envoie).
 * Une action déjà créée pour ce signal ouvre son détail plutôt que d'en créer une seconde.
 */
function NextActionButton({
  group,
  onSelect,
}: {
  group: WatchlistAccountGroup
  onSelect: (item: WatchlistItem) => void
}) {
  const createAction = useCreateSignalAction()
  const { latest } = group
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={createAction.isPending}
      onClick={event => {
        event.stopPropagation()
        if (latest.triggeredActionLabel) onSelect(latest)
        else createAction.mutate({ accountId: latest.accountId, label: latest.signalLabel })
      }}
      className="min-h-11 max-w-full justify-start whitespace-normal text-left text-xs font-medium"
    >
      {/* Le bouton d'action ne se coupe pas (« Appeler Arnau… ») : retour à la ligne. */}
      <span className="min-w-0 break-words">{buildNextActionLabel(group)}</span>
      <ChevronRight className="ml-1 size-3.5 shrink-0" aria-hidden />
    </Button>
  )
}

function SignalCell({ group, onSelect }: { group: WatchlistAccountGroup; onSelect: (item: WatchlistItem) => void }) {
  const { t } = useTranslation('watchlist')
  const [expanded, setExpanded] = useState(false)
  // #4088.2 — « +N autres » : les autres signaux du compte, dépliables.
  const extra = signalCountsOf(group).others
  return (
    <div className="min-w-0">
      <SignalLine item={group.latest} withPreview />
      {extra > 0 ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-expanded={expanded}
          onClick={event => {
            event.stopPropagation()
            setExpanded(value => !value)
          }}
          className="mt-1 min-h-11 gap-1 px-1.5 text-xs text-[var(--bellum-text-secondary)]"
        >
          <Zap className="size-2.5 text-[var(--warning-soft-text)]" aria-hidden />
          {t('table.moreSignals', { count: extra })}
          <ChevronDown className={cn('size-3 transition-transform', expanded && 'rotate-180')} aria-hidden />
          <span className="sr-only">{expanded ? t('table.othersHide') : t('table.othersShow')}</span>
        </Button>
      ) : null}
      {expanded ? (
        <ul className="mt-1 space-y-2 border-l border-[var(--bellum-border)] pl-3">
          {group.others.map(other => (
            <li key={other.id}>
              {/* #4182.5 — le clic sur un sous-signal ouvre le détail DE CE signal, pas celui du primaire. */}
              <SignalLine item={other} onOpen={onSelect} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

/** Un signal : son titre, sa date, sa source et le lien vérifiable (#3922). */
function SignalLine({
  item,
  withPreview = false,
  onOpen,
}: {
  item: WatchlistItem
  withPreview?: boolean
  onOpen?: (item: WatchlistItem) => void
}) {
  const { t } = useTranslation('watchlist')
  // C'est CETTE ligne que le commercial lit dans la liste : elle passe donc par
  // le même filtre que le badge de l'aperçu. Un jeton de citation seul
  // (« [PR3] ») ne laisse rien de lisible — on n'affiche alors pas de ligne.
  // #1912.11 — `readableSource` retire les jetons du modèle, il ne rédige pas un
  // fournisseur : la CAPACITÉ quand la source en nomme un, le texte sinon.
  const source = signalSourceLabel(t, readableSource(item.signalSource, item.sourceUrl))
  return (
    <div className="min-w-0">
      {withPreview ? (
        <SignalPreview item={item} />
      ) : onOpen ? (
        <button
          type="button"
          onClick={event => {
            event.stopPropagation()
            onOpen(item)
          }}
          className="block min-h-11 w-full rounded-sm py-1 text-left text-sm font-medium text-[var(--bellum-text-primary)] hover:underline"
        >
          {item.displayLabel ?? item.signalLabel}
        </button>
      ) : (
        <Text size="sm" weight="medium" className="block text-[var(--bellum-text-primary)]">
          {item.displayLabel ?? item.signalLabel}
        </Text>
      )}
      <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[var(--bellum-text-secondary)]">
        {/* La date du fait principal vit dans la colonne Date dès 768 px : ici, seulement sur téléphone. */}
        <span className={cn('inline-flex items-center gap-1', withPreview && 'md:hidden')}>
          <CalendarDays className="size-3.5 shrink-0" aria-hidden />
          <Text size="xs" noWrap className="tabular-nums">
            {formatSignalDate(item.signalDate)}
          </Text>
        </span>
        {item.archived ? (
          // Un signal de plus de ~24 mois est une archive, pas un déclencheur vivant (Théo p.7).
          <Badge variant="default" className="w-fit">
            {t('table.archived')}
          </Badge>
        ) : null}
        {source ? (
          <Text size="xs" noWrap title={source} className="block truncate">
            {source}
          </Text>
        ) : null}
        {/* #3922.3 — la preuve cliquable dès la ligne : « j'ai vu que… » se dit au téléphone. */}
        <SignalSourceLink
          url={item.sourceUrl}
          sourceKind={item.sourceKind}
          collectedBeforeLink={item.collectedBeforeLink}
        />
      </div>
      {/* #4437.5 — type · compétence · famille de l'offre ; rien quand l'intitulé n'est pas rattachable. */}
      <OfferAttachmentLine attachment={item.offerAttachment} />
      {/* G.8 (#4182.5) — un sous-signal n'a pas d'aperçu : sa ligne nomme le demandeur, mais SEULEMENT quand l'offre
          l'établit (même règle que l'aperçu du primaire, aucune ligne sinon). */}
      {!withPreview && item.requester?.status === 'etaye' ? (
        <div className="mt-1 text-xs text-[var(--bellum-text-secondary)]">
          <OfferRequesterLine requester={item.requester} />
        </div>
      ) : null}
    </div>
  )
}

function SignalPreview({ item }: { item: WatchlistItem }) {
  const [open, setOpen] = useState(false)
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cancelOpen = useCallback(() => {
    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current)
      openTimerRef.current = null
    }
  }, [])

  const cancelClose = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }, [])

  const scheduleClose = useCallback(() => {
    cancelOpen()
    cancelClose()
    closeTimerRef.current = setTimeout(() => setOpen(false), HOVER_CLOSE_DELAY)
  }, [cancelClose, cancelOpen])

  const handleOpen = useCallback(() => {
    cancelOpen()
    cancelClose()
    openTimerRef.current = setTimeout(() => setOpen(true), HOVER_OPEN_DELAY)
  }, [cancelClose, cancelOpen])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={event => event.stopPropagation()}
          onMouseEnter={handleOpen}
          onMouseLeave={scheduleClose}
          onFocus={handleOpen}
          onBlur={scheduleClose}
          className="flex min-h-6 w-full min-w-0 items-start gap-2 rounded-sm py-1 text-left hover:bg-[var(--bellum-surface-2)]"
        >
          <Zap className="ml-1 mt-0.5 size-3.5 shrink-0 text-[var(--warning-soft-text)]" />
          <Text
            element="span"
            size="sm"
            weight="medium"
            className="block min-w-0 flex-1 text-[var(--bellum-text-primary)]"
          >
            {item.displayLabel ?? item.signalLabel}
          </Text>
        </button>
      </PopoverTrigger>
      {/* SIMON-FIX S.16 — le popover s'ouvre SOUS la ligne : ouvert au-dessus (`top`), il recouvrait deux puces de
          filtre de la rangée qui précède le tableau. Il se retourne tout seul s'il n'a pas la place dessous. */}
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={10}
        onClick={event => event.stopPropagation()}
        onMouseEnter={cancelClose}
        onMouseLeave={scheduleClose}
        onOpenAutoFocus={event => event.preventDefault()}
        className="w-[320px] rounded-xl border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-0 shadow-[var(--shadow-elevated)]"
      >
        <SignalPreviewCard item={item} />
      </PopoverContent>
    </Popover>
  )
}

function SignalPreviewCard({ item }: { item: WatchlistItem }) {
  const { t } = useTranslation('watchlist')
  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center gap-2">
        <div className="flex size-8 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--bellum-warning-text)_14%,transparent)]">
          <Zap className="size-4 text-[var(--warning-soft-text)]" />
        </div>
        <div className="min-w-0">
          <Text element="p" size="sm" weight="semibold" className="text-[var(--bellum-text-primary)]">
            {t('table.signalDetected')}
          </Text>
          <Text
            element="p"
            size="xs"
            noWrap
            title={item.companyName}
            className="truncate text-[var(--bellum-text-secondary)]"
          >
            {item.companyName}
          </Text>
        </div>
      </div>
      <Text element="p" size="sm" className="text-[var(--bellum-text-primary)]">
        {item.displayLabel ?? item.signalLabel}
      </Text>
      <div className="flex flex-wrap items-center gap-2">
        <SignalPreviewBadge value={item.signalType} />
        {/* #1912.11 — même porte que la ligne de la liste. */}
        <SignalPreviewBadge value={signalSourceLabel(t, readableSource(item.signalSource, item.sourceUrl))} />
        <SignalPreviewBadge value={formatSignalDate(item.signalDate)} />
      </div>
      {/* #4182.5 — qui porte le besoin, SEULEMENT quand l'offre l'établit : sinon aucune ligne dans l'aperçu. */}
      {item.requester?.status === 'etaye' ? (
        <div className="text-xs text-[var(--bellum-text-secondary)]">
          <OfferRequesterLine requester={item.requester} />
        </div>
      ) : null}
      {/* V4-CORRECTIFS-C 4286.12 — une offre dont le demandeur n'est pas établi le DIT (« à identifier »), sans nom. */}
      {item.requester?.status === 'a_identifier' ? (
        <p data-testid="need-requester-toidentify" className="text-xs text-[var(--bellum-text-secondary)]">
          {t('table.requesterToIdentify')}
        </p>
      ) : null}
      {/* #3922.3 — la preuve cliquable dès l'aperçu : « j'ai vu que… » se dit au téléphone. */}
      <SignalSourceLink
        url={item.sourceUrl}
        sourceKind={item.sourceKind}
        collectedBeforeLink={item.collectedBeforeLink}
      />
    </div>
  )
}

function SignalPreviewBadge({ value }: { value?: string | null }) {
  if (!value) return null
  return (
    <Badge className="border-0 bg-[var(--bellum-surface-2)] px-2 py-0.5 text-xs text-[var(--bellum-text-secondary)]">
      {value}
    </Badge>
  )
}

/**
 * L'œil « suivi » (maquette validée) : le compte est dans tes 3 suivis. Le cliquer ouvre la
 * confirmation « Ne plus suivre » — le compte reste, une place se libère (#4267).
 */
function FollowedEye({ accountId, companyName }: { accountId: string; companyName: string }) {
  const { t } = useTranslation('watchlist')
  const toggle = useToggleAccountFollow()
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t('table.followedEye', { company: companyName })}
          title={t('table.followed')}
          onClick={event => event.stopPropagation()}
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-control text-[var(--bellum-text-accent)] hover:bg-[var(--accent-soft-bg)] pointer-coarse:size-11"
        >
          <Eye className="size-4" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 space-y-3 p-4" onClick={event => event.stopPropagation()}>
        <Text element="p" size="sm" weight="semibold">
          {t('table.unfollowTitle', { company: companyName })}
        </Text>
        <Text element="p" size="sm" className="text-[var(--bellum-text-secondary)]">
          {t('table.unfollowBody')}
        </Text>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" className="min-h-11" onClick={() => setOpen(false)}>
            {t('table.unfollowCancel')}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11"
            disabled={toggle.isPending}
            onClick={() => toggle.mutate({ accountId, follow: false }, { onSuccess: () => setOpen(false) })}
          >
            {t('table.unfollowConfirm')}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function WatchlistEmpty() {
  const { t } = useTranslation('watchlist')
  return (
    <div className={`flex min-h-72 flex-col items-center justify-center text-center ${PAGE_GUTTER_X}`}>
      <Activity className="size-5 text-[var(--bellum-text-muted)]" />
      <Text size="sm" weight="semibold" className="mt-3">
        {t('emptyState.noSignalTitle')}
      </Text>
      <Text size="xs" className="mt-1 max-w-sm text-[var(--bellum-text-secondary)]">
        {t('emptyState.noSignalDescription')}
      </Text>
    </div>
  )
}
