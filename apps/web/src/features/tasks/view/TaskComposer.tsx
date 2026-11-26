import type { TaskPriority } from '@bellum/contracts'
import { dayKey } from '@bellum/contracts'
import {
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  SelectField,
  Text,
  Textarea,
} from '@bellum/ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useWorkspaceMembers } from '@/features/chat/hooks/useWorkspaceMembers'

type TaskDraft = {
  title: string
  details?: string
  dueOn: string
  priority: TaskPriority
  /** #2105.26 — absent = à celui qui crée. Jamais deviné autrement (même
   *  règle que le service, voir `task.ts`). */
  ownerId?: string
  /** #2395.8 (épopée #2871), seconde moitié — « à quoi ressemble fait ? »,
   *  distinct de `details`. Requis au même titre que `objective` : le bouton
   *  reste inactif tant qu'il est vide. */
  expectedResult: string
  /** #2395.8 (épopée #2871) — POURQUOI cette tâche. Requis : le bouton reste
   *  inactif tant qu'il est vide, même règle que le titre. */
  objective: string
}

/** Raccourcis d'échéance. Une date se tape en trois clics ou pas du tout. */
const SHORTCUTS = [
  { key: 'today', offset: 0 },
  { key: 'tomorrow', offset: 1 },
  { key: 'nextWeek', offset: 7 },
] as const

function shift(offset: number): string {
  const date = new Date()
  date.setDate(date.getDate() + offset)
  return dayKey(date)
}

/**
 * Le formulaire de création de tâche — partagé entre le dialogue (`TaskComposer`) et
 * la feuille de la fiche contact (#4135), pour ne pas écrire deux fois les champs requis.
 *
 * L'échéance est PRÉ-REMPLIE à aujourd'hui et le champ est requis : une tâche
 * sans date ne remonte dans aucune vue, donc n'est jamais faite. Proposer un
 * champ vide et refuser à la validation ferait perdre la saisie ; proposer
 * « aujourd'hui » modifiable la garde.
 */
