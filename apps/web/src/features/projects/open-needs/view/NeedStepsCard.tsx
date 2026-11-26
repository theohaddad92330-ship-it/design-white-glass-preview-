import { useState, type ReactNode } from 'react'
import type { NeedStep, OpenNeedRow } from '@bellum/contracts'
import { Badge, Button, Card, Checkbox, Input, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { UnknownValue } from '@/components/primitives/UnknownValue'
import { useCreateNeedStep, useNeedSteps, useUpdateNeedStep } from '../hooks/useNeedSteps'

/**
 * « Prochaines étapes », COCHABLES (dossier du 26/08, image 02).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * S'AJOUTE À CÔTÉ DE `needNextAction`, NE LE REMPLACE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * `needNextAction` (rendu dans le bloc « Le suivi » de cette même page) reste
 * une DÉRIVATION — elle disparaît d'elle-même dès que la donnée change, et
 * elle n'a jamais été cochable. Cette carte porte un second objet, ÉCRIT par
 * le recruteur (`need_steps`) : une liste qu'on remplit et qu'on coche au fil
 * de l'eau. Les deux coexistent — voir le docblock de `need-step.ts`.
 */
export function NeedStepsCard({ need, children }: { need: OpenNeedRow; children?: ReactNode }) {
  const { t } = useTranslation('projects')
  const { items, isLoading, isError } = useNeedSteps(need.id)
  const updateStep = useUpdateNeedStep(need.id)
  const createStep = useCreateNeedStep(need.id)
  const [draft, setDraft] = useState('')

  function toggle(step: NeedStep) {
    updateStep.mutate({ stepId: step.id, status: step.status === 'done' ? 'todo' : 'done' })
  }

  function addStep() {
    const label = draft.trim()
    if (!label) return
    createStep.mutate(
      { label },
      {
        onSuccess: () => setDraft(''),
      },
    )
  }

  return (
    // Théo C projects-besoin-fiche — panneau « Actions et prochaines étapes » : la prochaine action dérivée
    // (`children`) en tête, puis les étapes cochables, chacune avec son état teinté (« À faire » ambre).
    <Card className="rounded-card p-4 md:p-5" data-testid="need-actions-panel">
      <Text element="h2" size="base" weight="semibold">
        {t('needSheet.steps.title')}
      </Text>
      {children}

      <div className="mt-2 flex flex-col gap-2">
        {isError ? (
          <UnknownValue reason={t('needSheet.steps.readError')} />
        ) : isLoading ? (
          <Text size="sm" className="text-[var(--bellum-text-muted)]">
            {t('needSheet.steps.loading')}
          </Text>
        ) : items.length === 0 ? (
          <Text size="sm" className="text-[var(--bellum-text-muted)]">
            {t('needSheet.steps.empty')}
          </Text>
        ) : (
          items.map(step => (
            <label
              key={step.id}
              className="flex min-h-11 items-center justify-between gap-2 border-b border-[var(--bellum-border)] py-2 last:border-b-0"
            >
              <span className="flex min-w-0 items-center gap-2">
                <Checkbox
                  checked={step.status === 'done'}
                  onCheckedChange={() => toggle(step)}
                  aria-label={t('needSheet.steps.toggleAria', { label: step.label })}
                />
                <Text
                  element="span"
                  size="sm"
                  className={step.status === 'done' ? 'text-[var(--bellum-text-muted)] line-through' : ''}
                >
                  {step.label}
                </Text>
              </span>
              <Badge variant={step.status === 'todo' ? 'warning' : 'default'}>
                {t(`needSheet.steps.status.${step.status}`)}
              </Badge>
            </label>
          ))
        )}
      </div>

      <div className="mt-3 flex gap-2">
        <Input
          value={draft}
          onChange={event => setDraft(event.target.value)}
          placeholder={t('needSheet.steps.addPlaceholder')}
          aria-label={t('needSheet.steps.addAria')}
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
          {t('needSheet.steps.add')}
        </Button>
      </div>
    </Card>
  )
}
