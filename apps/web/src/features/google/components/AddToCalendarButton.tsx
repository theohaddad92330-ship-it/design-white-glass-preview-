import { Button } from '@bellum/ui'
import { CalendarPlus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AddToCalendarDialog } from '@/features/google/components/AddToCalendarDialog'
import { deadlineStartLocal } from '@/lib/deadline'

type AddToCalendarButtonProps = {
  /** Event title (the plan action text). */
  summary: string
  /** Extra context appended to the event description. */
  description?: string
  /**
   * L'échéance de l'action : une date calendaire `YYYY-MM-DD`, un jeton relatif
   * du plan (`J+10`), ou un libellé libre.
   *
   * ⚠️ Elle passait par `new Date(value)`, qui accepte « J+10 » et rend le
   * 1ᵉʳ octobre **2001**. Le formulaire s'ouvrait donc sur un rendez-vous en
   * 2001, déjà rempli — donc pas relu. La conversion vit désormais dans
   * {@link deadlineStartLocal}, qui refuse tout ce qu'il ne sait pas dater.
   */
  dueDate?: string | null
  /** La date qui a PRODUIT le plan (`accounts.last_analyzed_at`) : c'est elle
   *  qui donne son sens à « J+10 ». Absente, aucun jeton relatif n'est daté. */
  dueDateBase?: string | null
  /** Bellum account/contact URL appended to the event description. */
  link?: string
  contextLabel?: string
  /** #3287 (#3265.2) — l'identifiant de l'événement créé, pour le rattacher à la ligne du plan. */
  onCreated?: (eventId: string) => void
}

/**
 * Compact "Ajouter à Google Agenda" trigger for a plan action / relance. Owns its
 * own dialog state so it can be dropped into a list row's trailing slot. The dialog
 * handles the not-connected / missing-scope cases (reconnect CTA).
 */
export function AddToCalendarButton({
  summary,
  description,
  dueDate,
  dueDateBase,
  link,
  contextLabel,
  onCreated,
}: AddToCalendarButtonProps) {
  const { t } = useTranslation('google')
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        icon={CalendarPlus}
        aria-label={t('calendar.add')}
        title={t('calendar.add')}
        onClick={event => {
          event.stopPropagation()
          setOpen(true)
        }}
      />
      <AddToCalendarDialog
        open={open}
        onOpenChange={setOpen}
        initialSummary={summary}
        initialDescription={description}
        initialStartLocal={deadlineStartLocal(dueDate, dueDateBase)}
        link={link}
        contextLabel={contextLabel}
        onCreated={onCreated}
      />
    </>
  )
}