export function TaskComposerForm({
  onCancel,
  onSubmit,
  isPending,
  initialTitle,
}: {
  onCancel: () => void
  onSubmit: (draft: TaskDraft) => void
  isPending: boolean
  initialTitle?: string
}) {
  const { t } = useTranslation('tasks')
  const [title, setTitle] = useState(initialTitle ?? '')
  const [details, setDetails] = useState('')
  const [dueOn, setDueOn] = useState(shift(0))
  const [priority, setPriority] = useState<TaskPriority>('normal')
  // #2105.26 — '' = absent = à celui qui crée. Jamais deviné autrement.
  const [ownerId, setOwnerId] = useState('')
  // #2395.8 (épopée #2871), seconde moitié — « à quoi ressemble fait ? ».
  // Requis, jamais deviné.
  const [expectedResult, setExpectedResult] = useState('')
  // #2395.8 (épopée #2871) — POURQUOI cette tâche. Requis, jamais deviné.
  const [objective, setObjective] = useState('')
  // #2105.26 — les mêmes membres que tout autre « attribuer à… » du produit
  // (`AccountAssignSubmenu`, `AssignSelectionDialog`) : un seul chemin de
  // lecture pour « qui peut porter une tâche ».
  const members = useWorkspaceMembers().data ?? []

  // #2395.8 — Créer désactivé NOMME le champ requis manquant (jamais un bouton muet).
  const missingFields = [
    title.trim().length === 0 ? 'title' : null,
    dueOn.length === 0 ? 'due' : null,
    objective.trim().length === 0 ? 'objective' : null,
    expectedResult.trim().length === 0 ? 'expectedResult' : null,
  ].filter((field): field is string => field !== null)

  const submit = () => {
    const trimmed = title.trim()
    const trimmedObjective = objective.trim()
    const trimmedExpectedResult = expectedResult.trim()
    if (!trimmed || !trimmedObjective || !trimmedExpectedResult) return
    onSubmit({
      title: trimmed,
      details: details.trim() || undefined,
      dueOn,
      priority,
      ownerId: ownerId || undefined,
      expectedResult: trimmedExpectedResult,
      objective: trimmedObjective,
    })
  }

  return (
    <>
      <Box className="space-y-4">
        <Input
          value={title}
          onChange={event => setTitle(event.target.value)}
          placeholder={t('composer.titlePlaceholder')}
          aria-label={t('composer.titleLabel')}
          autoFocus
        />

        <Textarea
          value={details}
          onChange={event => setDetails(event.target.value)}
          placeholder={t('composer.detailsPlaceholder')}
          className="min-h-[80px]"
          aria-label={t('composer.detailsLabel')}
        />

        {/* #2395.8 (épopée #2871) — POURQUOI, requis : le bouton reste
          inactif tant que ce champ est vide, comme l'intitulé. */}
        <Box className="space-y-1.5">
          <Text element="span" size="xs" weight="medium">
            {t('composer.objectiveLabel')}
          </Text>
          <Textarea
            value={objective}
            onChange={event => setObjective(event.target.value)}
            placeholder={t('composer.objectivePlaceholder')}
            className="min-h-[60px]"
            aria-label={t('composer.objectiveLabel')}
          />
        </Box>

        {/* #2395.8 (épopée #2871), seconde moitié — distinct de `details` :
          « qu'est-ce qui me dira que c'est fait ? ». Requis, comme
          `objective` : le bouton reste inactif tant qu'il est vide. */}
        <Box className="space-y-1.5">
          <Text element="span" size="xs" weight="medium">
            {t('composer.expectedResultLabel')}
          </Text>
          <Textarea
            value={expectedResult}
            onChange={event => setExpectedResult(event.target.value)}
            placeholder={t('composer.expectedResultPlaceholder')}
            className="min-h-[60px]"
            aria-label={t('composer.expectedResultLabel')}
          />
        </Box>

        {/* #2105.26 — même liste que tout « attribuer à… » du produit
          (`useWorkspaceMembers`). Vide = à celui qui crée, jamais deviné. */}
        <Box className="space-y-1.5">
          <Text element="span" size="xs" weight="medium">
            {t('composer.ownerLabel')}
          </Text>
          <SelectField
            value={ownerId}
            onChange={setOwnerId}
            options={members.map(member => ({
              value: member.userId,
              label: member.fullName ?? member.email ?? member.userId,
            }))}
            emptyOption={{ label: t('composer.ownerMe') }}
            ariaLabel={t('composer.ownerLabel')}
          />
        </Box>

        <Box className="space-y-1.5">
          <Text element="span" size="xs" weight="medium">
            {t('composer.dueLabel')}
          </Text>
          <Box display="flex" className="flex-wrap items-center gap-1">
            {SHORTCUTS.map(shortcut => (
              <Button
                key={shortcut.key}
                variant={dueOn === shift(shortcut.offset) ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setDueOn(shift(shortcut.offset))}
              >
                {t(`composer.shortcuts.${shortcut.key}`)}
              </Button>
            ))}
          </Box>
          <Input
            type="date"
            value={dueOn}
            onChange={event => setDueOn(event.target.value)}
            aria-label={t('composer.dueLabel')}
          />
        </Box>

        <Box display="flex" className="items-center gap-1">
          {(['normal', 'high'] as const).map(value => (
            <Button
              key={value}
              variant={priority === value ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setPriority(value)}
            >
              {t(`priority.${value}`)}
            </Button>
          ))}
        </Box>
      </Box>

      {missingFields.length > 0 ? (
        <Text size="sm" data-testid="task-composer-missing">
          {t('composer.missing', { fields: missingFields.map(field => t(`composer.fieldNames.${field}`)).join(', ') })}
        </Text>
      ) : null}

      <Box display="flex" className="flex-wrap justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => onCancel()}>
          {t('common:actions.cancel')}
        </Button>
        <Button variant="black" size="sm" disabled={missingFields.length > 0} isLoading={isPending} onClick={submit}>
          {t('composer.submit')}
        </Button>
      </Box>
    </>
  )
}

/**
 * Créer une tâche.
 *
 * L'échéance est PRÉ-REMPLIE à aujourd'hui et le champ est requis : une tâche
 * sans date ne remonte dans aucune vue, donc n'est jamais faite. Proposer un
 * champ vide et refuser à la validation ferait perdre la saisie ; proposer
 * « aujourd'hui » modifiable la garde.
 */
export function TaskComposer({
  open,
  onOpenChange,
  onSubmit,
  isPending,
  /**
   * #2105.24/.25 — L'OBJET, déjà écrit, quand le composeur s'ouvre depuis
   * « Transformer ce sujet en prochaine action » (`PriorityCard`). Reste un
   * champ modifiable : préremplir n'est pas figer. Absent, l'intitulé
   * démarre vide, comme avant ce champ.
   */
  initialTitle,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (draft: TaskDraft) => void
  isPending: boolean
  initialTitle?: string
}) {
  const { t } = useTranslation('tasks')
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('common:actions.close')} className="sm:max-w-md border-[var(--bellum-border)]">
        <DialogHeader>
          <DialogTitle>{t('composer.title')}</DialogTitle>
          <DialogDescription>{t('composer.subtitle')}</DialogDescription>
        </DialogHeader>
        <TaskComposerForm
          onCancel={() => onOpenChange(false)}
          onSubmit={onSubmit}
          isPending={isPending}
          initialTitle={initialTitle}
        />
      </DialogContent>
    </Dialog>
  )
}
