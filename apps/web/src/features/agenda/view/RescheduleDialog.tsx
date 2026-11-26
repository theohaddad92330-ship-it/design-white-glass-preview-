import type { AgendaEvent } from '@bellum/contracts'
import {
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Text,
} from '@bellum/ui'
import { Info } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  guestCount,
  parseTimeInputValue,
  proposalTimeInputValue,
  withStartMinutes,
  type DragProposal,
} from '../agenda-drag'
import { agendaEventTitle } from '../agenda-view'

/**
 * La confirmation d'un déplacement — le seul écrit de l'agenda qui touche
 * l'agenda de QUELQU'UN D'AUTRE.
 *
 * Déplacer un rendez-vous à trois envoie trois vraies notifications à trois
 * vraies personnes. Un glisser-déposer se déclenche d'un geste, parfois par
 * accident : sans cette étape, un frôlement de souris préviendrait un client
 * d'un changement d'horaire qui n'a jamais été voulu.
 *
 * Le dialogue montre donc l'AVANT et l'APRÈS, dit combien de personnes seront
 * prévenues, et laisse choisir — sauf quand le fournisseur ne laisse pas le
 * choix, auquel cas il le dit au lieu d'afficher une case qui mentirait.
 */
export function RescheduleDialog({
  event,
  proposal,
  language,
  canStaySilent,
  pending,
  onConfirm,
  onCancel,
  onProposalChange,
}: {
  event: AgendaEvent | null
  proposal: DragProposal | null
  language: string
  /** Le fournisseur sait-il déplacer sans prévenir les invités ? */
  canStaySilent: boolean
  pending: boolean
  onConfirm: (notifyGuests: boolean) => void
  onCancel: () => void
  /**
   * #2938 — le créneau HORS GRILLE : ce dialogue n'a pas de grille calendrier
   * sous les yeux (`ConflictDialog`) ou la proposition par défaut ne convient
   * pas (`AgendaBoard`) — ce callback laisse TAPER une autre heure de départ,
   * la durée conservée (`withStartMinutes`). L'appelant tient l'état, comme le
   * reste de la proposition.
   */
  onProposalChange: (proposal: DragProposal) => void
}) {
  const { t } = useTranslation('briefing')
  const [notifyGuests, setNotifyGuests] = useState(true)

  // À chaque nouveau geste, on repart de « prévenir ». Le silence est un choix
  // délibéré, jamais un reste du déplacement précédent.
  useEffect(() => {
    if (event) setNotifyGuests(true)
  }, [event])

  if (!event || !proposal) return null

  const guests = guestCount(event)
  const time = new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit' })
  const day = new Intl.DateTimeFormat(language, { weekday: 'long', day: 'numeric', month: 'long' })
  const asTime = (minutes: number) => time.format(new Date(2000, 0, 1, Math.floor(minutes / 60), minutes % 60))

  const before =
    event.start && event.end ? `${time.format(new Date(event.start))} → ${time.format(new Date(event.end))}` : ''
  // La case est cochée ET désactivée quand le fournisseur prévient toujours :
  // ce qui est affiché est ce qui va se passer.
  const effectiveNotify = canStaySilent ? notifyGuests : true

  return (
    <Dialog open onOpenChange={open => (open ? undefined : onCancel())}>
      <DialogContent closeLabel={t('common:actions.close')} className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('agenda.reschedule.title')}</DialogTitle>
          <DialogDescription>
            {agendaEventTitle(event, { busy: t('agenda.grid.busy'), untitled: t('agenda.grid.untitled') })}
          </DialogDescription>
        </DialogHeader>

        <Box className="flex flex-col gap-3 px-1">
          <Box className="flex flex-col gap-1 rounded-lg bg-[var(--bellum-surface-2)] p-3">
            <Text size="xs" className="text-[var(--bellum-text-secondary)]">
              {event.start ? day.format(new Date(event.start)) : ''}
            </Text>
            {/* L'AVANT reste affiché : c'est ce qui permet de reconnaître un
                geste involontaire avant de le confirmer. */}
            <Text size="sm" className="text-[var(--bellum-text-secondary)] line-through">
              {before}
            </Text>
            {/* #2938 — le créneau HORS GRILLE : la proposition par défaut
                (« juste après l'autre rendez-vous ») se TAPE différemment ici,
                aucune grille calendrier sous les yeux pour la glisser. La durée
                ne bouge jamais — seul le départ se retape. */}
            <Box className="flex flex-wrap items-center gap-2">
              {/* Théo A today-agenda.A2 — reprogrammer par la modale : le JOUR
                  se choisit aussi (le glisser d'un jour à l'autre n'existe plus
                  dans la liste). Vide = le jour du rendez-vous. */}
              <input
                type="date"
                value={proposal.date ?? ''}
                onChange={e => onProposalChange({ ...proposal, ...(e.target.value ? { date: e.target.value } : {}) })}
                aria-label={t('agenda.reschedule.dateLabel')}
                className="pointer-coarse:min-h-11 rounded-md border border-[var(--bellum-border)] bg-transparent px-2 py-1 text-sm text-[color:var(--bellum-text-primary)] focus:outline-none"
              />
              <input
                type="time"
                value={proposalTimeInputValue(proposal.startMinutes)}
                onChange={e => {
                  const minutes = parseTimeInputValue(e.target.value)
                  if (minutes !== null) onProposalChange(withStartMinutes(proposal, minutes))
                }}
                aria-label={t('agenda.reschedule.timeLabel')}
                className="pointer-coarse:min-h-11 rounded-md border border-[var(--bellum-border)] bg-transparent px-2 py-1 text-sm font-semibold text-[color:var(--bellum-text-primary)] focus:outline-none"
              />
              <Text size="sm" weight="semibold" className="text-[var(--bellum-text-primary)]">
                → {asTime(proposal.endMinutes)}
              </Text>
            </Box>
          </Box>

          {guests.total > 0 ? (
            <>
              <Text size="sm" className="text-[var(--bellum-text-secondary)]">
                {t('agenda.reschedule.guests', { count: guests.total })}
                {guests.external > 0 ? ` · ${t('agenda.reschedule.externals', { count: guests.external })}` : ''}
              </Text>
              <label className="flex items-start gap-2">
                <Checkbox
                  checked={effectiveNotify}
                  disabled={!canStaySilent}
                  onCheckedChange={checked => setNotifyGuests(checked === true)}
                  aria-label={t('agenda.reschedule.notify')}
                />
                <Text size="sm" className="text-[var(--bellum-text-primary)]">
                  {t('agenda.reschedule.notify')}
                </Text>
              </label>
              {!canStaySilent ? (
                <Text size="xs" className="flex items-start gap-1.5 text-[var(--bellum-text-muted)]">
                  <Info className="mt-0.5 size-3 shrink-0" />
                  {t('agenda.reschedule.alwaysNotifies')}
                </Text>
              ) : null}
            </>
          ) : (
            // Personne à prévenir : pas de case, pas de question. Une case
            // inutile fait hésiter sur un geste sans conséquence.
            <Text size="sm" className="text-[var(--bellum-text-secondary)]">
              {t('agenda.reschedule.noGuests')}
            </Text>
          )}
        </Box>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={pending}>
            {t('agenda.reschedule.cancel')}
          </Button>
          <Button onClick={() => onConfirm(effectiveNotify)} disabled={pending}>
            {t('agenda.reschedule.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
