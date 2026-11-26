import {
  Badge,
  Button,
  cn,
  CountBadge,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  FilterChips,
  ScrollArea,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
  Text,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@bellum/ui'
import type { ConsolidatedNotification, NotificationInboxScope, NotificationLevel } from '@bellum/contracts'
import type { TFunction } from 'i18next'
import { useNavigate } from '@tanstack/react-router'
import { Bell, X } from 'lucide-react'
import { memo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  overlayDescriptionClassName,
  overlayDialogClassName,
  overlayFootClassName,
  overlayHeadClassName,
  overlaySideClassName,
  overlayTitleClassName,
} from '@/components/layout/overlay'
import { SignalSourceLink } from '@/components/primitives/SignalSourceLink'
import { useNotifications } from '@/features/notifications/hooks/useNotifications'
import { notificationDestination } from '@/features/notifications/notification-link'
import { i18n } from '@/i18n'

/** Short relative time ("il y a 3 h"). */
function timeAgo(t: TFunction<'actions'>, iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diffMs = Date.now() - then
  const min = Math.floor(diffMs / 60_000)
  if (min < 1) return t('notifications.justNow')
  if (min < 60) return t('notifications.minutesAgo', { count: min })
  const hours = Math.floor(min / 60)
  if (hours < 24) return t('notifications.hoursAgo', { count: hours })
  const days = Math.floor(hours / 24)
  if (days < 7) return t('notifications.daysAgo', { count: days })
  return new Date(iso).toLocaleDateString(i18n.language === 'en' ? 'en-GB' : 'fr-FR')
}

/** #2404.3 — la couleur du badge suit le quadrant, jamais une seconde
 *  mesure : `Badge` n'a pas de variante par niveau, ces quatre-là recopient
 *  l'échelle déjà posée par `access.json` (barrier.class) pour rester
 *  cohérentes avec l'onglet Accès. */
const NOTIFICATION_LEVEL_VARIANT: Record<NotificationLevel, 'info' | 'primary' | 'warning' | 'danger'> = {
  information: 'info',
  action: 'primary',
  urgent: 'warning',
  critical: 'danger',
}

/**
 * THEO-REFONTE-COMPOSANTS + MAQ-SHELL-B1 (validé 19/10) — la FAMILLE d'une notification : son badge teinté en
 * tête de ligne et son filtre. Quinze types (et les entrées calculées) se lisent en neuf familles ; un type
 * neuf tombe dans « Bellum » plutôt que de disparaître.
 */
type NotificationFamily =
  | 'signal'
  | 'overdue'
  | 'team'
  | 'reply'
  | 'discover'
  | 'meeting'
  | 'mission'
  | 'digest'
  | 'product'

const FAMILY_BY_TYPE: Partial<Record<string, NotificationFamily>> = {
  buy_signal: 'signal',
  action_overdue: 'overdue',
  relance: 'overdue',
  chat_mention: 'team',
  chat_action_assigned: 'team',
  client_reply: 'reply',
  discover_alert: 'discover',
  meeting_prep: 'meeting',
  mission_end: 'mission',
  weekly_summary: 'digest',
  weekly_digest: 'digest',
  daily_digest: 'digest',
}

function notificationFamily(
  item: Pick<ConsolidatedNotification, 'type' | 'derived' | 'actor_name'>,
): NotificationFamily {
  // #4158.14 / MAQ-SHELL-B2 — une entrée calculée (« des collègues attendent ») ou signée d'un collègue est d'équipe.
  if (item.derived || item.actor_name) return 'team'
  return FAMILY_BY_TYPE[item.type] ?? 'product'
}

/** Les filtres d'abord pertinents (maquette validée), le reste sous « Plus de filtres » (décision Louis). */
const PRIMARY_FILTERS = ['unread', 'signal', 'overdue', 'team', 'reply'] as const
const MORE_FILTERS = ['discover', 'meeting', 'mission', 'digest', 'product'] as const
type NotificationFilter = (typeof PRIMARY_FILTERS)[number] | (typeof MORE_FILTERS)[number]

function NotificationRow({
  item,
  onSelect,
}: {
  item: ConsolidatedNotification
  onSelect: (item: ConsolidatedNotification) => void
}) {
  const { t } = useTranslation('actions')
  const unread = item.read_at === null
  const family = notificationFamily(item)
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(item)}
        className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors duration-immediate ease-bellum-out hover:bg-[var(--bellum-surface-2)] focus-visible:bg-[var(--bellum-surface-2)] focus-visible:outline-none"
      >
        {/* Théo / MAQ-SHELL-E34 — la famille en tête. NEUTRE : une couleur porte un état, jamais une
            catégorie (GA-67) — l'état se lit sur le niveau (Urgent, Critique) et sur « Nouveau ». */}
        <span
          data-testid="notification-family"
          className="mt-0.5 inline-flex w-[5.5rem] shrink-0 items-center justify-center rounded-badge border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] px-1.5 py-0.5 text-xs font-medium text-[var(--bellum-text-secondary)]"
        >
          {t(`notifications.family.${family}`)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <Text element="span" size="sm" weight={unread ? 'semibold' : 'medium'} className="min-w-0 truncate">
              {item.title}
            </Text>
            {/* #2404.3 — `level` écrit et dérivé depuis longtemps
              (`notificationLevelFor`), jamais lu ici avant ce badge. `null`
              (pas de priorité mesurée) ne s'affiche jamais « Information »
              par défaut (GA-18/GA-19) : rien ne se rend dans ce cas. */}
            {item.level ? (
              <Badge variant={NOTIFICATION_LEVEL_VARIANT[item.level]} className="shrink-0">
                {t(`notifications.level.${item.level}`)}
              </Badge>
            ) : null}
            {/* #2144.27 — pas deux alertes identiques sans consolidation :
              `occurrences` ne dépasse 1 QUE pour un groupe réellement fusionné
              (`consolidateNotifications`) — une alerte seule ne montre jamais
              de compteur. */}
            {item.occurrences > 1 ? (
              <Text element="span" size="xs" className="shrink-0 text-[var(--bellum-text-muted)]">
                {t('notifications.occurrences', { count: item.occurrences })}
              </Text>
            ) : null}
          </span>
          {item.body ? (
            <Text element="span" size="xs" className="mt-0.5 block text-[var(--bellum-text-secondary)] line-clamp-2">
              {item.body}
            </Text>
          ) : null}
          <Text element="span" size="xs" className="mt-1 block text-[var(--bellum-text-muted)]">
            {/* #4158.14 — l'auteur du geste EN CLAIR, quand on le sait : une
                entrée sans auteur (le produit, Laura) ne fait AUCUNE ligne. */}
            {item.actor_name ? (
              <span data-testid="notification-actor">{t('notifications.from', { name: item.actor_name })} · </span>
            ) : null}
            {/* Une entrée calculée n'a pas de date de naissance : elle est vraie MAINTENANT. */}
            {item.derived ? null : timeAgo(t, item.created_at)}
            {/* #2404.7 — D'OÙ vient l'information : ce que l'espace a BRANCHÉ,
              jamais un de nos fournisseurs. On n'affiche pas ce qu'on n'a
              pas (GA-18/GA-19) : `null` ne rend aucune ligne. */}
            {item.source ? (
              <span data-testid="notification-source"> · {t('notifications.source', { source: item.source })}</span>
            ) : null}
          </Text>
        </span>
        {unread ? (
          <span
            aria-label={t('notifications.unreadAria')}
            className="mt-0.5 shrink-0 rounded-badge border border-[var(--accent-soft-border)] bg-[var(--accent-soft-bg)] px-1.5 py-0.5 text-xs font-medium text-[var(--accent-soft-text)]"
          >
            {t('notifications.newBadge')}
          </span>
        ) : null}
      </button>
      {/* #3922.n — la preuve du signal cité, cliquable depuis la cloche elle-même :
          le lien nommé, ou « Sans lien vérifiable » (jamais deviné). HORS du bouton :
          un lien dans un bouton est du HTML invalide et ouvrirait aussi la veille. */}
      {item.type === 'buy_signal' ? (
        <div className="px-4 pb-3 pl-[7.25rem]">
          <SignalSourceLink url={item.source_url} sourceKind={item.source_kind} />
        </div>
      ) : null}
    </li>
  )
}

