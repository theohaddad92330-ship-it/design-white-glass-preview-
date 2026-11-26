import { delegationLifecycle, type OutreachDelegationView, type OutreachMessage } from '@bellum/contracts'
import {
  Badge,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Text,
} from '@bellum/ui'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useId, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { outreachKeys, outreachMessagesApi } from '@/features/outreach/api'
import { useMailboxStatus } from '@/features/mailbox/api'
import { formatDate } from '@/lib/locale'
import {
  useCreateOutreachDelegation,
  useDelegationAction,
  useDelegationSteps,
  useOutreachDelegations,
} from '../hooks/useOutreachDelegations'

/** Messages e-mail relisibles : ce que le mandat peut couvrir (jamais LinkedIn ni appel). */
const DELEGABLE_STATUSES = new Set(['drafted', 'needs_review', 'approved'])

export function delegableMessages(messages: readonly OutreachMessage[]): OutreachMessage[] {
  return messages.filter(m => m.channel === 'email' && DELEGABLE_STATUSES.has(m.status) && m.blockers.length === 0)
}

/** « Actif » seulement si le mandat peut agir : le mot affiché est celui du contrat. */
function lifecycleTone(lifecycle: OutreachDelegationView['lifecycle']): 'success' | 'warning' | 'outline' {
  if (lifecycle === 'active') return 'success'
  if (lifecycle === 'paused' || lifecycle === 'not_started') return 'warning'
  return 'outline'
}

/**
 * #3702.9 — DÉLÉGUER L'ENVOI : un geste explicite, borné (durée, volume, contacts,
 * fenêtre), révocable. Laura n'envoie jamais : c'est le commercial qui délègue.
 * Sans mandat, rien ne change — chaque message attend son clic.
 */
export function DelegationBlock({
  canSend,
  onCreateSequence,
}: {
  canSend: boolean
  /** #3702 (recette prod 09/10, écriture) — « aucune séquence e-mail validée »
   *  nomme le geste qui débloque : ouvrir la création d'une séquence, sans
   *  quitter l'écran. Optionnel — un appelant qui ne porte pas ce geste (il
   *  n'en existe qu'un aujourd'hui, `SequencesPage`) garde la modale muette
   *  sur cette ligne plutôt que de planter. */
  onCreateSequence?: () => void
}) {
  const { t } = useTranslation('outreach')
  const { data: all = [] } = useOutreachDelegations()
  // #4016 L5 — les mandats d'ESPACE (Laura, séquences, relances, suivi) ont leur bloc
  // (`MandateScopesBlock`) : ici, les seules campagnes — rien n'apparaît deux fois (GA-26).
  const delegations = all.filter(d => (d.scope ?? 'campaign') === 'campaign')
  const action = useDelegationAction()
  const [open, setOpen] = useState(false)

  return (
    <Box className="flex min-w-0 flex-col gap-3 rounded-xl border border-[var(--bellum-border)] p-4">
      <Box className="flex flex-wrap items-center justify-between gap-2">
        <Text size="sm" weight="medium">
          {t('delegation.title')}
        </Text>
        <Button size="sm" variant="secondary" disabled={!canSend} onClick={() => setOpen(true)}>
          {t('delegation.open')}
        </Button>
      </Box>
      <Text size="xs" className="text-[var(--bellum-text-secondary)]">
        {canSend ? t('delegation.intro') : t('delegation.noMailbox')}
      </Text>
      {delegations.length === 0 ? (
        <Text size="xs" className="text-[var(--bellum-text-muted)]">
          {t('delegation.manualOnly')}
        </Text>
      ) : (
        <Box className="flex flex-col gap-2">
          {delegations.map(d => (
            <DelegationRow key={d.id} delegation={d} onAction={vars => action.mutate(vars)} />
          ))}
        </Box>
      )}
      {open ? <DelegationDialog onOpenChange={setOpen} onCreateSequence={onCreateSequence} /> : null}
    </Box>
  )
}

/** #3702.13 — une étape encore À PARTIR (validée ou programmée) ; une étape partie n'attend plus rien. */
const PENDING_STEP_STATUSES: ReadonlySet<string> = new Set(['approved', 'scheduled'])
/** #3702.13 — les attentes qui sont des ANOMALIES à nommer sous « Active » (le reste est normal ou déjà un badge). */
const ANOMALY_HOLD_REASONS: ReadonlySet<string> = new Set([
  'mailbox_unavailable',
  'replies_unreadable',
  'sender_mismatch',
  'content_changed',
])

/**
 * #3702 (R26) — UN mandat : son état, le geste disponible, et depuis ce lot,
 * ce qu'il a ARRÊTÉ. L'arrêt sur réponse/opposition/exclusion était déjà réel
 * côté serveur (`delegationVerdict`, c89) et vérifiable par API (recette du
 * lot N06), mais jamais VISIBLE sur cet écran. `useDelegationSteps` n'est
 * interrogé que pour un mandat qui peut encore agir : un mandat révoqué ou
 * expiré n'arrête plus rien de nouveau, et la liste ne fait aucun appel pour
 * lui (GA-43 — pas de lecture qui ne sert personne).
 */
