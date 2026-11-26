import type { ProjectRow } from '@bellum/contracts'
import { Badge, Box, Text } from '@bellum/ui'
import { Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { friezeFor, stageOfFriezeStep } from '../model/project-frieze'
import type { useProjectStageMove } from '../hooks/useProjectStageMove'

/**
 * Théo C projects-fiche.R2/N3 — la frise d'étape cliquable : À qualifier › Cadrage › Profils présentés ›
 * Proposition › Gagnée, avec le rang de chaque étape. Cliquer une étape pose le MÊME déplacement gouverné
 * que le sélecteur à pastille (panneau d'effet, jamais une porte de côté) ; « Perdue » et « En sommeil »
 * sont des sorties, nommées à côté de la frise et posées depuis « Suivi ».
 */
export function ProjectFrieze({
  project,
  move,
}: {
  project: ProjectRow
  move: Pick<ReturnType<typeof useProjectStageMove>, 'choose' | 'isPending'>
}) {
  const { t } = useTranslation('projects')
  const view = friezeFor(project.stage)
  return (
    <Box className="space-y-1">
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-1" aria-label={t('frieze.label')}>
        {view.steps.map(step => (
          <li key={step.key}>
            <button
              type="button"
              disabled={move.isPending}
              aria-current={step.status === 'current' ? 'step' : undefined}
              onClick={() => move.choose(stageOfFriezeStep(step.key))}
              className={[
                'inline-flex min-h-11 items-center gap-1.5 rounded-control border px-3 text-sm disabled:opacity-60',
                step.status === 'current'
                  ? 'border-[var(--bellum-primary-500)] bg-[var(--bellum-surface-2)] font-semibold'
                  : 'border-[var(--bellum-border)] text-[var(--bellum-text-secondary)]',
              ].join(' ')}
            >
              {step.status === 'done' ? (
                <Check className="size-3.5" aria-hidden />
              ) : (
                <span className="text-xs text-[var(--bellum-text-muted)]">{step.rank}</span>
              )}
              {t(`frieze.steps.${step.key}`)}
            </button>
          </li>
        ))}
      </ol>
      {view.exit ? (
        <Box className="flex items-center gap-2">
          <Badge variant="warning">{t(`stage.states.${view.exit}`)}</Badge>
          <Text size="xs" color="text-muted-foreground">
            {t('frieze.exitNote')}
          </Text>
        </Box>
      ) : null}
    </Box>
  )
}
