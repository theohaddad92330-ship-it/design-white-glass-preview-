import { Button, Input, Text, TooltipButton } from '@bellum/ui'
import { Plus, PencilLine, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { PlanAction } from '../../helpers/plan'

export function AddPlanActionForm({
  onAdd,
}: {
  onAdd: (action: PlanAction, objective: string, expectedOutcome: string) => void
}) {
  const { t } = useTranslation('accountDetail')
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [responsable, setResponsable] = useState('')
  // #2871 (#2395.8) — l'objectif est OBLIGATOIRE à la création : sans lui,
  // l'action est une tâche dont personne ne sait à quoi elle sert.
  const [objective, setObjective] = useState('')
  // #2395.8 — le RÉSULTAT ATTENDU l'est aussi (« à quoi ressemble fait ? »), jamais un verbe seul.
  const [expectedOutcome, setExpectedOutcome] = useState('')

  const submit = () => {
    const actionText = text.trim()
    const actionObjective = objective.trim()
    const actionOutcome = expectedOutcome.trim()
    if (!actionText || !actionObjective || !actionOutcome) return
    onAdd(
      {
        text: actionText,
        responsable: responsable.trim() || undefined,
        outil: 'manuel',
      },
      actionObjective,
      actionOutcome,
    )
    setText('')
    setObjective('')
    setExpectedOutcome('')
    setResponsable('')
    setOpen(false)
  }

  if (!open) {
    return (
      <div className=" px-5 py-4">
        <Button
          type="button"
          variant="black"
          size="sm"
          fullWidth
          onClick={() => setOpen(true)}
          icon={Plus}
          className="justify-center"
        >
          {t('planForm.addButton')}
        </Button>
      </div>
    )
  }

  return (
    <form
      className=" bg-[var(--bellum-bg-lighter)] px-5 py-4"
      onSubmit={event => {
        event.preventDefault()
        submit()
      }}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <Text size="sm" weight="semibold">
            {t('planForm.title')}
          </Text>
          <Text size="xs" className="mt-1 text-[var(--bellum-text-secondary)]">
            {t('planForm.subtitle')}
          </Text>
        </div>
        <TooltipButton
          tooltip={t('common:actions.close')}
          type="button"
          variant="ghost"
          size="xs"
          onClick={() => setOpen(false)}
          aria-label={t('common:actions.close')}
        >
          <X className="size-4" />
        </TooltipButton>
      </div>
      <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_200px_auto] lg:items-center">
        <label className="grid gap-1.5">
          <Text size="xs" weight="medium" className="sr-only">
            {t('planForm.actionLabel')}
          </Text>
          <Input
            value={text}
            onChange={event => setText(event.target.value)}
            placeholder={t('planForm.actionPlaceholder')}
            className="bg-[var(--bellum-bg)]"
          />
        </label>
        <label className="grid gap-1.5">
          <Text size="xs" weight="medium" className="sr-only">
            {t('planForm.objectiveLabel')}
          </Text>
          <Input
            value={objective}
            onChange={event => setObjective(event.target.value)}
            placeholder={t('planForm.objectivePlaceholder')}
            required
            className="bg-[var(--bellum-bg)]"
          />
        </label>
        <label className="grid gap-1.5">
          <Text size="xs" weight="medium" className="sr-only">
            {t('planForm.expectedOutcomeLabel')}
          </Text>
          <Input
            value={expectedOutcome}
            onChange={event => setExpectedOutcome(event.target.value)}
            placeholder={t('planForm.expectedOutcomePlaceholder')}
            required
            className="bg-[var(--bellum-bg)]"
          />
        </label>
        <label className="grid gap-1.5">
          <Text size="xs" weight="medium" className="sr-only">
            {t('planForm.ownerLabel')}
          </Text>
          <Input
            value={responsable}
            onChange={event => setResponsable(event.target.value)}
            placeholder={t('planForm.ownerPlaceholder')}
            className="bg-[var(--bellum-bg)]"
          />
        </label>
        <Button
          type="submit"
          variant="black"
          disabled={!text.trim() || !objective.trim() || !expectedOutcome.trim()}
          icon={PencilLine}
          className="lg:min-w-32"
        >
          {t('common:actions.add')}
        </Button>
      </div>
      {/* #2395.8 — le message NOMME ce qui manque ; « Ajouter » reste inactif tant que l'un des deux manque. */}
      {text.trim() && (!objective.trim() || !expectedOutcome.trim()) ? (
        <Text role="alert" size="xs" className="mt-2 text-[var(--danger-soft-text)]">
          {!objective.trim() ? t('planForm.objectiveRequired') : t('planForm.expectedOutcomeRequired')}
        </Text>
      ) : null}
    </form>
  )
}
