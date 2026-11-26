import { useState } from 'react'
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@bellum/ui'
import { Archive, Check, ClipboardCheck, Clock, Copy, MoreHorizontal, Upload, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { outcomesForTargetKind } from '@bellum/contracts'
import type { ActionExecutionStatus, ActionPlanOutcome, ActionTargetKind } from '@bellum/contracts'
import type { WorkspaceMember } from '@/features/chat/hooks/useWorkspaceMembers'
import { useColleagueContactGuard } from '@/features/team-guardrails/components/ColleagueContactDialog'
import { CallbackDateDialog } from './CallbackDateDialog'

const SNOOZE_DAYS = [1, 3, 7]

type ActionCrmExport = {
  /** Runs the real CRM export (only wired when a member/contact is exportable). */
  onExport: () => void
  /** Whether a CRM is actually connected — gates the item's enabled state. */
  connected: boolean
  /** Tooltip shown when the item is disabled (e.g. "CRM non connecté"). */
  disabledReason?: string
}

type ActionExecuteMenuProps = {
  /** Lifecycle state — drives the "fait" checkmark. Undefined when the action is
   *  not a persisted plan item (e.g. the cockpit recommendation). */
  status?: ActionExecutionStatus
  /**
   * #2396.2 — marquer fait EXIGE l'issue choisie (le serveur la refuse sinon) :
   * le geste ouvre un sous-menu d'issues plutôt que d'écrire directement.
   * Annuler un « fait » (repasser à `todo`) ne redemande rien — ce n'est pas une
   * complétion. Omettre `onMarkDone` rend l'item désactivé avec `lifecycleHint`.
   */
  onMarkDone?: (outcome: ActionPlanOutcome, extra?: { callbackDate: string }) => void
  /** Repasse l'action à `todo` — seulement affiché quand `status === 'done'`. */
  onUndoDone?: () => void
  /** #2396.6 — adapte les issues proposées au type d'action visée. */
  targetKind?: ActionTargetKind | null
  /** #2123.37 — marquer l'action « Préparée ». Omis : le geste n'apparaît pas. */
  onMarkPrepared?: () => void
  /**
   * #2317.12 — marquer l'action « Obsolète » (un changement de poste, de
   * scope ou de besoin la rend caduque) : elle est MARQUÉE, jamais supprimée
   * silencieusement. Bascule : rappelé sur une action déjà obsolète, il la
   * remet « à faire ». Omis : le geste n'apparaît pas.
   */
  onMarkObsolete?: () => void
  /** Snooze by N days. Omit to disable the snooze submenu. */
  onSnooze?: (days: number) => void
  /** Assign to a workspace member. Omit to disable the assign submenu. */
  onAssign?: (userId: string) => void
  members?: WorkspaceMember[]
  assignedTo?: string | null
  /** Reason (native tooltip) when fait/snooze/assign are unavailable here. */
  lifecycleHint?: string
  /** The ready-to-send message copied to the clipboard. Omit/empty to disable. */
  copyText?: string | null
  /** CRM export config. Omit entirely to hide the item. */
  crm?: ActionCrmExport
  /**
   * #4158.21/.22 — le contact visé par l'action. S'il est posé, copier le message ou
   * marquer l'action faite passe d'abord par la garde « déjà contacté par un
   * collègue / ne pas contacter » : un avertissement avec confirmation, jamais un
   * blocage. Omis : aucun changement de comportement.
   */
  contactId?: string | null
  /** Accessible label for the trigger. */
  triggerLabel?: string
  align?: 'start' | 'end'
}

/**
 * The "executable action" menu (Théo P1/P2 — "les actions doivent être
 * exécutables : fait, snooze, assigner, exporter CRM, copier le message. Pas
 * seulement des listes."). One reusable menu wired differently per surface:
 * the persisted plan rows wire the full lifecycle; the cockpit recommendation
 * wires copy + CRM and leaves the persisted-only actions disabled with a hint.
 *
 * A capability with no handler renders disabled (never faked): the CRM item is
 * disabled with its `disabledReason` when no CRM is connected rather than
 * pretending to export.
 */
export function ActionExecuteMenu({
  status,
  onMarkDone,
  onUndoDone,
  targetKind = null,
  onMarkPrepared,
  onMarkObsolete,
  onSnooze,
  onAssign,
  members = [],
  assignedTo = null,
  lifecycleHint,
  copyText,
  crm,
  contactId = null,
  triggerLabel,
  align = 'end',
}: ActionExecuteMenuProps) {
  const { t } = useTranslation('actions')
  const guard = useColleagueContactGuard(contactId)
  const [open, setOpen] = useState(false)
  // #3416.2b — « À rappeler » pose d'abord la question de la date (facultative).
  const [callbackOpen, setCallbackOpen] = useState(false)

  const canCopy = !!copyText && copyText.trim().length > 0
  const canAssign = !!onAssign && members.length > 0
  const crmEnabled = !!crm?.connected

  // #4158.21 — marquer « fait » est un geste de contact déclaré : même garde que la copie.
  const markDone: ActionExecuteMenuProps['onMarkDone'] = onMarkDone
    ? (outcome, extra) => guard.run(() => (extra ? onMarkDone(outcome, extra) : onMarkDone(outcome)))
    : undefined

  const copyMessage = async () => {
    if (!canCopy) return
    try {
      await navigator.clipboard.writeText(copyText ?? '')
      toast.success(t('toast.messageCopied'))
    } catch {
      toast.error(t('toast.messageCopyFailed'))
    }
  }

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            icon={MoreHorizontal}
            aria-label={triggerLabel ?? t('executeMenu.triggerLabel')}
            onClick={event => event.stopPropagation()}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align={align} className="w-56" onClick={event => event.stopPropagation()}>
          <DropdownMenuLabel>{t('executeMenu.menuLabel')}</DropdownMenuLabel>

          {status === 'done' ? (
            // #2396.2 — annuler un « fait » ne redemande pas d'issue : ce n'est
            // pas une complétion, c'est son retrait (#2396.10, déjà là ailleurs).
            <DropdownMenuItem
              disabled={!onUndoDone}
              title={!onUndoDone ? lifecycleHint : undefined}
              onSelect={() => onUndoDone?.()}
            >
              <Check className="mr-2 size-4 text-[var(--success-soft-text)]" />
              {t('executeMenu.markDoneUndo')}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger disabled={!onMarkDone} title={!onMarkDone ? lifecycleHint : undefined}>
                <Check className="mr-2 size-4" />
                {t('executeMenu.markDone')}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {outcomesForTargetKind(targetKind).map(outcome => (
                  <DropdownMenuItem
                    key={outcome}
                    onSelect={() => (outcome === 'callback_scheduled' ? setCallbackOpen(true) : markDone?.(outcome))}
                  >
                    {t(`outcome.${outcome}`)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}

          {onMarkPrepared ? (
            <DropdownMenuItem onSelect={() => onMarkPrepared()}>
              <ClipboardCheck className="mr-2 size-4" />
              {t('executeMenu.markPrepared')}
              {status === 'prepared' ? <Check className="ml-auto size-4 text-[var(--success-soft-text)]" /> : null}
            </DropdownMenuItem>
          ) : null}

          {onMarkObsolete ? (
            <DropdownMenuItem onSelect={() => onMarkObsolete()}>
              <Archive className="mr-2 size-4" />
              {status === 'obsolete' ? t('executeMenu.unmarkObsolete') : t('executeMenu.markObsolete')}
              {status === 'obsolete' ? <Check className="ml-auto size-4 text-[var(--warning-soft-text)]" /> : null}
            </DropdownMenuItem>
          ) : null}

          {onSnooze ? (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Clock className="mr-2 size-4" />
                {t('executeMenu.snooze')}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {SNOOZE_DAYS.map(days => (
                  <DropdownMenuItem key={days} onSelect={() => onSnooze(days)}>
                    {t('executeMenu.snoozeDays', { count: days })}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ) : (
            <DropdownMenuItem disabled title={lifecycleHint}>
              <Clock className="mr-2 size-4" />
              {t('executeMenu.snooze')}
            </DropdownMenuItem>
          )}

          {canAssign ? (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <UserPlus className="mr-2 size-4" />
                {t('executeMenu.assignTo')}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="max-h-64 overflow-y-auto">
                {members.map(member => {
                  const name = member.fullName ?? member.email ?? t('executeMenu.memberFallback')
                  return (
                    <DropdownMenuItem key={member.userId} onSelect={() => onAssign?.(member.userId)}>
                      {name}
                      {member.isSelf ? (
                        <span className="ml-1 text-[var(--bellum-text-muted)]">{t('executeMenu.selfSuffix')}</span>
                      ) : null}
                      {assignedTo === member.userId ? (
                        <Check className="ml-auto size-4 text-[var(--success-soft-text)]" />
                      ) : null}
                    </DropdownMenuItem>
                  )
                })}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ) : (
            <DropdownMenuItem disabled title={onAssign ? t('executeMenu.noAssignees') : lifecycleHint}>
              <UserPlus className="mr-2 size-4" />
              {t('executeMenu.assignTo')}
            </DropdownMenuItem>
          )}

          <DropdownMenuSeparator />

          <DropdownMenuItem
            disabled={!canCopy}
            onSelect={() => {
              // #4158.21/.22 — copier un message pour un contact que l'espace connaît déjà
              // demande d'abord une confirmation.
              guard.run(() => {
                void copyMessage()
              })
            }}
          >
            <Copy className="mr-2 size-4" />
            {t('executeMenu.copyMessage')}
          </DropdownMenuItem>

          {crm ? (
            <DropdownMenuItem
              disabled={!crmEnabled}
              title={!crmEnabled ? (crm.disabledReason ?? t('executeMenu.crmNotConnected')) : undefined}
              onSelect={() => crm.onExport()}
            >
              <Upload className="mr-2 size-4" />
              {t('executeMenu.crmExport')}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <CallbackDateDialog
        open={callbackOpen}
        onOpenChange={setCallbackOpen}
        onConfirm={date =>
          date ? markDone?.('callback_scheduled', { callbackDate: date }) : markDone?.('callback_scheduled')
        }
      />
      {guard.dialog}
    </>
  )
}