function DelegationRow({
  delegation: d,
  onAction,
}: {
  delegation: OutreachDelegationView
  onAction: (vars: { id: string; action: 'pause' | 'resume' | 'revoke' }) => void
}) {
  const { t } = useTranslation('outreach')
  const lifecycle = delegationLifecycle(d, new Date())
  const canStillAct = lifecycle === 'active' || lifecycle === 'paused' || lifecycle === 'not_started'
  const { data: steps = [] } = useDelegationSteps(d.id, canStillAct)

  // #3702 — un arrêt se compte par RAISON (réponse, opposition, exclusion) :
  // les mélanger ferait passer une exclusion pour une réponse. Jamais une
  // ligne à zéro (doctrine « on n'affiche pas ce qu'on n'a pas »).
  const stoppedByReason = new Map<string, number>()
  for (const step of steps) {
    if (step.verdict.decision !== 'stop') continue
    const already = stoppedByReason.get(step.verdict.reason)
    stoppedByReason.set(step.verdict.reason, already === undefined ? 1 : already + 1)
  }

  // #3702.13 — « Active » ne masque jamais une boîte tombée ou une lecture des
  // réponses retirée : les étapes encore à partir qui ATTENDENT pour une raison
  // d'anomalie se nomment, par raison. L'attente normale (hors fenêtre, volume)
  // n'est pas une anomalie : pas de ligne. Jamais une ligne à zéro.
  const heldByReason = new Map<string, number>()
  for (const step of steps) {
    if (step.verdict.decision !== 'awaits_validation') continue
    if (!PENDING_STEP_STATUSES.has(step.status)) continue
    if (!ANOMALY_HOLD_REASONS.has(step.verdict.reason)) continue
    const already = heldByReason.get(step.verdict.reason)
    heldByReason.set(step.verdict.reason, already === undefined ? 1 : already + 1)
  }

  return (
    <Box className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--bellum-border)] p-3">
      <Box className="flex min-w-0 flex-col gap-0.5">
        <Box className="flex items-center gap-2">
          <Text size="sm" weight="medium">
            {d.campaign_label}
          </Text>
          <Badge variant={lifecycleTone(lifecycle)}>{t(`delegation.lifecycle.${lifecycle}`)}</Badge>
        </Box>
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('delegation.summary', {
            sent: d.sent_count,
            max: d.max_messages,
            contacts: d.contact_count,
            start: d.window.start_hour,
            end: d.window.end_hour,
            date: formatDate(d.expires_at),
          })}
        </Text>
        {[...stoppedByReason.entries()].map(([reason, count]) => (
          <Text key={reason} size="xs" className="text-[var(--bellum-text-secondary)]">
            {t(`delegation.stopped.${reason}`, { count })}
          </Text>
        ))}
        {[...heldByReason.entries()].map(([reason, count]) => (
          <Text key={reason} size="xs" className="text-[var(--bellum-warning-text)]">
            {t(`delegation.held.${reason}`, { count })}
          </Text>
        ))}
      </Box>
      <Box className="flex gap-2">
        {lifecycle === 'active' ? (
          <Button size="sm" variant="ghost" onClick={() => onAction({ id: d.id, action: 'pause' })}>
            {t('delegation.pause')}
          </Button>
        ) : null}
        {lifecycle === 'paused' ? (
          <Button size="sm" variant="ghost" onClick={() => onAction({ id: d.id, action: 'resume' })}>
            {t('delegation.resume')}
          </Button>
        ) : null}
        {canStillAct ? (
          <Button size="sm" variant="ghost" onClick={() => onAction({ id: d.id, action: 'revoke' })}>
            {t('delegation.revoke')}
          </Button>
        ) : null}
      </Box>
    </Box>
  )
}

/** G.11 — un champ de la modale porte son libellé VISIBLE, relié par `htmlFor` (garde GA-32). */
function LabelledField({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-[var(--bellum-text-secondary)]">
        {label}
      </label>
      {children}
    </div>
  )
}

