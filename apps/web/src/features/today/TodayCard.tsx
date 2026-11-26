import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { toast } from 'sonner'
import { AlarmClock, Check, ExternalLink, Loader2, MoreHorizontal, Pencil, Send, UserCheck, X } from 'lucide-react'
import { outcomesForTargetKind } from '@bellum/contracts'
import type { ActionPlanOutcome } from '@bellum/contracts'
import {
  Button,
  Card,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
  Text,
  Textarea,
  cn,
} from '@bellum/ui'
import { ApprovalTraceLine } from '@/features/action-os/view/ApprovalTraceLine'
import { CallbackDateDialog } from '@/features/actions/components/CallbackDateDialog'
import type { WorkspaceMember } from '@/features/chat/hooks/useWorkspaceMembers'
import { formatDate } from '@/lib/locale'
import { assignableMembers } from '../action-os/approvalRouting'
import { burstPrimary, type BurstPrimary } from './burst'
import { buildCopyOpen } from './copyOpen'
import { PlanMailBlock } from './PlanMailBlock'
import { canGenerateMail } from './planMail'
import { GROUP_ICON } from './todayIcons'
import { dueDate, postponeChoices, sectionOfDue, toLocalDayKey } from './todayDates'
import type { TodayItem } from './todayQueue'
import { CALL_OUTCOMES, type CallOutcome, declarableChannel, type useTodayGestures } from './useTodayGestures'

/**
 * Lot L-A (#4164) — LA CARTE RICHE de la file « Aujourd'hui ».
 *
 * Une carte dit QUI (compte + contact, en liens), POURQUOI MAINTENANT (le signal
 * ou « Étape 2/5 · DSI grands comptes »), CE QUI PARTIRAIT (le brouillon, deux
 * lignes, dépliable), QUAND (l'échéance), et offre les gestes de SA maison
 * native en ligne : Valider / Modifier / Copier et ouvrir / Fait / Reporter /
 * Passer. Un geste que la maison ne sait pas faire n'est pas grisé : il n'existe
 * pas (une absence ne fait aucune ligne).
 *
 * Doctrine (c82) : aucun bouton d'ici n'envoie un message à lui seul. « Valider »
 * un message le met en état `approved` ; « Copier et ouvrir » met le brouillon
 * dans le presse-papiers et ouvre la messagerie — le commercial envoie.
 *
 * « Aucun collègue à qui confier » ne se répète plus sur chaque carte : il se dit
 * UNE fois, quand on essaie de confier (toast à identifiant fixe).
 */

type Gestures = ReturnType<typeof useTodayGestures>

export type TodayCardCommands = {
  /** Entrée dans la rafale : le geste principal de la carte. */
  primary: () => void
  postpone: () => void
  skip: () => void
  edit: () => void
}

