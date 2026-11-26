import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight, CircleHelp } from 'lucide-react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Progress,
  Text,
  useRegisterSelectionBarOpen,
} from '@bellum/ui'
import type { WorkspaceMember } from '@/features/chat/hooks/useWorkspaceMembers'
import { Link } from '@tanstack/react-router'
import {
  burstPrimary,
  burstProgress,
  initialBurst,
  keyToBurstCommand,
  reduceBurst,
  foldRecipients,
  summarizeBurst,
  type BurstCommand,
  type BurstSummary,
} from './burst'
import { ShortcutKeys } from '@/features/shortcuts/ShortcutKeys'
import { shortcutById, shortcutsInScope } from '@/features/shortcuts/shortcuts'
import { TodayCard, type TodayCardCommands } from './TodayCard'
import type { TodayGroupKey, TodayItem } from './todayQueue'
import type { useTodayGestures } from './useTodayGestures'

/**
 * Lot L-A (#4164) — LE MODE RAFALE : une carte à la fois, plein écran, au clavier.
 *
 * Le paquet (`deck`) est figé à l'ouverture ; la carte AFFICHÉE est relue dans la
 * file vivante (`live`) pour que la version d'un brouillon qu'on vient d'enregistrer
 * soit la bonne à l'édition suivante. La progression « 3/12 » compte les cartes du
 * paquet : traiter une carte la fait sortir de la file, pas du paquet.
 *
 * Les raccourcis ne volent rien : ni dans un champ de saisie, ni dans un menu ou
 * un popover ouvert (Échap ferme d'abord celui-ci), ni avec Ctrl/Cmd/Alt. Entrée
 * ne fait JAMAIS partir un message tout seul (voir `burstPrimary`, c82).
 */

type Gestures = ReturnType<typeof useTodayGestures>

type Targeted = { target: EventTarget | null }

function targetKind(event: Targeted): 'editable' | 'interactive' | 'layer' | 'other' {
  const element = event.target instanceof Element ? event.target : null
  if (!element) return 'other'
  if (element.closest('[role="menu"], [data-slot="popover-content"], [role="listbox"]')) return 'layer'
  if (element.closest('input, textarea, select, [contenteditable="true"]')) return 'editable'
  if (element.closest('button, a[href], [role="button"], [role="menuitem"]')) return 'interactive'
  return 'other'
}

