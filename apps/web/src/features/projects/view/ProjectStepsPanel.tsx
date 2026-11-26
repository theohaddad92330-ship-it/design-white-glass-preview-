import { useState } from 'react'
import type { ProjectStep } from '@bellum/contracts'
import { Badge, Box, Button, Checkbox, Input, Text } from '@bellum/ui'
import { ListChecks } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useCreateProjectStep, useProjectSteps, useUpdateProjectStep } from '../hooks/useProjectSteps'

/**
 * #2171.22 — Section « Actions et prochaines étapes », COCHABLE.
 *
 * S'ajoute à côté de la « prochaine action » du hero (`project.next_action`,
 * #2171.15) — celle-ci reste une DÉRIVATION qui disparaît d'elle-même quand
 * la donnée change, jamais cochable. Cette section porte un second objet,
 * ÉCRIT par le commercial (`project_steps`) : une liste qu'on remplit et
 * qu'on coche au fil de l'eau — même distinction que `NeedStepsCard` côté
 * besoin (`need-step.ts`).
 */
export function ProjectStepsPanel({ projectId }: { projectId: string }) {
  const { t } = useTranslation('projects')
  const { items, isLoading, isError } = useProjectSteps(projectId)
  const updateStep = useUpdateProjectStep(projectId)
  const createStep = useCreateProjectStep(projectId)
  const [draft, setDraft] = useState('')

  function toggle(step: ProjectStep) {
    updateStep.mutate({ stepId: step.id, status: step.status === 'done' ? 'todo' : 'done' })
  }

  function addStep() {
    const label = draft.trim()
    if (!label) return
    createStep.mutate({ label }, { onSuccess: () => setDraft('') })
  }

  return (
    <Box className="space-y-2">
      <Box display="flex" className="items-center gap-2">
        <ListChecks className="size-4 text-muted-foreground" aria-hidden />
        <Text element="h4" size="sm" weight="medium">
          {t('detail.steps.title')}
        </Text>
      </Box>

      <Box className="flex flex-col gap-2">
        {isError ? (
          <Box className="rounded-md border border-dashed border-destructive/40 p-3">
            <Text size="sm" color="text-muted-foreground">
              {t('detail.steps.readError')}
            </Text>
          </Box>
        ) : isLoading ? (
          <Text size="sm" color="text-muted-foreground">
            {t('common:states.loading')}
          </Text>
        ) : items.length === 0 ? (
          <Box className="rounded-md border border-dashed border-border p-3">
            <Text size="sm" color="text-muted-foreground">
              {t('detail.steps.empty')}
            </Text>
          </Box>
        ) : (
          items.map(step => (
            <label
              key={step.id}
              className="flex items-center justify-between gap-2 rounded-md border border-border bg-card px-2.5 py-2 pointer-coarse:min-h-11"
            >
              <span className="flex min-w-0 items-center gap-2">
                <Checkbox
                  checked={step.status === 'done'}
                  onCheckedChange={() => toggle(step)}
                  aria-label={t('detail.steps.toggleAria', { label: step.label })}
                />
                <Text
                  element="span"
                  size="sm"
                  className={step.status === 'done' ? 'text-muted-foreground line-through' : ''}
                >
                  {step.label}
                </Text>
              </span>
              {step.status !== 'done' ? (
                <Badge variant={step.status === 'pending' ? 'warning' : 'outline'}>
                  {t(`detail.steps.status.${step.status}`)}
                </Badge>
              ) : null}
            </label>
          ))
        )}
      </Box>

      <Box display="flex" className="gap-2">
        <Input
          value={draft}
          onChange={event => setDraft(event.target.value)}
          placeholder={t('detail.steps.addPlaceholder')}
          aria-label={t('detail.steps.addAria')}
          className="pointer-coarse:min-h-11"
          onKeyDown={event => {
            if (event.key === 'Enter') addStep()
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="pointer-coarse:min-h-11"
          disabled={draft.trim().length === 0 || createStep.isPending}
          onClick={addStep}
        >
          {t('detail.steps.add')}
        </Button>
      </Box>
    </Box>
  )
}
