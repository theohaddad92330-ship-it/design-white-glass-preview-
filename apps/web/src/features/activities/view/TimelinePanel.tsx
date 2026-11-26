import type { Activity, ActivityKind, ActivityScope, ActivitySource } from '@bellum/contracts'
import { Badge, Box, Button, Input, Text } from '@bellum/ui'
import { CalendarDays, Mail, MessageSquare, Phone, RefreshCw, Trash2, Users } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLogActivity, useRemoveActivity, useSyncActivities, useTimeline } from '../hooks/useTimeline'
import {
  TIMELINE_CATEGORIES,
  connectorAbsent,
  excerpt,
  formatDuration,
  collapseRepeatedReads,
  groupByDay,
  matchesCategory,
  matchesSearch,
  relationState,
  splitUpcoming,
  visibleSlice,
  type TimelineCategory,
} from '../model/timeline'
import { timelineEventTitle } from '../model/timelineEvent'
import { LogActivityDialog } from './LogActivityDialog'
import { NoteCascadeProposal } from './NoteCascadeProposal'

const KIND_ICONS: Partial<Record<ActivityKind, typeof Mail>> = {
  email: Mail,
  call: Phone,
  meeting: CalendarDays,
  note: MessageSquare,
  linkedin: Users,
}

/** #3688 — lignes montrées d'abord ; le reste vient à la demande, sans petit défilement intérieur. */
const PAGE_SIZE = 15

type TimelinePrefs = { category?: TimelineCategory; search?: string }

const prefsKey = (scope: ActivityScope, entityId: string) => `bellum:timeline:${scope}:${entityId}`

/** #3688.10 — la recherche et le filtre se retrouvent au retour sur la fiche (jamais bloquant). */
function readPrefs(scope: ActivityScope, entityId: string): TimelinePrefs {
  try {
    const raw = window.sessionStorage.getItem(prefsKey(scope, entityId))
    return raw ? (JSON.parse(raw) as TimelinePrefs) : {}
  } catch {
    return {}
  }
}

function writePrefs(scope: ActivityScope, entityId: string, prefs: TimelinePrefs) {
  try {
    window.sessionStorage.setItem(prefsKey(scope, entityId), JSON.stringify(prefs))
  } catch {
    // Mode privé ou stockage refusé : le fil marche sans mémoire.
  }
}

/**
 * L'HISTORIQUE d'un compte, d'un contact ou d'un projet.
 *
 * Trois décisions d'affichage, chacune contre une lecture fausse :
 *
 *  - **l'état de la relation est en TÊTE**, pas déduit du fil. « Tu attends une
 *    réponse depuis 4 jours » est l'information qui décide de l'action ; la
 *    faire déduire d'une liste de dates revient à ne pas la donner.
 *  - **une source qui n'a pas répondu se dit**, elle ne se traduit pas en vide.
 *  - **une activité interne est marquée.** Une réunion de préparation entre
 *    collègues a bien eu lieu, mais elle ne prouve rien sur la relation client,
 *    et un fil qui les mélange fait croire à un compte plus travaillé qu'il ne
 *    l'est.
 */