export function TodayCard({
  item,
  now,
  gestures,
  members,
  hasMandate,
  variant = 'list',
  onSkip,
  onHandled,
  onDraftChange,
  registerCommands,
  editing: editingProp,
  onEditingChange,
  postponeOpen: postponeOpenProp,
  onPostponeOpenChange,
}: {
  item: TodayItem
  now: Date
  gestures: Gestures
  members: readonly WorkspaceMember[]
  hasMandate: boolean
  variant?: 'list' | 'burst'
  onSkip: (item: TodayItem) => void
  /** Appelé APRÈS un geste abouti — la rafale n'avance que là-dessus. */
  onHandled?: (outcome: 'done' | 'validated' | 'postponed' | 'skipped') => void
  /** #4521.3 — rafale : le brouillon généré à la demande remonte au panneau (la carte, elle, reste sans état de brouillon). */
  onDraftChange?: (draft: TodayItem['draft']) => void
  registerCommands?: (commands: TodayCardCommands) => void
  editing?: boolean
  onEditingChange?: (editing: boolean) => void
  postponeOpen?: boolean
  onPostponeOpenChange?: (open: boolean) => void
}) {
  const { t } = useTranslation('actions')
  const burst = variant === 'burst'
  const pending = gestures.isPending(item)

  const [expanded, setExpanded] = useState(false)
  const [editingLocal, setEditingLocal] = useState(false)
  const [postponeLocal, setPostponeLocal] = useState(false)
  const [opened, setOpened] = useState(false)
  const [doneMenuOpen, setDoneMenuOpen] = useState(false)
  const [callbackOpen, setCallbackOpen] = useState(false)
  const editing = editingProp ?? editingLocal
  const setEditing = onEditingChange ?? setEditingLocal
  const postponeOpen = postponeOpenProp ?? postponeLocal
  const setPostponeOpen = onPostponeOpenChange ?? setPostponeLocal

  const Icon = GROUP_ICON[item.group]
  const section = sectionOfDue(item.dueAt, now)
  const due = dueDate(item.dueAt)
  const dueLabel = due ? formatDate(due, { day: '2-digit', month: 'short' }) : null
  const copyOpen = useMemo(() => buildCopyOpen(item), [item])
  // #4521.3 — « Générer le mail » : rafale seulement, carte e-mail du plan dont le contact est résolu.
  const mailBlock = burst && !!onDraftChange && canGenerateMail(item)
  const kindLabel = item.kindKey ? t(`center.${item.kindKey}`) : null
  const fullDraft = burst || item.mustReadInFull
  const markSentChannel = declarableChannel(item)
  const needsOutcomeMenu = item.kind === 'plan_item' || item.kind === 'call_task'
  const primary: BurstPrimary | null = burstPrimary(item, { hasMandate, opened })
  // En rafale, le geste d'Entrée est le bouton plein ; les autres restent en contour.
  // #4163 LF — en liste, UN seul bouton primaire par carte ; le reste vit dans « Autres gestes » (la rafale garde tout).
  const listMode = !burst
  const listPrimary: BurstPrimary | null = primary ?? (item.gestures.validate ? 'validate' : null)
  const showAs = (kind: BurstPrimary): boolean => !listMode || listPrimary === kind
  const variantFor = (kind: BurstPrimary): 'default' | 'outline' => {
    if (burst && primary === kind) return 'default'
    return 'outline'
  }

  const doValidate = useCallback(async () => {
    if (await gestures.validate(item)) onHandled?.('validated')
  }, [gestures, item, onHandled])

  const doCopyOpen = useCallback(async () => {
    if (!copyOpen) return
    try {
      await navigator.clipboard.writeText(copyOpen.text)
      toast.success(t('today.toast.copied'))
    } catch {
      toast.error(t('today.toast.copyFailed'))
    }
    window.open(copyOpen.href, '_blank', 'noopener,noreferrer')
    setOpened(true)
  }, [copyOpen, t])

  const doComplete = useCallback(
    async (choice?: Parameters<Gestures['complete']>[1]) => {
      if (await gestures.complete(item, choice)) onHandled?.('done')
    },
    [gestures, item, onHandled],
  )

  const doPostpone = useCallback(
    async (day: string) => {
      setPostponeOpen(false)
      if (await gestures.postpone(item, day)) onHandled?.('postponed')
    },
    [gestures, item, onHandled, setPostponeOpen],
  )

  const doSkip = useCallback(() => {
    onSkip(item)
    onHandled?.('skipped')
  }, [item, onHandled, onSkip])

  // La rafale pilote la carte au clavier : elle ne connaît que ces quatre commandes.
  useEffect(() => {
    registerCommands?.({
      primary: () => {
        if (primary === 'validate') void doValidate()
        else if (primary === 'copyOpen') void doCopyOpen()
        else if (primary === 'done') {
          if (needsOutcomeMenu) setDoneMenuOpen(true)
          else void doComplete()
        }
      },
      postpone: () => item.gestures.postpone && setPostponeOpen(true),
      skip: doSkip,
      edit: () => item.gestures.edit && setEditing(true),
    })
  }, [
    registerCommands,
    primary,
    doValidate,
    doCopyOpen,
    doComplete,
    doSkip,
    needsOutcomeMenu,
    item.gestures,
    setPostponeOpen,
    setEditing,
  ])

  // #4163 LF — « Autres gestes » : tout ce qui n'est pas le geste principal de la carte, en liste.
  const delegateOptions = assignableMembers(members)
  const canDelegate = item.kind === 'approval' || item.kind === 'crm_write' || item.kind === 'erp_write'
  const moreTrigger = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="pointer-coarse:min-h-11 pointer-coarse:min-w-11"
          disabled={pending}
          aria-label={t('today.card.more', { title: item.title })}
        >
          <MoreHorizontal className="size-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        onCloseAutoFocus={event => {
          // Reporter ouvre le choix de date : le focus appartient à ce choix, pas au bouton « ⋯ ».
          if (postponeOpen) event.preventDefault()
        }}
      >
        {item.gestures.validate && listPrimary !== 'validate' ? (
          <DropdownMenuItem onSelect={() => void doValidate()}>{validateLabel(t, item)}</DropdownMenuItem>
        ) : null}
        {copyOpen && listPrimary !== 'copyOpen' ? (
          <DropdownMenuItem onSelect={() => void doCopyOpen()}>{t('today.card.copyOpen')}</DropdownMenuItem>
        ) : null}
        {item.gestures.done && listPrimary !== 'done' ? (
          needsOutcomeMenu ? (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>{t('today.card.done')}</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {item.kind === 'plan_item'
                  ? outcomesForTargetKind(item.targetKind).map(outcome => (
                      <DropdownMenuItem
                        key={outcome}
                        onSelect={() =>
                          outcome === 'callback_scheduled' ? setCallbackOpen(true) : void doComplete({ outcome })
                        }
                      >
                        {t(`outcome.${outcome}`)}
                      </DropdownMenuItem>
                    ))
                  : CALL_OUTCOMES.map((callOutcome: CallOutcome) => (
                      <DropdownMenuItem key={callOutcome} onSelect={() => void doComplete({ callOutcome })}>
                        {t(`callStatus.${callOutcome}`, { ns: 'outreach' })}
                      </DropdownMenuItem>
                    ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ) : (
            <DropdownMenuItem onSelect={() => void doComplete()}>{t('today.card.done')}</DropdownMenuItem>
          )
        ) : null}
        {!burst && markSentChannel ? (
          <DropdownMenuItem onSelect={() => void gestures.markSent(item)}>
            {t('center.relances.markSent')}
          </DropdownMenuItem>
        ) : null}
        {item.gestures.edit && (item.draft || item.detail) && !editing ? (
          <DropdownMenuItem onSelect={() => setEditing(true)}>{t('today.card.edit')}</DropdownMenuItem>
        ) : null}
        {item.gestures.reject ? (
          <DropdownMenuItem
            onSelect={async () => {
              if (await gestures.reject(item)) onHandled?.('done')
            }}
          >
            {item.kind === 'playbook_send' ? t('center.playbookSend.discard') : t('center.reject')}
          </DropdownMenuItem>
        ) : null}
        {item.gestures.postpone ? (
          <DropdownMenuItem onSelect={() => setPostponeOpen(true)}>{t('today.card.postpone')}</DropdownMenuItem>
        ) : null}
        {canDelegate ? (
          delegateOptions.length === 0 ? (
            <DropdownMenuItem
              onSelect={() => toast.info(t('center.routing.noColleague'), { id: 'today-no-colleague' })}
            >
              {t('today.card.delegate')}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>{t('today.card.delegate')}</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {delegateOptions.map(option => (
                  <DropdownMenuItem key={option.value} onSelect={() => void gestures.assign(item, option.value)}>
                    {option.label}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuItem onSelect={() => void gestures.assign(item, null)}>
                  {t('center.routing.assignNobody')}
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )
        ) : null}
        <DropdownMenuItem onSelect={doSkip}>{t('today.card.skip')}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
  const moreMenu = item.gestures.postpone ? (
    <PostponeMenu
      anchored
      now={now}
      title={item.title}
      disabled={pending}
      open={postponeOpen}
      onOpenChange={setPostponeOpen}
      onPick={day => void doPostpone(day)}
    >
      <span className="inline-flex">{moreTrigger}</span>
    </PostponeMenu>
  ) : (
    moreTrigger
  )

  return (
    <Card className={cn('p-3', burst && 'p-5')} data-slot="today-card" data-kind={item.kind}>
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 size-4 shrink-0 text-[var(--bellum-text-accent)]" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          {kindLabel ? (
            <Text size="xs" weight="medium" color="text-[var(--warning-soft-text)]">
              {kindLabel}
            </Text>
          ) : null}
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            {item.detail ? null : (
              <Text size={burst ? 'base' : 'sm'} weight="semibold" className="min-w-0 whitespace-pre-wrap break-words">
                {item.title}
              </Text>
            )}
            <Text
              size="xs"
              element="span"
              weight="medium"
              className="ml-auto shrink-0 tabular-nums"
              color={section === 'overdue' ? 'text-[var(--danger-soft-text)]' : 'text-[var(--bellum-text-muted)]'}
            >
              {dueLabel
                ? section === 'overdue'
                  ? t('today.card.overdue', { date: dueLabel })
                  : t('today.card.dueOn', { date: dueLabel })
                : item.group === 'validate'
                  ? null
                  : t('today.card.noDue')}
            </Text>
          </div>

          {item.originKey ? (
            <Text size="xs" color="text-[var(--bellum-text-muted)]">
              {t(`center.crm.origin.${item.originKey}`)}
            </Text>
          ) : null}

          <WhoLine item={item} />
          <SignalLine item={item} />
          <WhyLine item={item} />

          {item.body ? (
            <Text
              size="sm"
              color="text-[var(--bellum-text-secondary)]"
              className="mt-1 whitespace-pre-wrap break-words"
            >
              {item.body}
            </Text>
          ) : null}

          {item.detail && !(editing && item.kind === 'crm_write') ? (
            <ul className="mt-1 space-y-0.5">
              {item.detail.map(line => (
                <li key={line.key ?? line.label}>
                  {/* Le diff champ par champ, tel que le serveur l'a FIGÉ à la demande : ancienne → nouvelle valeur
                      quand l'ancienne est connue, la nouvelle seule sinon (jamais « vide » deviné). */}
                  <Text size="sm">
                    <span className="text-[var(--bellum-text-secondary)]">{line.label}</span> —{' '}
                    {line.previous == null ? (
                      line.value
                    ) : (
                      <>
                        <span className="text-[var(--bellum-text-muted)] line-through">{line.previous}</span>
                        {' → '}
                        {line.value}
                      </>
                    )}
                  </Text>
                </li>
              ))}
            </ul>
          ) : null}

          {editing && item.kind === 'crm_write' && item.detail ? (
            <CrmEditor
              lines={item.detail}
              pending={pending}
              onCancel={() => setEditing(false)}
              onSave={async changes => {
                if (await gestures.reviseCrm(item, changes)) setEditing(false)
              }}
            />
          ) : null}

          {item.kind === 'crm_write' && item.risk ? (
            <Text size="xs" color="text-[var(--bellum-text-muted)]" className="mt-1">
              {t(`center.consequence.${item.risk}`)}
            </Text>
          ) : null}
          {item.sourceKey ? (
            <Text size="xs" color="text-[var(--bellum-text-muted)]" className="mt-1">
              {t(`center.source.${item.sourceKey}`, { defaultValue: '' })}
            </Text>
          ) : null}

          {item.expiresAt ? (
            <Text size="xs" color="text-[var(--bellum-text-muted)]" className="mt-1">
              {t('center.expiresAt', { date: formatDate(new Date(item.expiresAt)) })}
            </Text>
          ) : null}

          {item.blockedReason ? (
            <Text size="xs" color="text-[var(--bellum-warning-text)]" className="mt-1">
              {item.kind === 'erp_write'
                ? item.blockedReason
                : t('today.card.blocked', { reason: blockedLabel(t, item.blockedReason) })}
            </Text>
          ) : null}

          {item.draft && !editing && !mailBlock ? (
            <div className="mt-2 rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] p-2">
              {item.draft.subject ? (
                <Text size="xs" weight="semibold" className="break-words">
                  {item.draft.subject}
                </Text>
              ) : null}
              <Text
                size="xs"
                color="text-[var(--bellum-text-secondary)]"
                className={cn('whitespace-pre-line break-words', !(expanded || fullDraft) && 'line-clamp-2')}
              >
                {item.draft.body}
              </Text>
              {!fullDraft && item.draft.body.length > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-1 h-auto px-1 py-0.5 pointer-coarse:min-h-11"
                  aria-expanded={expanded}
                  onClick={() => setExpanded(open => !open)}
                >
                  {expanded ? t('today.card.draftHide') : t('today.card.draftShow')}
                </Button>
              ) : null}
            </div>
          ) : null}

          {mailBlock ? (
            <PlanMailBlock item={item} draft={item.draft} onDraftChange={draft => onDraftChange?.(draft)} />
          ) : null}

          {editing && item.draft && item.kind === 'message' ? (
            <DraftEditor
              draft={item.draft}
              pending={pending}
              onCancel={() => setEditing(false)}
              onSave={async draft => {
                if (await gestures.saveDraft(item, draft)) setEditing(false)
              }}
            />
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {item.gestures.validate && showAs('validate') ? (
          <Button
            type="button"
            size="sm"
            className="pointer-coarse:min-h-11"
            disabled={pending}
            variant={variantFor('validate')}
            onClick={() => void doValidate()}
          >
            {pending ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Check className="size-3.5" aria-hidden="true" />
            )}
            {validateLabel(t, item)}
          </Button>
        ) : null}

        {copyOpen && showAs('copyOpen') ? (
          <Button
            type="button"
            size="sm"
            className="pointer-coarse:min-h-11"
            disabled={pending}
            variant={variantFor('copyOpen')}
            onClick={() => void doCopyOpen()}
          >
            <ExternalLink className="size-3.5" aria-hidden="true" />
            {t('today.card.copyOpen')}
          </Button>
        ) : null}

        {burst && item.gestures.edit && (item.draft || item.detail) && !editing ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="pointer-coarse:min-h-11"
            disabled={pending}
            onClick={() => setEditing(true)}
          >
            <Pencil className="size-3.5" aria-hidden="true" />
            {t('today.card.edit')}
          </Button>
        ) : null}

        {item.gestures.done && showAs('done') ? (
          needsOutcomeMenu ? (
            <>
              <DropdownMenu open={doneMenuOpen} onOpenChange={setDoneMenuOpen}>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    className="pointer-coarse:min-h-11"
                    disabled={pending}
                    variant={variantFor('done')}
                    aria-label={t('today.card.doneAria', { title: item.title })}
                    title={t(markSentChannel ? 'today.card.doneHintFollowUps' : 'today.card.doneHint')}
                  >
                    <Check className="size-3.5" aria-hidden="true" />
                    {t('today.card.done')}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {item.kind === 'plan_item'
                    ? outcomesForTargetKind(item.targetKind).map(outcome => (
                        <DropdownMenuItem
                          key={outcome}
                          onSelect={() =>
                            outcome === 'callback_scheduled' ? setCallbackOpen(true) : void doComplete({ outcome })
                          }
                        >
                          {t(`outcome.${outcome}`)}
                        </DropdownMenuItem>
                      ))
                    : CALL_OUTCOMES.map((callOutcome: CallOutcome) => (
                        <DropdownMenuItem key={callOutcome} onSelect={() => void doComplete({ callOutcome })}>
                          {t(`callStatus.${callOutcome}`, { ns: 'outreach' })}
                        </DropdownMenuItem>
                      ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <CallbackDateDialog
                open={callbackOpen}
                onOpenChange={setCallbackOpen}
                onConfirm={callbackDate =>
                  void doComplete({ outcome: 'callback_scheduled' as ActionPlanOutcome, callbackDate })
                }
              />
            </>
          ) : (
            <Button
              type="button"
              size="sm"
              className="pointer-coarse:min-h-11"
              disabled={pending}
              variant={variantFor('done')}
              aria-label={t('today.card.doneAria', { title: item.title })}
              title={t(markSentChannel ? 'today.card.doneHintFollowUps' : 'today.card.doneHint')}
              onClick={() => void doComplete()}
            >
              <Check className="size-3.5" aria-hidden="true" />
              {t('today.card.done')}
            </Button>
          )
        ) : null}

        {burst && markSentChannel ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="pointer-coarse:min-h-11"
            disabled={pending}
            title={t('center.relances.markSentTooltip')}
            onClick={() => void gestures.markSent(item)}
          >
            <Send className="size-3.5" aria-hidden="true" />
            {t('center.relances.markSent')}
          </Button>
        ) : null}

        {burst && item.gestures.reject ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="pointer-coarse:min-h-11"
            disabled={pending}
            onClick={async () => {
              if (await gestures.reject(item)) onHandled?.('done')
            }}
          >
            <X className="size-3.5" aria-hidden="true" />
            {item.kind === 'playbook_send' ? t('center.playbookSend.discard') : t('center.reject')}
          </Button>
        ) : null}

        {burst && item.gestures.postpone ? (
          <PostponeMenu
            now={now}
            title={item.title}
            disabled={pending}
            open={postponeOpen}
            onOpenChange={setPostponeOpen}
            onPick={day => void doPostpone(day)}
          />
        ) : null}

        {burst && (item.kind === 'approval' || item.kind === 'crm_write' || item.kind === 'erp_write') ? (
          <DelegateMenu item={item} members={members} gestures={gestures} disabled={pending} />
        ) : null}

        {burst ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="pointer-coarse:min-h-11"
            disabled={pending}
            onClick={doSkip}
          >
            {t('today.card.skip')}
          </Button>
        ) : (
          moreMenu
        )}
      </div>
    </Card>
  )
}

/** Compte + contact, en liens : l'on ouvre la fiche sans quitter le geste (nouvel onglet natif). */
function WhoLine({ item }: { item: TodayItem }) {
  const { t } = useTranslation('actions')
  const linkClass =
    'underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)] rounded-sm'
  const parts = [
    item.accountName ? (
      item.accountId ? (
        <Link key="account" to="/accounts/$id" params={{ id: item.accountId }} className={linkClass}>
          {item.accountName}
        </Link>
      ) : (
        <span key="account">{item.accountName}</span>
      )
    ) : null,
    item.contactName ? (
      item.contactId ? (
        <Link key="contact" to="/contacts/$id" params={{ id: item.contactId }} className={linkClass}>
          {item.contactName}
        </Link>
      ) : (
        <span key="contact">{item.contactName}</span>
      )
    ) : null,
    // #4521.1 — la fonction du contact se lit à côté de son nom (jamais seule, jamais répétée quand elle tient lieu de nom).
    item.contactName &&
    item.contactRole &&
    item.contactRole.trim().toLowerCase() !== item.contactName.trim().toLowerCase() ? (
      <span key="role">{item.contactRole}</span>
    ) : null,
  ].filter(Boolean)
  // #4521.1 — une action du plan sans destinataire nommé le DIT sur la carte (jamais un tiret muet, jamais un nom deviné).
  if (item.source === 'plan' && !item.contactName) {
    parts.push(
      <span key="no-recipient" data-testid="today-no-recipient">
        {t('today.card.noRecipient')}
      </span>,
    )
  }
  if (parts.length === 0) return null
  return (
    <Text
      size="xs"
      color="text-[var(--bellum-text-secondary)]"
      className="mt-0.5 flex flex-wrap items-center gap-x-1.5"
    >
      {parts.map((part, index) => (
        <span key={index} className="inline-flex items-center gap-x-1.5">
          {index > 0 ? <span aria-hidden="true">·</span> : null}
          {part}
        </span>
      ))}
    </Text>
  )
}

/**
 * #4521.2 — le signal qui motive la carte, sur UNE ligne dédiée (« Signal · Repli de CA : 72,4 M€ → 69,1 M€ »), avec sa
 * date si elle est connue. Aucune ligne quand la carte n'en porte pas : on n'affiche pas ce qu'on n'a pas.
 */
function SignalLine({ item }: { item: TodayItem }) {
  const { t } = useTranslation('actions')
  if (!item.signal) return null
  const when = item.signal.at ? new Date(item.signal.at) : null
  const date = when && !Number.isNaN(when.getTime()) ? formatDate(when, { day: '2-digit', month: 'short' }) : null
  return (
    <Text
      size="xs"
      color="text-[var(--bellum-text-secondary)]"
      className="mt-0.5 break-words"
      data-testid="today-signal"
    >
      {date
        ? t('today.card.signalDated', { text: item.signal.text, date })
        : t('today.card.signal', { text: item.signal.text })}
    </Text>
  )
}

/** « Pourquoi maintenant » : l'étape de séquence, le déclencheur, ou la raison écrite. Rien sinon. */
function WhyLine({ item }: { item: TodayItem }) {
  const { t } = useTranslation('actions')
  const why = item.why
  if (!why) return null
  // #2200.14 / #2200.21 — la trace (qui a déclenché + prochaine étape) passe par le composant PARTAGÉ.
  if (why.kind === 'trace') {
    return (
      <ApprovalTraceLine
        trace={{ triggeredByName: why.triggeredByName, trigger: why.trigger }}
        nextStepKey={why.nextStepKey}
      />
    )
  }
  const text =
    why.kind === 'step'
      ? t('today.card.step', { position: why.position, total: why.total, name: why.sequenceName })
      : why.kind === 'origin'
        ? why.accountName
          ? t(`today.card.origin.${why.origin}WithAccount`, { account: why.accountName, defaultValue: '' }) ||
            t(`today.card.origin.${why.origin}`)
          : t(`today.card.origin.${why.origin}`)
        : why.kind === 'trigger'
          ? t(`center.trace.trigger.${why.trigger}`, { defaultValue: '' })
          : why.text
  if (!text) return null
  return (
    <Text size="xs" color="text-[var(--bellum-text-muted)]" className="mt-0.5 break-words">
      {text}
    </Text>
  )
}

/** « Approuver » pour une demande, « Envoyer » pour une relance qui part, « Valider » pour un message. */
function validateLabel(t: (key: string) => string, item: TodayItem): string {
  if (item.kind === 'playbook_send') return t('center.playbookSend.send')
  if (item.kind === 'approval' || item.kind === 'crm_write' || item.kind === 'erp_write') return t('center.approve')
  return t('today.card.validate')
}

/** Corriger avant d'autoriser : ne crée PAS une écriture en place — une demande NEUVE, figée à son tour. */
function CrmEditor({
  lines,
  pending,
  onSave,
  onCancel,
}: {
  lines: { label: string; value: string; previous: string | null; key: string | null }[]
  pending: boolean
  onSave: (changes: Record<string, string>) => void
  onCancel: () => void
}) {
  const { t } = useTranslation('actions')
  const [edited, setEdited] = useState<Record<string, string>>({})
  return (
    <div className="mt-1 space-y-2">
      <ul className="space-y-1">
        {lines.map(line => (
          <li key={line.key ?? line.label}>
            {line.key ? (
              <label className="flex items-center gap-2">
                <Text size="sm" className="shrink-0 text-[var(--bellum-text-secondary)]">
                  {line.label}
                </Text>
                <input
                  className="min-w-0 flex-1 rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] px-2 py-1 text-sm"
                  defaultValue={line.value}
                  onChange={event => {
                    const key = line.key as string
                    setEdited(previous => ({ ...previous, [key]: event.target.value }))
                  }}
                />
              </label>
            ) : (
              <Text size="sm">
                <span className="text-[var(--bellum-text-secondary)]">{line.label}</span> — {line.value}
              </Text>
            )}
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          className="pointer-coarse:min-h-11"
          disabled={pending}
          onClick={() => onSave(edited)}
        >
          {t('today.card.save')}
        </Button>
        <Button type="button" size="sm" variant="ghost" className="pointer-coarse:min-h-11" onClick={onCancel}>
          {t('today.card.cancel')}
        </Button>
      </div>
    </div>
  )
}

function blockedLabel(t: (key: string, options?: Record<string, unknown>) => string, reason: string): string {
  const label = t(`approval.blocker.${reason}`, { ns: 'outreach', defaultValue: '' })
  return label || t('center.erp.cannotDecide')
}

function DraftEditor({
  draft,
  pending,
  onSave,
  onCancel,
}: {
  draft: { subject: string | null; body: string }
  pending: boolean
  onSave: (draft: { subject: string | null; body: string }) => void
  onCancel: () => void
}) {
  const { t } = useTranslation('actions')
  const [subject, setSubject] = useState(draft.subject ?? '')
  const [body, setBody] = useState(draft.body)
  const subjectId = useId()
  const bodyId = useId()
  return (
    <div className="mt-2 space-y-2">
      {draft.subject !== null ? (
        <div className="space-y-1">
          <label htmlFor={subjectId} className="text-xs font-medium text-[var(--bellum-text-secondary)]">
            {t('today.card.subject')}
          </label>
          <input
            id={subjectId}
            value={subject}
            onChange={event => setSubject(event.target.value)}
            className="w-full rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] px-2 py-1.5 text-sm"
          />
        </div>
      ) : null}
      <div className="space-y-1">
        <label htmlFor={bodyId} className="text-xs font-medium text-[var(--bellum-text-secondary)]">
          {t('today.card.body')}
        </label>
        <Textarea
          id={bodyId}
          value={body}
          rows={7}
          autoFocus
          onChange={event => setBody(event.target.value)}
          className="text-sm"
        />
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          className="pointer-coarse:min-h-11"
          disabled={pending || body.trim().length === 0}
          onClick={() => onSave({ subject: draft.subject === null ? null : subject, body })}
        >
          {t('today.card.save')}
        </Button>
        <Button type="button" size="sm" variant="ghost" className="pointer-coarse:min-h-11" onClick={onCancel}>
          {t('today.card.cancel')}
        </Button>
      </div>
    </div>
  )
}

function PostponeMenu({
  now,
  title,
  disabled,
  open,
  onOpenChange,
  onPick,
  anchored = false,
  children,
}: {
  /** Le choix de date s'ancre sur le bouton « Autres gestes » au lieu d'avoir son propre bouton. */
  anchored?: boolean
  children?: React.ReactNode
  now: Date
  title: string
  disabled: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (day: string) => void
}) {
  const { t } = useTranslation('actions')
  const choices = postponeChoices(now)
  const [custom, setCustom] = useState('')
  const dateId = useId()
  const tomorrow = choices[0]?.date ?? toLocalDayKey(now)
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      {anchored ? (
        <PopoverAnchor asChild>{children}</PopoverAnchor>
      ) : (
        <PopoverTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="pointer-coarse:min-h-11"
            disabled={disabled}
            aria-label={t('today.card.postponeAria', { title })}
          >
            <AlarmClock className="size-3.5" aria-hidden="true" />
            {t('today.card.postpone')}
          </Button>
        </PopoverTrigger>
      )}
      <PopoverContent align="start" className="w-64 space-y-2 p-3">
        <div className="flex flex-col gap-1">
          {choices.map(choice => (
            <Button
              key={choice.key}
              type="button"
              size="sm"
              variant="ghost"
              className="justify-between pointer-coarse:min-h-11"
              onClick={() => onPick(choice.date)}
            >
              <span>{t(`today.card.${choice.key}`)}</span>
              <span className="tabular-nums text-[var(--bellum-text-muted)]">
                {formatDate(new Date(`${choice.date}T00:00:00`), { day: '2-digit', month: 'short' })}
              </span>
            </Button>
          ))}
        </div>
        <form
          className="space-y-1 border-t border-[var(--bellum-border)] pt-2"
          onSubmit={event => {
            event.preventDefault()
            if (custom) onPick(custom)
          }}
        >
          <label htmlFor={dateId} className="text-xs font-medium text-[var(--bellum-text-secondary)]">
            {t('today.card.pickDate')}
          </label>
          <input
            id={dateId}
            type="date"
            min={tomorrow}
            value={custom}
            onChange={event => setCustom(event.target.value)}
            className="w-full rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] px-2 py-1.5 text-sm"
          />
          <Button type="submit" size="sm" className="w-full pointer-coarse:min-h-11" disabled={!custom}>
            {t('today.card.pickDateApply')}
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  )
}

/**
 * Confier — le CIRCUIT d'une demande, jamais son contenu. Sans collègue à qui
 * confier, on le DIT une seule fois, au moment où l'on essaie : plus une ligne
 * répétée sur chaque carte.
 */
function DelegateMenu({
  item,
  members,
  gestures,
  disabled,
}: {
  item: TodayItem
  members: readonly WorkspaceMember[]
  gestures: Gestures
  disabled: boolean
}) {
  const { t } = useTranslation('actions')
  const options = assignableMembers(members)
  if (options.length === 0) {
    return (
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="pointer-coarse:min-h-11"
        disabled={disabled}
        aria-label={t('today.card.delegateAria', { title: item.title })}
        onClick={() => toast.info(t('center.routing.noColleague'), { id: 'today-no-colleague' })}
      >
        <UserCheck className="size-3.5" aria-hidden="true" />
        {t('today.card.delegate')}
      </Button>
    )
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="pointer-coarse:min-h-11"
          disabled={disabled}
          aria-label={t('today.card.delegateAria', { title: item.title })}
        >
          <UserCheck className="size-3.5" aria-hidden="true" />
          {t('today.card.delegate')}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {options.map(option => (
          <DropdownMenuItem key={option.value} onSelect={() => void gestures.assign(item, option.value)}>
            {option.label}
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem onSelect={() => void gestures.assign(item, null)}>
          {t('center.routing.assignNobody')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