/**
 * Bell in the sidebar footer: unread-count badge + a right-hand drawer of the latest
 * notifications. Clicking a notification marks it read and deep-links when it
 * carries a link. Mounted only in the authenticated shell.
 */
export const NotificationBell = memo(function NotificationBell() {
  const { t } = useTranslation('actions')
  const [open, setOpen] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  // Décision Louis — filtres en multi-sélection. #4158.14 — « Équipe » reste un FILTRE de la boîte
  // existante (le périmètre serveur), pas une deuxième cloche ; les autres filtrent la page reçue.
  const [filters, setFilters] = useState<ReadonlySet<NotificationFilter>>(() => new Set())
  const scope: NotificationInboxScope = filters.has('team') ? 'team' : 'all'
  const navigate = useNavigate()
  const { notifications, unreadCount, unreadCountStatus, isLoading, markRead, markAllRead, clearAll } =
    useNotifications(scope)
  // #2136 — mesuré en prod : le sondage `/notifications/unread-count` a rendu
  // 401 pour un utilisateur connecté, et la cloche affichait « 0 non lu » au
  // lieu de « je n'ai pas pu compter ». Trois lectures distinctes : un compte
  // MESURÉ (même à zéro) porte le badge chiffré, un compte NON MESURÉ porte
  // un indicateur neutre et son propre nom accessible, et le chargement ne
  // prétend ni l'un ni l'autre.
  const unreadUnknown = unreadCountStatus === 'unknown'
  // #4648 — une entrée CALCULÉE n'est pas une ligne : une boîte qui n'a qu'elles n'a rien à vider.
  const clearable = notifications.some(item => !item.derived)

  const families = new Set<NotificationFilter>([...filters].filter(f => f !== 'unread' && f !== 'team'))
  const visible = notifications.filter(
    item =>
      (!filters.has('unread') || item.read_at === null) &&
      (families.size === 0 || families.has(notificationFamily(item))),
  )
  // Le compte d'un filtre se lit sur la page reçue ; « Équipe » vient du serveur, il n'en porte pas. Un compte
  // nul ne s'écrit pas (« on n'affiche pas ce qu'on n'a pas », GA-18).
  const countFor = (filter: NotificationFilter): number | null => {
    if (filter === 'team') return null
    const n =
      filter === 'unread'
        ? notifications.filter(item => item.read_at === null).length
        : notifications.filter(item => notificationFamily(item) === filter).length
    return n > 0 ? n : null
  }
  const toggle = (filter: NotificationFilter) =>
    setFilters(prev => {
      const next = new Set(prev)
      if (next.has(filter)) next.delete(filter)
      else next.add(filter)
      return next
    })

  const handleSelect = (item: ConsolidatedNotification) => {
    if (item.read_at === null) markRead.mutate(item.id)
    setOpen(false)
    // La traduction « chemin serveur → destination du routeur » vit dans
    // `notificationDestination` : la bulle de Laura montre les mêmes
    // notifications, et deux tables auraient divergé au premier lien neuf.
    const destination = notificationDestination(item.link)
    if (destination) void navigate(destination)
  }

  const filterOptions = [...PRIMARY_FILTERS, ...MORE_FILTERS].map(filter => ({
    value: filter,
    label: t(`notifications.filters.${filter}`),
    count: countFor(filter) ?? undefined,
  }))

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Tooltip delayDuration={1000}>
        <TooltipTrigger asChild>
          <SheetTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              aria-label={
                unreadUnknown
                  ? t('notifications.ariaUnknown')
                  : unreadCount && unreadCount > 0
                    ? t('notifications.ariaUnread', { count: unreadCount })
                    : t('notifications.label')
              }
              className={cn(
                'relative size-7 pointer-coarse:size-11 cursor-pointer rounded-full border border-[var(--bellum-border)] bg-[var(--bellum-bg-lighter)] text-[var(--bellum-text-muted)] hover:bg-[var(--bellum-surface-2)] hover:text-[var(--bellum-text-primary)]',
                open && 'bg-[var(--bellum-surface-2)] text-[var(--bellum-text-primary)]',
              )}
            >
              <Bell className="w-4 h-4" />
              {!unreadUnknown && unreadCount !== null && unreadCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5">
                  <CountBadge count={unreadCount} size="sm" />
                </span>
              )}
              {/* #2136 — jamais de badge chiffré quand on ne sait pas compter :
                  un anneau neutre, décoratif (le nom accessible du bouton porte
                  déjà l'information), qui ne prétend ni un compte ni un zéro. */}
              {unreadUnknown && (
                <span
                  data-testid="notification-bell-unknown"
                  className="absolute -top-1.5 -right-1.5 size-3.5 rounded-full"
                  style={{ border: '1.5px solid var(--bellum-text-muted)' }}
                  aria-hidden
                  title={t('notifications.unreadUnknown')}
                />
              )}
            </Button>
          </SheetTrigger>
        </TooltipTrigger>
        {!open && <TooltipContent side="right">{t('notifications.label')}</TooltipContent>}
      </Tooltip>
      {/* Théo `dialog.t-side` + MAQ-SHELL-E34 `#lay-notifs` : un tiroir de droite, plus un menu ancré au pied
          de la barre latérale qui manquait de place dès l'ouverture. */}
      <SheetContent side="right" hideClose className={overlaySideClassName}>
        <div className={cn(overlayHeadClassName, 'pr-3 md:pr-4')}>
          <SheetTitle className={cn(overlayTitleClassName, 'flex-1')}>{t('notifications.label')}</SheetTitle>
          <SheetDescription className="sr-only">{t('notifications.filtersLabel')}</SheetDescription>
          {unreadCount !== null && unreadCount > 0 && (
            <Button type="button" variant="ghost" size="sm" onClick={() => markAllRead.mutate()}>
              {t('notifications.markAllRead')}
            </Button>
          )}
          {/* #4648 — « Vider » à côté de « Tout marquer comme lu ». Il SUPPRIME : il se confirme dans l'application,
              jamais par `window.confirm` (le dialogue natif gèle l'extension Chrome et bloque la recette). */}
          {clearable ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmClear(true)}>
              {t('notifications.clear.action')}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t('notifications.close')}
            onClick={() => setOpen(false)}
            className="size-8 pointer-coarse:size-11"
          >
            <X className="size-4" aria-hidden />
          </Button>
        </div>
        <FilterChips
          multiple
          size="sm"
          ariaLabel={t('notifications.filtersLabel')}
          options={filterOptions}
          values={[...filters]}
          onToggle={toggle}
          collapse={{
            after: PRIMARY_FILTERS.length,
            moreLabel: () => t('notifications.filters.more'),
            lessLabel: t('notifications.filters.less'),
          }}
          className="border-b border-[var(--bellum-border)] px-4 py-3"
        />
        <ScrollArea className="min-h-0 flex-1">
          {isLoading ? (
            <div className="px-4 py-10 text-center">
              <Text element="span" size="sm" className="text-[var(--bellum-text-muted)]">
                {t('common:states.loading')}
              </Text>
            </div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
              <Text element="span" size="sm" className="text-[var(--bellum-text-muted)]">
                {notifications.length > 0
                  ? t('notifications.emptyFiltered')
                  : t(scope === 'team' ? 'notifications.emptyTeam' : 'notifications.empty')}
              </Text>
              {notifications.length > 0 ? (
                <Button type="button" variant="outline" size="sm" onClick={() => setFilters(new Set())}>
                  {t('notifications.clearFilters')}
                </Button>
              ) : null}
            </div>
          ) : (
            <ul className="divide-y divide-[var(--bellum-border)]">
              {visible.map(item => (
                <NotificationRow key={item.id} item={item} onSelect={handleSelect} />
              ))}
            </ul>
          )}
        </ScrollArea>
        <Dialog open={confirmClear} onOpenChange={setConfirmClear}>
          <DialogContent closeLabel={t('common:actions.close')} className={cn('sm:max-w-md', overlayDialogClassName)}>
            <div className={cn(overlayHeadClassName, 'flex-col items-start gap-1')}>
              <DialogTitle className={overlayTitleClassName}>{t('notifications.clear.title')}</DialogTitle>
              <DialogDescription className={overlayDescriptionClassName}>
                {t('notifications.clear.body')}
              </DialogDescription>
            </div>
            <div className={overlayFootClassName}>
              <Button type="button" size="sm" variant="outline" onClick={() => setConfirmClear(false)}>
                {t('common:actions.cancel')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                disabled={clearAll.isPending}
                onClick={() => {
                  clearAll.mutate()
                  setConfirmClear(false)
                }}
              >
                {t('notifications.clear.action')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </SheetContent>
    </Sheet>
  )
})