export function TimelinePanel({
  scope,
  entityId,
  accountId,
  contactId,
  projectId,
  /** Le bouton de capture n'a de sens qu'une fois par écran, pas par panneau. */
  showSync = true,
  /**
   * #3405 — la liste « Actions exécutées » juste au-dessus lit la MÊME
   * catégorie : la chronologie ne la répète pas (recette prod 01/10 : onze
   * lignes « Laura a consulté ton CRM » rendues deux fois).
   */
  omitActions = false,
  /**
   * #3688.2 — « Consigner un échange » peut vivre dans la barre de travail en
   * haut de la fiche : le bouton d'ici se retire (`false`) pour ne pas exister
   * deux fois, et la barre ouvre CE dialogue en incrémentant `composeSignal`.
   * Le dialogue, la cascade de note et la journalisation restent à UN endroit.
   */
  showLogAction = true,
  composeSignal = 0,
  categories = TIMELINE_CATEGORIES.filter(key => key !== 'client' && key !== 'internal'),
  defaultCategory = 'all',
}: {
  scope: ActivityScope
  entityId: string
  accountId?: string
  contactId?: string
  projectId?: string
  showSync?: boolean
  omitActions?: boolean
  showLogAction?: boolean
  composeSignal?: number
  /**
   * #3688.7 — les filtres proposés et celui d'ouverture. La fiche d'une PERSONNE
   * ouvre sur « Relation client » : l'interne et les opérations de Bellum
   * restent à un clic (« Interne », « Actions », « Tout »), hors du fil client.
   */
  categories?: readonly TimelineCategory[]
  defaultCategory?: TimelineCategory
}) {
  const { t, i18n } = useTranslation('activities')
  /**
   * #2124.59 — LE FILTRE EST UNE CATÉGORIE, ET IL S'APPLIQUE ICI.
   *
   * Il partait au serveur sous forme de NATURE (`?kind=email`), ce qui obligeait
   * à un aller-retour par clic et rendait impossible une catégorie qui
   * rassemble plusieurs natures. Le fil est déjà chargé en entier : le
   * découper en mémoire ne coûte rien et répond instantanément.
   */
  const [initialPrefs] = useState(() => readPrefs(scope, entityId))
  const [category, setCategoryState] = useState<TimelineCategory>(() =>
    initialPrefs.category && categories.includes(initialPrefs.category) ? initialPrefs.category : defaultCategory,
  )
  const [search, setSearchState] = useState(initialPrefs.search ?? '')
  const [limit, setLimit] = useState(PAGE_SIZE)
  // #3688.11 — les sources qui n'ont PAS répondu à la dernière récupération :
  // un fil lu avec une source en panne est partiel, et il le dit.
  const [failedSources, setFailedSources] = useState<ActivitySource[]>([])
  const setCategory = (next: TimelineCategory) => {
    setCategoryState(next)
    setLimit(PAGE_SIZE)
    writePrefs(scope, entityId, { category: next, search })
  }
  const setSearch = (next: string) => {
    setSearchState(next)
    setLimit(PAGE_SIZE)
    writePrefs(scope, entityId, { category, search: next })
  }
  const [composing, setComposing] = useState(false)
  // #2126.6 — posé par la dernière récupération, jamais déduit du silence :
  // un historique vide au premier chargement ne sait pas ENCORE si c'est
  // parce que rien n'est branché ou parce qu'il ne s'est rien passé.
  const [noConnector, setNoConnector] = useState(false)
  // #2777 — recette écran 27/09 : la note vient d'être enregistrée, la
  // cascade se propose SUR CETTE note (`key` change à chaque nouvelle note,
  // pour que `NoteCascadeProposal` reparte d'une lecture neuve plutôt que de
  // garder la proposition de la précédente).
  const [notePrompt, setNotePrompt] = useState<{ key: number; notes: string } | null>(null)

  useEffect(() => {
    if (composeSignal > 0) setComposing(true)
  }, [composeSignal])

  const { data, isLoading, isError } = useTimeline(scope, entityId)
  const log = useLogActivity(scope, entityId)
  const sync = useSyncActivities(scope, entityId)
  const remove = useRemoveActivity(scope, entityId)

  // #3688.6/.7 — « planifié » n'est pas « tenu » : le futur se lit à part, sous
  // « À venir ». Le passé est groupé par jour et chargé progressivement.
  const { upcoming, shown, hidden, matched } = useMemo(() => {
    const kept = (data?.items ?? []).filter(
      item =>
        matchesCategory(item, category) &&
        !(omitActions && matchesCategory(item, 'actions')) &&
        matchesSearch(item, search),
    )
    const split = splitUpcoming(kept)
    const slice = visibleSlice(groupByDay(split.past), limit)
    return { upcoming: split.upcoming, shown: slice.days, hidden: slice.hidden, matched: kept.length }
  }, [data?.items, category, omitActions, search, limit])
  const days = shown
  const state = data ? relationState(data.engagement) : 'empty'

  const formatDay = (day: string): string =>
    new Date(`${day}T12:00:00`).toLocaleDateString(i18n.language === 'en' ? 'en-GB' : 'fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  const formatTime = (iso: string): string =>
    new Date(iso).toLocaleTimeString(i18n.language === 'en' ? 'en-GB' : 'fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    })

  return (
    <Box className="space-y-4">
      <Box display="flex" className="flex-wrap items-center justify-between gap-2">
        <RelationLine
          state={state}
          days={data?.engagement.daysSinceLastActivity ?? null}
          total={data?.engagement.total ?? 0}
        />
        <Box display="flex" className="items-center gap-2">
          {showSync ? (
            <Button
              variant="ghost"
              size="sm"
              isLoading={sync.isPending}
              onClick={() =>
                sync.mutate(undefined, {
                  // #2126.6 — un appel LOCAL à la Récupération courante, en
                  // plus (pas à la place) du toast de `useSyncActivities` :
                  // celui-ci pilote l'état PERSISTANT de l'écran, le toast
                  // reste le retour immédiat du clic.
                  onSuccess: result => {
                    setNoConnector(connectorAbsent(result))
                    setFailedSources(
                      result.sources.filter(source => source.reason === 'error').map(item => item.source),
                    )
                  },
                })
              }
            >
              <RefreshCw className="mr-1.5 size-3.5" aria-hidden />
              {t('sync.action')}
            </Button>
          ) : null}
          {showLogAction ? (
            <Button variant="black" size="sm" onClick={() => setComposing(true)}>
              {t('log.action')}
            </Button>
          ) : null}
        </Box>
      </Box>

      {/* #2777 — la cascade proposée SUR la note qu'on vient d'enregistrer :
          récap, opportunité, besoin, contacts. `accountId` seul en décide :
          une note liée à un contact ou un projet sans compte connu ne
          propose rien plutôt que de deviner un compte. */}
      {notePrompt && accountId ? (
        <NoteCascadeProposal
          key={notePrompt.key}
          accountId={accountId}
          notes={notePrompt.notes}
          onDismiss={() => setNotePrompt(null)}
        />
      ) : null}

      <Box display="flex" className="flex-wrap items-center gap-1">
        {/* i18n keys: filters.all | filters.interactions | filters.actions | filters.projects | filters.analyses | filters.client | filters.internal */}
        {categories
          .filter(key => !(omitActions && key === 'actions'))
          .map(key => (
            <Button
              key={key}
              variant={category === key ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setCategory(key)}
            >
              {t(`filters.${key}`)}
            </Button>
          ))}
      </Box>

      <Input
        type="search"
        value={search}
        onChange={event => setSearch(event.target.value)}
        placeholder={t('search.placeholder')}
        aria-label={t('search.label')}
      />

      {failedSources.length > 0 ? (
        <Box className="rounded-md border border-dashed border-border p-3" role="status">
          <Text size="sm" color="text-muted-foreground">
            {t('partial.banner', { sources: failedSources.map(source => t(`partial.sources.${source}`)).join(', ') })}
          </Text>
        </Box>
      ) : null}

      {isLoading ? (
        <Text size="sm" color="text-muted-foreground">
          {t('common:states.loading')}
        </Text>
      ) : isError ? (
        // Un échec de lecture ne se rend JAMAIS comme un historique vide : c'est
        // la faute trouvée en production le 17/08 sur les notes, et elle avait
        // envoyé chercher au mauvais endroit pendant une demi-heure.
        <Box className="rounded-md border border-dashed border-destructive/40 p-4">
          <Text size="sm" color="text-muted-foreground">
            {t('states.loadError')}
          </Text>
        </Box>
      ) : days.length === 0 && noConnector && category === 'all' ? (
        // #2126.6 / #2126.19 — DISTINCT du vide ordinaire ci-dessous : rien
        // n'a été lu parce qu'aucun outil ne peut être lu, pas parce que
        // rien ne s'est passé. Le geste qui répare est de se connecter, pas
        // de réessayer.
        <Box className="rounded-md border border-dashed border-border p-6 text-center">
          <Text size="sm" color="text-muted-foreground">
            {t('states.connectorAbsent')}
          </Text>
          <Text size="xs" color="text-muted-foreground" className="mt-1">
            {t('states.connectorAbsentHint')}
          </Text>
          <Link
            to="/integrations"
            className="mt-3 inline-flex min-h-11 items-center rounded-md border border-[var(--bellum-border)] px-3 text-sm text-[var(--bellum-text-accent)] hover:bg-[var(--bellum-surface-2)]"
          >
            {t('states.connectorAbsentAction')}
          </Link>
        </Box>
      ) : matched === 0 && search.trim() ? (
        <Box className="rounded-md border border-dashed border-border p-6 text-center">
          <Text size="sm" color="text-muted-foreground">
            {t('search.noResult', { query: search.trim() })}
          </Text>
        </Box>
      ) : days.length === 0 && upcoming.length === 0 ? (
        <Box className="rounded-md border border-dashed border-border p-6 text-center">
          <Text size="sm" color="text-muted-foreground">
            {category === 'all' ? t('states.empty') : t('states.emptyFiltered')}
          </Text>
          <Text size="xs" color="text-muted-foreground" className="mt-1">
            {t('states.emptyHint')}
          </Text>
        </Box>
      ) : (
        <Box className="space-y-5">
          {/* #3688.6/.7 — ce qui est PLANIFIÉ, séparé de ce qui a eu lieu. Sans rendez-vous futur, pas de section. */}
          {upcoming.length > 0 ? (
            <Box as="section" aria-label={t('upcoming.title')} className="space-y-2">
              <Text element="p" size="xs" weight="medium" color="text-muted-foreground">
                {t('upcoming.title')}
              </Text>
              <Box className="space-y-2">
                {upcoming.map(activity => (
                  <ActivityRow
                    key={activity.id}
                    activity={activity}
                    planned
                    time={`${new Date(activity.occurredAt).toLocaleDateString(i18n.language === 'en' ? 'en-GB' : 'fr-FR', { day: 'numeric', month: 'short' })} · ${formatTime(activity.occurredAt)}`}
                  />
                ))}
              </Box>
            </Box>
          ) : null}
          {days.map(day => (
            <Box key={day.day} className="space-y-2">
              <Text element="p" size="xs" weight="medium" color="text-muted-foreground">
                {formatDay(day.day)}
              </Text>
              <Box className="space-y-2">
                {collapseRepeatedReads(day.activities).map(({ activity, count }) => (
                  <ActivityRow
                    key={activity.id}
                    activity={activity}
                    repeatCount={count}
                    time={formatTime(activity.occurredAt)}
                    onRemove={
                      // Une activité CAPTURÉE n'offre pas de bouton : l'effacer
                      // ne ferait pas disparaître l'e-mail, et la prochaine
                      // récupération la ramènerait.
                      activity.source === 'manual' ? () => remove.mutate({ id: activity.id }) : undefined
                    }
                  />
                ))}
              </Box>
            </Box>
          ))}
          {hidden > 0 ? (
            <Button variant="outline" size="sm" onClick={() => setLimit(value => value + PAGE_SIZE)}>
              {t('more', { count: hidden })}
            </Button>
          ) : null}
        </Box>
      )}

      {composing ? (
        <LogActivityDialog
          open
          onOpenChange={setComposing}
          isPending={log.isPending}
          onSubmit={input => {
            log.mutate(
              { ...input, accountId, contactId, projectId },
              {
                onSuccess: () => {
                  setComposing(false)
                  // #2777 — la cascade se propose sur le texte réellement
                  // écrit (objet + corps) : un objet seul, sans corps, reste
                  // une note valable, mais n'a rien à structurer.
                  const combined = [input.subject, input.body].filter(Boolean).join('\n\n').trim()
                  if (accountId && combined) setNotePrompt({ key: Date.now(), notes: combined })
                },
              },
            )
          }}
        />
      ) : null}
    </Box>
  )
}

/** L'état de la relation, en une phrase — la première chose qu'on doit lire. */
function RelationLine({
  state,
  days,
  total,
}: {
  state: ReturnType<typeof relationState>
  days: number | null
  total: number
}) {
  const { t } = useTranslation('activities')
  if (state === 'empty') {
    return (
      <Text element="span" size="sm" color="text-muted-foreground">
        {t('relation.empty')}
      </Text>
    )
  }
  const variant = state === 'awaiting' ? 'warning' : state === 'silent' ? 'secondary' : 'success'
  return (
    <Box display="flex" className="flex-wrap items-center gap-2">
      <Badge variant={variant}>{t(`relation.${state}`)}</Badge>
      <Text element="span" size="xs" color="text-muted-foreground">
        {days === null ? t('relation.countOnly', { count: total }) : t('relation.summary', { count: total, days })}
      </Text>
    </Box>
  )
}

function ActivityRow({
  activity,
  time,
  repeatCount = 1,
  planned = false,
  onRemove,
}: {
  activity: Activity
  time: string
  repeatCount?: number
  /** #3688.7 — daté dans le futur : planifié, pas tenu. */
  planned?: boolean
  onRemove?: () => void
}) {
  const { t } = useTranslation('activities')
  const [expanded, setExpanded] = useState(false)
  const Icon = KIND_ICONS[activity.kind] ?? MessageSquare
  const preview = excerpt(activity.body)
  const duration = formatDuration(activity.durationSeconds)
  const hasMore = Boolean(activity.body && preview && activity.body.replace(/\s+/g, ' ').trim() !== preview)
  // #4016.6d — `#activity-<id>` vise cette ligne : on l'amène à l'écran et on la marque.
  const anchorId = `activity-${activity.id}`
  const anchored = typeof window !== 'undefined' && window.location.hash === `#${anchorId}`
  const rowRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (anchored) rowRef.current?.scrollIntoView({ block: 'center' })
  }, [anchored])

  return (
    <Box
      ref={rowRef}
      id={anchorId}
      {...(anchored ? { 'data-anchored': true } : {})}
      className={`rounded-md border bg-card p-3 ${anchored ? 'border-[var(--bellum-primary-400)]' : 'border-border'}`}
    >
      <Box display="flex" className="items-start justify-between gap-3">
        <Box display="flex" className="min-w-0 items-center gap-2">
          <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <Text element="span" size="sm" weight="medium" className="truncate">
            {/* #2124.68 — l'objet passe par le catalogue de libellés : une trace
                système porte des CLÉS (`account_priority — accept`), et
                l'historique d'un compte n'est pas un journal technique. */}
            {timelineEventTitle(activity, t)}
          </Text>
          {repeatCount > 1 ? <Badge variant="secondary">{t('repeat', { count: repeatCount })}</Badge> : null}
          {planned ? <Badge variant="warning">{t('upcoming.planned')}</Badge> : null}
          {planned ? null : activity.direction === 'internal' ? (
            // Une réunion interne a eu lieu, mais elle ne prouve rien sur la
            // relation client. Sans ce marqueur, un fil rempli de points
            // d'équipe se lit comme un compte très travaillé.
            <Badge variant="secondary">{t('direction.internal')}</Badge>
          ) : (
            <Badge variant="default">{t(`direction.${activity.direction}`)}</Badge>
          )}
        </Box>
        <Box display="flex" className="shrink-0 items-center gap-1">
          <Text element="span" size="xs" color="text-muted-foreground">
            {duration ? `${time} · ${duration}` : time}
          </Text>
          {onRemove ? (
            <Button variant="ghost" size="icon" onClick={onRemove} aria-label={t('log.remove')} title={t('log.remove')}>
              <Trash2 className="size-3.5" aria-hidden />
            </Button>
          ) : null}
        </Box>
      </Box>

      {preview ? (
        <Text size="sm" color="text-muted-foreground" className="mt-2 whitespace-pre-wrap">
          {expanded ? activity.body : preview}
        </Text>
      ) : null}

      {/* Le corps appartient à son auteur (D65). Le DIRE plutôt que de laisser
          un blanc : `body: null` veut déjà dire « cet échange n'a pas de
          contenu » (un appel sans transcription), et réutiliser ce blanc ferait
          conclure à une capture cassée. */}
      {activity.bodyRedacted ? (
        <Text size="xs" color="text-muted-foreground" className="mt-2 italic">
          {t('body.redacted')}
        </Text>
      ) : null}

      {activity.bodyTruncated ? (
        // Un corps coupé en silence se lit comme un message qui s'arrêtait là,
        // donc comme un interlocuteur brusque ou une demande sans sa question.
        <Text size="xs" color="text-muted-foreground" className="mt-1">
          {t('body.truncated')}
        </Text>
      ) : null}

      <Box display="flex" className="mt-2 flex-wrap items-center gap-x-3 gap-y-1">
        <Text element="span" size="xs" color="text-muted-foreground">
          {t(`sources.${activity.source}`)}
        </Text>
        {activity.authorName ? (
          <Text element="span" size="xs" color="text-muted-foreground">
            {activity.authorName}
          </Text>
        ) : null}
        {activity.linkReason ? (
          // « Rattaché parce que l'adresse correspond » se vérifie ; « rattaché »
          // ne se vérifie pas.
          <Text element="span" size="xs" color="text-muted-foreground">
            {t(`linkReasons.${activity.linkReason}`)}
          </Text>
        ) : null}
        {activity.kind === 'call' ? (
          // Un appel sans issue reste LISIBLE — « non renseignée » se DIT,
          // plutôt que de laisser un silence qui se lirait comme un oubli
          // d'affichage.
          <Text element="span" size="xs" color="text-muted-foreground">
            {activity.outcome ? t(`outcome.value.${activity.outcome}`) : t('outcome.unspecified')}
          </Text>
        ) : null}
        {/* #1931.19 — COCHER UNE TÂCHE N'EST PAS CONTACTER QUELQU'UN.
            `tasks.service.ts::recordCompletion` écrit cette ligne dans le MÊME
            historique qu'un e-mail ou un appel réellement échangé
            (`direction: 'internal'` la distingue des positionnements, l'autre
            émetteur de `kind: 'task'`, qui portent `direction: 'outbound'`).
            Sans ce marqueur, une case cochée se lit plus tard comme la preuve
            d'un contact — un malentendu coûteux sur un fil partagé. */}
        {activity.kind === 'task' && activity.direction === 'internal' ? (
          <Text element="span" size="xs" color="text-muted-foreground">
            {t('taskCompletion.noContact')}
          </Text>
        ) : null}
        {/* #2124.64 — LE RÉSULTAT D'UN ÉVÉNEMENT QUI N'EST PAS UN APPEL.
            `verdict` est stocké sur toute activité depuis des mois — `sent`,
            `drafted`, `failed`, `partial`, `unknown` — et rien ne le lisait :
            un message resté en BROUILLON se lisait exactement comme un message
            PARTI. Il ne s'affiche que là où il existe : une note ou un
            rendez-vous n'a pas de sort d'envoi, et lui en inventer un ferait
            dire à l'écran ce que personne n'a mesuré.
            i18n keys: verdict.sent | verdict.drafted | verdict.failed | verdict.partial | verdict.unknown */}
        {activity.verdict ? (
          <Text element="span" size="xs" color="text-muted-foreground">
            {t(`verdict.${activity.verdict}`)}
          </Text>
        ) : null}
        {hasMore ? (
          <Button variant="ghost" size="sm" onClick={() => setExpanded(value => !value)}>
            {expanded ? t('body.collapse') : t('body.expand')}
          </Button>
        ) : null}
        {/* #2124.65 — LE LIEN VERS L'OBJET CONCERNÉ.
            Le fil ne savait ouvrir que l'objet CHEZ LE FOURNISSEUR, et
            seulement quand celui-ci donnait une adresse. Une ligne rattachée à
            un contact de l'espace porte désormais le chemin vers CE contact :
            c'est le rattachement qu'on vient de justifier une ligne plus haut,
            et il devait pouvoir s'ouvrir. */}
        {activity.contactId ? (
          <Link
            to="/contacts/$id"
            params={{ id: activity.contactId }}
            className="text-xs text-muted-foreground underline underline-offset-2"
          >
            {t('body.openContact')}
          </Link>
        ) : null}
        {activity.externalUrl ? (
          <a
            href={activity.externalUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-muted-foreground underline underline-offset-2"
          >
            {t('body.open')}
          </a>
        ) : null}
      </Box>
    </Box>
  )
}
