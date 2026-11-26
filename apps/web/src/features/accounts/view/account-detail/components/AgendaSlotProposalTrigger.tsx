import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActionDialog, Button, Text } from '@bellum/ui'
import { CalendarClock } from 'lucide-react'
import { toast } from 'sonner'
import type { AgendaSlotProposalPreview } from '@bellum/contracts'
import { useConfirmSlotProposal, usePreviewSlotProposal, useRejectSlotProposal } from '@/features/briefing/api'

type AgendaSlotProposalTriggerProps = {
  accountId: string
  companyName: string
  /**
   * #4507 — mode PILOTÉ : « Planifier un créneau » vit dans le menu « … » de l'en-tête du dossier, qui ouvre
   * la fenêtre lui-même. Fourni, le composant ne rend plus son propre bouton et lance l'aperçu à l'ouverture.
   */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

/**
 * #2770 (#2101.19/.21/.22/.30/.37/.40) — LA PORTE D'ÉCRITURE D'UN CRÉNEAU
 * PROPOSÉ, SON PREMIER APPELANT RÉEL.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE COMPOSANT NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * L'épopée #2770 nomme un moteur qui écrit des suggestions sur TOUT l'agenda
 * et les distingue visuellement sur la grille/le plateau partagés
 * (`AgendaGrid`/`AgendaBoard`). Ce composant ne le construit pas — voir le
 * docblock de `agenda-slot-proposal.ts` pour la raison. La distinction
 * (.19/.21/.22/.37) vit ICI, dans l'écran qui a posé le geste : avant
 * confirmation, la carte est explicitement une PRÉVISUALISATION FIGÉE ;
 * après, un état « confirmé, proposé par BellumAI » distinct, jamais une
 * ligne qui ressemblerait à un rendez-vous ordinaire.
 *
 * `previewSlotProposal` ne calcule ni n'écrit rien de plus qu'un aperçu — un
 * refus déjà posé AUJOURD'HUI pour ce compte (#2101.40) le dit avant même de
 * chercher un créneau. `confirmSlotProposal` écrit EXACTEMENT ce que l'aperçu
 * a montré, sur ce clic — jamais un recalcul, jamais seul.
 */
export function AgendaSlotProposalTrigger({
  accountId,
  companyName,
  open: controlledOpen,
  onOpenChange,
}: AgendaSlotProposalTriggerProps) {
  const { t, i18n } = useTranslation('accounts')
  const [ownOpen, setOwnOpen] = useState(false)
  const controlled = controlledOpen !== undefined
  const open = controlled ? controlledOpen : ownOpen
  const setOpen = (next: boolean) => (controlled ? onOpenChange?.(next) : setOwnOpen(next))
  const [confirmedAt, setConfirmedAt] = useState<string | null>(null)
  const [rejected, setRejected] = useState(false)

  const preview = usePreviewSlotProposal()
  const confirm = useConfirmSlotProposal()
  const reject = useRejectSlotProposal()

  const summary = t('slotProposal.defaultSummary', { company: companyName })

  const startPreview = () => {
    setConfirmedAt(null)
    setRejected(false)
    preview.mutate({ accountId })
  }
  const openAndPreview = () => {
    setOpen(true)
    startPreview()
  }
  // Mode piloté : l'aperçu part quand l'appelant ouvre la fenêtre, une fois par ouverture.
  const wasOpen = useRef(false)
  useEffect(() => {
    if (controlled && open && !wasOpen.current) startPreview()
    wasOpen.current = open
  }, [controlled, open])

  const onConfirm = (data: Extract<AgendaSlotProposalPreview, { status: 'ready' }>) => {
    confirm.mutate(
      { accountId, title: summary, start: data.slot.start, end: data.slot.end },
      {
        onSuccess: () => setConfirmedAt(data.slot.start),
        onError: (error: Error) => toast.error(error.message || t('slotProposal.confirmError')),
      },
    )
  }

  const onReject = () => {
    reject.mutate(accountId, {
      onSuccess: () => setRejected(true),
      onError: (error: Error) => toast.error(error.message || t('slotProposal.rejectError')),
    })
  }

  return (
    <ActionDialog
      open={open}
      onOpenChange={next => setOpen(next)}
      icon={CalendarClock}
      title={t('slotProposal.title')}
      description={t('slotProposal.description', { company: companyName })}
      triggerButton={
        controlled ? undefined : (
          // #3279 — un GESTE, pas une puce : icône nommée (le libellé reste le
          // nom accessible, lu par les lecteurs d'écran et en infobulle).
          <Button type="button" size="icon" variant="ghost" title={t('slotProposal.trigger')} onClick={openAndPreview}>
            <CalendarClock className="size-4" aria-hidden />
            <span className="sr-only">{t('slotProposal.trigger')}</span>
          </Button>
        )
      }
      footer={<CloseOnly onClose={() => setOpen(false)} t={t} />}
      content={
        <AgendaSlotProposalBody
          isLoading={preview.isPending}
          isError={preview.isError}
          data={preview.data}
          confirmedAt={confirmedAt}
          rejected={rejected}
          summary={summary}
          confirmPending={confirm.isPending}
          rejectPending={reject.isPending}
          language={i18n.language}
          onConfirm={onConfirm}
          onReject={onReject}
        />
      }
    />
  )
}

function CloseOnly({ onClose, t }: { onClose: () => void; t: ReturnType<typeof useTranslation<'accounts'>>['t'] }) {
  return (
    <Button type="button" variant="outline" onClick={onClose}>
      {t('slotProposal.close')}
    </Button>
  )
}

function AgendaSlotProposalBody({
  isLoading,
  isError,
  data,
  confirmedAt,
  rejected,
  summary,
  confirmPending,
  rejectPending,
  language,
  onConfirm,
  onReject,
}: {
  isLoading: boolean
  isError: boolean
  data: AgendaSlotProposalPreview | undefined
  confirmedAt: string | null
  rejected: boolean
  summary: string
  confirmPending: boolean
  rejectPending: boolean
  language: string
  onConfirm: (data: Extract<AgendaSlotProposalPreview, { status: 'ready' }>) => void
  onReject: () => void
}) {
  const { t } = useTranslation('accounts')

  if (confirmedAt) {
    return (
      <div className="space-y-1.5" data-testid="slot-proposal-confirmed">
        <Text size="sm" weight="medium" className="text-[var(--success-soft-text)]">
          {t('slotProposal.confirmedBadge')}
        </Text>
        <Text size="sm">{t('slotProposal.confirmedAt', { date: formatSlot(confirmedAt, language) })}</Text>
      </div>
    )
  }

  if (rejected) {
    return (
      <Text size="sm" color="text-[var(--bellum-text-secondary)]">
        {t('slotProposal.rejectedNote')}
      </Text>
    )
  }

  if (isLoading) return <Text size="sm">{t('slotProposal.searching')}</Text>
  if (isError) return <Text size="sm">{t('slotProposal.previewError')}</Text>
  if (!data) return null

  if (data.status === 'suppressed') {
    return <Text size="sm">{t('slotProposal.suppressed')}</Text>
  }
  if (data.status === 'no_slot') {
    return <Text size="sm">{t('slotProposal.noSlot')}</Text>
  }

  return (
    <div className="space-y-3" data-testid="slot-proposal-preview">
      {/* #2101.19/.21/.22/.37 — la distinction : ce n'est pas un rendez-vous,
          c'est une PRÉVISUALISATION FIGÉE, nommée comme telle. */}
      <Text size="xs" weight="semibold" className="uppercase tracking-wide text-[var(--accent-soft-text)]">
        {t('slotProposal.previewBadge')}
      </Text>
      <Text size="sm" weight="medium">
        {summary}
      </Text>
      <Text size="sm">{formatSlot(data.slot.start, language, data.slot.end)}</Text>
      {/* #2101.30 — la CONSÉQUENCE, nommée, jamais tue. */}
      <Text size="xs" color="text-[var(--bellum-text-secondary)]">
        {t('slotProposal.consequence', { minutes: data.consequence.freeMinutesConsumed })}
      </Text>
      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={confirmPending} onClick={() => onConfirm(data)}>
          {t('slotProposal.confirm')}
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={rejectPending} onClick={onReject}>
          {t('slotProposal.reject')}
        </Button>
      </div>
    </div>
  )
}

function formatSlot(startIso: string, language: string, endIso?: string): string {
  const start = new Date(startIso)
  if (Number.isNaN(start.getTime())) return startIso
  const dateLabel = new Intl.DateTimeFormat(language, { weekday: 'short', day: 'numeric', month: 'short' }).format(
    start,
  )
  const startTime = new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit' }).format(start)
  if (!endIso) return `${dateLabel} · ${startTime}`
  const end = new Date(endIso)
  if (Number.isNaN(end.getTime())) return `${dateLabel} · ${startTime}`
  const endTime = new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit' }).format(end)
  return `${dateLabel} · ${startTime}–${endTime}`
}
