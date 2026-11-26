import { Button } from '@bellum/ui'
import { CalendarPlus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { OutlookScheduleDialog } from '@/features/microsoft/components/OutlookScheduleDialog'
import { deadlineStartLocal } from '@/lib/deadline'

type OutlookScheduleButtonProps = {
  /** Event title (the plan action text). */
  summary: string
  /** Extra context appended to the event body. */
  description?: string
  /** L'échéance de l'action — date calendaire, jeton relatif ou libellé libre.
   *  Voir {@link deadlineStartLocal} : elle passait par `new Date()`, qui datait
   *  « J+10 » au 1ᵉʳ octobre **2001**. */
  dueDate?: string | null
  /** La date qui a PRODUIT le plan : sans elle, aucun jeton relatif n'est daté. */
  dueDateBase?: string | null
  contextLabel?: string
  /** #3287 (#3265.2) — l'identifiant de l'événement créé, pour le rattacher à la ligne du plan. */
  onCreated?: (eventId: string) => void
}

/**
 * Compact "Planifier dans Outlook" trigger for a plan action / relance (mirror of
 * {@link AddToCalendarButton}). Owns its own dialog state so it can drop into a
 * list row's trailing slot; the dialog handles the not-connected case.
 */
export function OutlookScheduleButton({
  summary,
  description,
  dueDate,
  dueDateBase,
  contextLabel,
  onCreated,
}: OutlookScheduleButtonProps) {
  const { t } = useTranslation('microsoft')
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        icon={CalendarPlus}
        aria-label={t('calendar.buttonAria')}
        title={t('calendar.buttonAria')}
        onClick={event => {
          event.stopPropagation()
          setOpen(true)
        }}
      />
      <OutlookScheduleDialog
        open={open}
        onOpenChange={setOpen}
        initialSummary={summary}
        initialDescription={description}
        initialStartLocal={deadlineStartLocal(dueDate, dueDateBase)}
        contextLabel={contextLabel}
        onCreated={onCreated}
      />
    </>
  )
}