function DelegationDialog({
  onOpenChange,
  onCreateSequence,
}: {
  onOpenChange: (open: boolean) => void
  onCreateSequence?: () => void
}) {
  const { t } = useTranslation('outreach')
  const { data: mailbox, isLoading: mailboxLoading } = useMailboxStatus()
  const { data: all = [] } = useQuery<OutreachMessage[]>({
    queryKey: outreachKeys.messages(),
    queryFn: () => outreachMessagesApi.list(),
  })
  const candidates = useMemo(() => delegableMessages(all), [all])
  // #3702 (recette prod 09/10, écriture) — « Expéditeur : — » et « Aucun
  // message e-mail relisible » ne disaient jamais POURQUOI. Tant que la
  // messagerie n'a pas fini de répondre, on ne conclut rien (jamais un
  // repli deviné pendant le chargement) ; une fois connue, l'absence
  // d'expéditeur se lit en PREMIER — sans boîte connectée, une séquence
  // validée ne débloquerait rien non plus.
  const mailboxNotConnected = !mailboxLoading && mailbox?.connected !== true
  const noDelegableMessages = candidates.length === 0
  const create = useCreateOutreachDelegation()
  const [label, setLabel] = useState('')
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set())
  const fieldId = useId()
  const [startHour, setStartHour] = useState(9)
  const [endHour, setEndHour] = useState(18)
  const [days, setDays] = useState(7)
  const [max, setMax] = useState(20)

  const chosen = candidates.filter(m => picked.has(m.id))
  const address = mailbox?.address ?? ''
  const valid = label.trim().length > 0 && chosen.length > 0 && address.length > 0 && startHour < endHour

  const submit = () =>
    create.mutate(
      {
        campaign_label: label.trim(),
        contact_ids: [...new Set(chosen.map(m => m.contact_id))],
        channels: ['email'],
        sender_mailbox_id: address,
        window: { start_hour: startHour, end_hour: endHour },
        duration_days: days,
        max_messages: Math.min(max, chosen.length),
        messages: chosen.map(m => ({ id: m.id, version: m.current_version })),
      },
      { onSuccess: () => onOpenChange(false) },
    )

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('common:actions.close')} className="max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('delegation.dialog.title')}</DialogTitle>
          <DialogDescription>
            {mailboxNotConnected
              ? t('delegation.dialog.senderMissingReason')
              : t('delegation.dialog.recap', { sender: address || '—' })}
          </DialogDescription>
          {mailboxNotConnected ? (
            <Link
              to="/integrations"
              className="text-xs font-medium text-[var(--bellum-text-accent)] underline underline-offset-2"
            >
              {t('delegation.dialog.connectMailbox')}
            </Link>
          ) : null}
        </DialogHeader>
        <Box className="flex flex-col gap-3">
          <LabelledField id={`${fieldId}-label`} label={t('delegation.dialog.label')}>
            <Input
              id={`${fieldId}-label`}
              placeholder={t('delegation.dialog.label')}
              value={label}
              onChange={e => setLabel(e.target.value)}
            />
          </LabelledField>
          <Box className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <LabelledField id={`${fieldId}-start`} label={t('delegation.dialog.startHour')}>
              <Input
                id={`${fieldId}-start`}
                type="number"
                min={0}
                max={23}
                value={startHour}
                onChange={e => setStartHour(Number(e.target.value))}
              />
            </LabelledField>
            <LabelledField id={`${fieldId}-end`} label={t('delegation.dialog.endHour')}>
              <Input
                id={`${fieldId}-end`}
                type="number"
                min={1}
                max={24}
                value={endHour}
                onChange={e => setEndHour(Number(e.target.value))}
              />
            </LabelledField>
            <LabelledField id={`${fieldId}-days`} label={t('delegation.dialog.days')}>
              <Input
                id={`${fieldId}-days`}
                type="number"
                min={1}
                max={30}
                value={days}
                onChange={e => setDays(Number(e.target.value))}
              />
            </LabelledField>
            <LabelledField id={`${fieldId}-max`} label={t('delegation.dialog.max')}>
              <Input
                id={`${fieldId}-max`}
                type="number"
                min={1}
                max={200}
                value={max}
                onChange={e => setMax(Number(e.target.value))}
              />
            </LabelledField>
          </Box>
          <Text size="xs" className="text-[var(--bellum-text-muted)]">
            {t('delegation.dialog.bounds')}
          </Text>
          {noDelegableMessages ? (
            <Box className="flex flex-col gap-1.5">
              <Text size="sm">
                {mailboxNotConnected ? t('delegation.dialog.noneMailbox') : t('delegation.dialog.noneSequence')}
              </Text>
              {mailboxNotConnected ? (
                <Link
                  to="/integrations"
                  className="text-xs font-medium text-[var(--bellum-text-accent)] underline underline-offset-2"
                >
                  {t('delegation.dialog.connectMailbox')}
                </Link>
              ) : onCreateSequence ? (
                <Button size="sm" variant="ghost" className="w-fit" onClick={onCreateSequence}>
                  {t('delegation.dialog.createSequence')}
                </Button>
              ) : null}
            </Box>
          ) : (
            <Box className="flex max-h-56 flex-col gap-1 overflow-auto">
              {candidates.map(m => (
                <label key={m.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={picked.has(m.id)}
                    onCheckedChange={checked => {
                      const next = new Set(picked)
                      if (checked) next.add(m.id)
                      else next.delete(m.id)
                      setPicked(next)
                    }}
                    aria-label={m.contact_name ?? m.id}
                  />
                  <span>
                    {m.contact_name ?? t('delegation.dialog.unnamed')} — {m.subject ?? ''}
                  </span>
                </label>
              ))}
            </Box>
          )}
          <Text size="xs" className="text-[var(--bellum-text-secondary)]">
            {t('delegation.dialog.stops')}
          </Text>
        </Box>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('common:actions.cancel')}
          </Button>
          <Button disabled={!valid || create.isPending} onClick={submit}>
            {t('delegation.dialog.validate')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