export function BurstPanel({
  deck,
  live,
  group,
  now,
  gestures,
  members,
  hasMandate,
  onSkip,
  onClose,
}: {
  deck: readonly TodayItem[]
  live: readonly TodayItem[]
  group: TodayGroupKey
  now: Date
  gestures: Gestures
  members: readonly WorkspaceMember[]
  hasMandate: boolean
  onSkip: (item: TodayItem) => void
  onClose: () => void
}) {
  const { t } = useTranslation('actions')
  // #4163 LF — le panneau plein écran réclame le coin bas-droite : le rond de Laura (z-widget) recouvrait
  // « Suivant ». Même mécanisme que la barre de sélection flottante (GA-386) : il s'efface tant qu'on est en rafale.
  useRegisterSelectionBarOpen()
  const { t: tShortcuts } = useTranslation('shortcuts')
  const ids = useMemo(() => deck.map(item => item.id), [deck])
  const [state, dispatch] = useReducer(
    (current: ReturnType<typeof initialBurst>, event: Parameters<typeof reduceBurst>[1]) =>
      reduceBurst(current, event, ids),
    undefined,
    initialBurst,
  )
  const commands = useRef<TodayCardCommands | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)

  // #4521.3 — les brouillons générés à la demande, par carte : ils survivent à Précédent/Suivant, jamais envoyés.
  const [generated, setGenerated] = useState<Record<string, TodayItem['draft']>>({})
  const snapshot = deck[state.index]
  const liveItem = snapshot ? (live.find(candidate => candidate.id === snapshot.id) ?? snapshot) : undefined
  const item = liveItem && generated[liveItem.id] ? { ...liveItem, draft: generated[liveItem.id] ?? null } : liveItem
  const progress = burstProgress(state, deck.length)
  // #4354.1 — lu sur le paquet FIGÉ : le récap ne change pas pendant qu'on traite.
  const summary = useMemo(() => summarizeBurst(deck), [deck])

  useEffect(() => {
    if (state.exited) onClose()
  }, [state.exited, onClose])

  const run = useCallback((command: BurstCommand) => {
    switch (command) {
      case 'next':
        return dispatch({ type: 'next' })
      case 'prev':
        return dispatch({ type: 'prev' })
      case 'help':
        return dispatch({ type: 'help' })
      case 'exit':
        return dispatch({ type: 'exit' })
      case 'edit':
        return commands.current?.edit()
      case 'primary':
        return commands.current?.primary()
      case 'postpone':
        return commands.current?.postpone()
      case 'skip':
        return commands.current?.skip()
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = targetKind(event)
      // Un menu ou un popover ouvert garde le clavier (Échap le ferme, lui seul).
      if (target === 'layer') return
      const command = keyToBurstCommand({
        key: event.key,
        ctrl: event.ctrlKey,
        meta: event.metaKey,
        alt: event.altKey,
        target,
      })
      if (!command) return
      event.preventDefault()
      run(command)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [run])

  const registerCommands = useCallback((next: TodayCardCommands) => {
    commands.current = next
  }, [])

  const groupLabel = t(`today.groups.${group}`)
  const outward = item ? burstPrimary(item, { hasMandate, opened: false }) === 'copyOpen' : false
  // Les touches viennent du registre (portée `rafale`) + Échap, le raccourci global.
  const burstShortcuts = shortcutsInScope('rafale')
  const escapeShortcut = shortcutById('escape')

  // La croix ferme toujours ; Échap, lui, défait d'abord l'aide puis l'édition (voir `reduceBurst`).
  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent
        ref={contentRef}
        tabIndex={-1}
        closeLabel={t('today.burst.exit')}
        onEscapeKeyDown={event => event.preventDefault()}
        // Le focus d'ouverture va au panneau lui-même, pas à la croix : sinon Entrée — le geste
        // principal de la rafale — serait celui de la croix et fermerait le panneau.
        onOpenAutoFocus={event => {
          event.preventDefault()
          contentRef.current?.focus()
        }}
        className="left-0 top-0 flex h-dvh max-h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none p-0 data-[state=closed]:slide-out-to-left-0 data-[state=closed]:slide-out-to-top-0 data-[state=open]:slide-in-from-left-0 data-[state=open]:slide-in-from-top-0"
      >
        <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[var(--bellum-border)] px-4 py-3 pr-16">
          <DialogTitle className="text-base">{t('today.burst.title', { group: groupLabel })}</DialogTitle>
          <DialogDescription className="sr-only">{t('today.burst.noMandate')}</DialogDescription>
          <div className="flex min-w-[8rem] flex-1 items-center gap-3">
            <Text
              element="span"
              size="sm"
              weight="semibold"
              className="tabular-nums"
              aria-label={t('today.burst.progressAria', {
                current: progress.current,
                total: progress.total,
                handled: progress.handled,
              })}
            >
              {t('today.burst.progress', { current: progress.current, total: progress.total })}
            </Text>
            <Progress
              value={progress.total === 0 ? 0 : Math.round((progress.handled / progress.total) * 100)}
              size="sm"
              className="flex-1"
            />
          </div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="pointer-coarse:min-h-11"
            aria-pressed={state.helpOpen}
            onClick={() => dispatch({ type: 'help' })}
          >
            <CircleHelp className="size-4" aria-hidden="true" />
            {t('today.burst.help')}
          </Button>
        </header>

        {state.helpOpen ? (
          <dl
            aria-label={t('today.burst.help')}
            className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-1 border-b border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] px-4 py-3"
          >
            {burstShortcuts.map(shortcut => (
              <div key={shortcut.id} className="contents">
                <dt>
                  <ShortcutKeys shortcut={shortcut} />
                </dt>
                <dd className="text-sm text-[var(--bellum-text-secondary)]">{tShortcuts(shortcut.labelKey)}</dd>
              </div>
            ))}
            <div className="contents">
              <dt>
                <ShortcutKeys shortcut={escapeShortcut} />
              </dt>
              <dd className="text-sm text-[var(--bellum-text-secondary)]">{tShortcuts('rafale.escape')}</dd>
            </div>
          </dl>
        ) : null}

        <div className="flex-1 overflow-y-auto px-4 py-6">
          <div className="mx-auto w-full max-w-2xl space-y-3">
            <BurstSummaryBlock summary={summary} hasMandate={hasMandate} />
            {state.finished || !item ? (
              <div role="status" className="space-y-3 py-12 text-center">
                <Text size="base" weight="semibold">
                  {t('today.burst.finished', { count: progress.handled })}
                </Text>
                <Button type="button" className="pointer-coarse:min-h-11" onClick={onClose}>
                  {t('today.burst.close')}
                </Button>
              </div>
            ) : (
              <>
                <TodayCard
                  key={item.id}
                  item={item}
                  now={now}
                  gestures={gestures}
                  members={members}
                  hasMandate={hasMandate}
                  variant="burst"
                  onSkip={onSkip}
                  onHandled={outcome => dispatch({ type: 'handled', id: item.id, outcome })}
                  onDraftChange={draft => setGenerated(current => ({ ...current, [item.id]: draft }))}
                  registerCommands={registerCommands}
                  editing={state.editing}
                  onEditingChange={editing => dispatch({ type: editing ? 'edit' : 'stopEdit' })}
                />
                {outward ? (
                  <Text size="xs" color="text-[var(--bellum-text-muted)]">
                    {t('today.burst.noMandate')}
                  </Text>
                ) : null}
              </>
            )}
          </div>
        </div>

        {!state.finished && item ? (
          <footer className="flex items-center justify-between gap-3 border-t border-[var(--bellum-border)] px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <Button
              type="button"
              variant="outline"
              className="pointer-coarse:min-h-11"
              disabled={state.index === 0}
              onClick={() => dispatch({ type: 'prev' })}
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
              {t('today.burst.prev')}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="pointer-coarse:min-h-11"
              disabled={state.index >= deck.length - 1}
              onClick={() => dispatch({ type: 'next' })}
            >
              {t('today.burst.next')}
              <ChevronRight className="size-4" aria-hidden="true" />
            </Button>
          </footer>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

/**
 * #4354.1 / #4354.2 — « Est-ce que tous ces gens vont recevoir un mail ? Qu'est-ce qu'ils envoient ?
 * Est-ce que je peux automatiser ? » (call 19/10). Le lot se dit AVANT la première validation :
 * combien d'actions, combien de personnes, par quel canal, un texte TYPE — et que rien ne part sans
 * un geste (c82). Une valeur absente ne fait aucune ligne (GA-18). « En faire une automatisation »
 * ouvre le parcours Séquences sur son déclencheur « sur signal » (décision Louis 19/10, #4357).
 */
/** F1-FIX #4354 — au-delà, la liste nominative d'un canal se replie en « + N autres ». */
const RECIPIENTS_SHOWN_PER_CHANNEL = 5

function BurstSummaryBlock({ summary, hasMandate }: { summary: BurstSummary; hasMandate: boolean }) {
  const { t } = useTranslation('actions')
  const head =
    summary.recipients === null
      ? t('today.burst.summary.count', { count: summary.total })
      : `${t('today.burst.summary.count', { count: summary.total })} · ${t('today.burst.summary.recipients', {
          count: summary.recipients,
        })}`
  return (
    <section
      aria-label={t('today.burst.summary.title')}
      className="space-y-1.5 rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] p-3"
    >
      <Text size="sm" weight="semibold">
        {head}
      </Text>
      {summary.channels.length > 0 ? (
        <ul className="space-y-1 text-sm text-[var(--bellum-text-secondary)]">
          {summary.channels.map(({ channel, count, people }) => {
            const { shown, hidden } = foldRecipients(people, RECIPIENTS_SHOWN_PER_CHANNEL)
            return (
              <li key={channel}>
                <span>{t('today.burst.summary.channel', { channel: t(`channels.${channel}`), count })}</span>
                {/* F1-FIX #4354 — QUI reçoit quoi : la liste nominative, repliée au-delà de N (le reste est compté). */}
                {shown.length > 0 ? (
                  <span data-testid={`burst-recipients-${channel}`}>
                    {' — '}
                    {shown
                      .map(person => person.name ?? person.accountName ?? t('today.burst.summary.unnamedContact'))
                      .join(', ')}
                    {hidden > 0 ? `, ${t('today.burst.summary.more', { count: hidden })}` : ''}
                  </span>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : null}
      {summary.unnamed > 0 ? (
        <Text size="xs" color="text-[var(--bellum-text-muted)]">
          {t('today.burst.summary.unnamed', { count: summary.unnamed })}
        </Text>
      ) : null}
      {summary.sample ? (
        <Text size="sm" color="text-[var(--bellum-text-secondary)]" className="line-clamp-2">
          {t('today.burst.summary.sample', { text: summary.sample.subject ?? summary.sample.body })}
        </Text>
      ) : null}
      {summary.outward > 0 ? (
        <Text size="xs" color="text-[var(--bellum-text-muted)]">
          {t('today.burst.summary.perRecipient')}{' '}
          {hasMandate ? t('today.burst.summary.underMandate') : t('today.burst.summary.noMandate')}
        </Text>
      ) : null}
      <Link
        to="/actions/sequences"
        search={{ parcours: 'signal' }}
        className="inline-flex text-sm text-[var(--bellum-text-accent)] underline underline-offset-2 pointer-coarse:min-h-11 pointer-coarse:items-center"
      >
        {t('today.burst.summary.automate')}
      </Link>
    </section>
  )
}
