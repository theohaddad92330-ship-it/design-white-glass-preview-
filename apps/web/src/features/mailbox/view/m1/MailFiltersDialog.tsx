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
  Input,
  SelectField,
} from '@bellum/ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

export type MailFilters = {
  /** #3718 — restreint aux échanges avec cette adresse ou ce domaine. */
  counterpart: string
  /** Silence minimum avant de compter un fil « sans réponse » (`silenceDays` du contrat) ; `null` = indifférent. */
  silenceDays: number | null
  unreadOnly: boolean
}

const SILENCE_CHOICES = [3, 7, 14] as const

/**
 * Théo B m1 — « Filtrer les échanges ». Un critère n'apparaît qu'UNE fois : l'intention vit dans sa rangée de puces,
 * le compte dans « Tous les comptes », le mot-clé dans la recherche ; ici, ce qui reste — l'interlocuteur, le silence
 * minimum (m1.A2) et « seulement les non lus ».
 */
export function MailFiltersDialog({
  open,
  onOpenChange,
  value,
  onApply,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  value: MailFilters
  onApply: (next: MailFilters) => void
}) {
  const { t } = useTranslation('mailbox')
  const [draft, setDraft] = useState<MailFilters>(value)

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        if (next) setDraft(value)
        onOpenChange(next)
      }}
    >
      <DialogContent closeLabel={t('common:actions.close')}>
        <DialogHeader>
          <DialogTitle>{t('filtersDialog.title')}</DialogTitle>
          <DialogDescription>{t('filtersDialog.description')}</DialogDescription>
        </DialogHeader>
        <form
          id="mailbox-filters-form"
          className="flex flex-col gap-4"
          onSubmit={event => {
            event.preventDefault()
            onApply({ ...draft, counterpart: draft.counterpart.trim() })
            onOpenChange(false)
          }}
        >
          <label className="flex flex-col gap-1 text-sm font-medium">
            {t('filters.counterpart')}
            <Input
              value={draft.counterpart}
              onChange={event => setDraft(previous => ({ ...previous, counterpart: event.target.value }))}
            />
          </label>
          <Box className="flex flex-col gap-1 text-sm font-medium">
            {t('filters.silenceDays')}
            <SelectField
              ariaLabel={t('filters.silenceDays')}
              value={draft.silenceDays ? String(draft.silenceDays) : undefined}
              onChange={next => setDraft(previous => ({ ...previous, silenceDays: next ? Number(next) : null }))}
              emptyOption={{ label: t('filtersDialog.silenceAny') }}
              options={SILENCE_CHOICES.map(days => ({
                value: String(days),
                label: t('filtersDialog.silenceChoice', { count: days }),
              }))}
            />
          </Box>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <Checkbox
              checked={draft.unreadOnly}
              onCheckedChange={checked => setDraft(previous => ({ ...previous, unreadOnly: checked === true }))}
            />
            {t('filtersDialog.unreadOnly')}
          </label>
        </form>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="min-h-11" onClick={() => onOpenChange(false)}>
            {t('draft.cancel')}
          </Button>
          <Button type="submit" form="mailbox-filters-form" className="min-h-11">
            {t('filtersDialog.apply')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
