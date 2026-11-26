import { Box, Button, Text } from '@bellum/ui'
import { useMutation } from '@tanstack/react-query'
import { Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { projectsApi } from '../api'

/**
 * #2171.27 — Section « Synthèse et décision actuelle » : sept questions,
 * faits et hypothèses distingués (#2171.44), ce qu'il ne faut pas faire
 * (#2171.47). Génération À LA DEMANDE, jamais persistée — voir le docblock de
 * `ProjectSynthesisService` (côté API) pour la raison ; un clic reflète donc
 * toujours l'état ACTUEL de l'affaire, jamais une synthèse figée au premier
 * clic.
 *
 * « On n'affiche pas ce qu'on n'a pas » (doctrine) : une liste vide (aucun
 * fait confirmé, aucune hypothèse, aucune condition bloquante) ne rend AUCUNE
 * ligne plutôt qu'un état vide inventé.
 */
export function ProjectSynthesisPanel({ projectId }: { projectId: string }) {
  const { t } = useTranslation('projects')

  const generate = useMutation({
    mutationFn: () => projectsApi.generateSynthesis(projectId),
    onError: (error: Error) => toast.error(error.message || t('detail.synthesis.error')),
  })

  const synthesis = generate.data

  return (
    <Box className="space-y-2">
      <Box display="flex" className="items-center justify-between gap-2">
        <Box display="flex" className="items-center gap-2">
          <Sparkles className="size-4 text-muted-foreground" aria-hidden />
          <Text element="h4" size="sm" weight="medium">
            {t('detail.synthesis.title')}
          </Text>
        </Box>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="pointer-coarse:min-h-11"
          disabled={generate.isPending}
          onClick={() => generate.mutate()}
        >
          {generate.isPending
            ? t('detail.synthesis.generating')
            : synthesis
              ? t('detail.synthesis.regenerate')
              : t('detail.synthesis.generate')}
        </Button>
      </Box>

      {generate.isError ? (
        <Box className="rounded-md border border-dashed border-destructive/40 p-3">
          <Text size="sm" color="text-muted-foreground">
            {t('detail.synthesis.error')}
          </Text>
        </Box>
      ) : !synthesis ? (
        <Box className="rounded-md border border-dashed border-border p-3">
          <Text size="sm" color="text-muted-foreground">
            {t('detail.synthesis.empty')}
          </Text>
        </Box>
      ) : (
        <Box className="flex flex-col gap-3 rounded-md border border-border bg-card p-3">
          <SynthesisField label={t('detail.synthesis.problem')}>{synthesis.problem}</SynthesisField>

          {synthesis.confirmed.length > 0 ? (
            <SynthesisList label={t('detail.synthesis.confirmed')} items={synthesis.confirmed} />
          ) : null}

          {synthesis.hypotheses.length > 0 ? (
            <SynthesisList label={t('detail.synthesis.hypotheses')} items={synthesis.hypotheses} />
          ) : null}

          <SynthesisField label={t('detail.synthesis.decisionMaker')}>
            {synthesis.decisionMaker ?? t('detail.synthesis.decisionMakerUnknown')}
          </SynthesisField>

          {synthesis.blockingConditions.length > 0 ? (
            <SynthesisList label={t('detail.synthesis.blockingConditions')} items={synthesis.blockingConditions} />
          ) : null}

          <SynthesisField label={t('detail.synthesis.nextToObtain')}>{synthesis.nextToObtain}</SynthesisField>
          <SynthesisField label={t('detail.synthesis.whatNotToDo')}>{synthesis.whatNotToDo}</SynthesisField>
        </Box>
      )}
    </Box>
  )
}

function SynthesisField({ label, children }: { label: string; children: string }) {
  return (
    <Box>
      <Text size="xs" weight="medium" color="text-muted-foreground">
        {label}
      </Text>
      <Text size="sm" className="whitespace-pre-line">
        {children}
      </Text>
    </Box>
  )
}

function SynthesisList({ label, items }: { label: string; items: readonly string[] }) {
  return (
    <Box>
      <Text size="xs" weight="medium" color="text-muted-foreground">
        {label}
      </Text>
      <ul className="mt-1 list-disc space-y-0.5 pl-4">
        {items.map((item, index) => (
          <li key={index}>
            <Text size="sm">{item}</Text>
          </li>
        ))}
      </ul>
    </Box>
  )
}
