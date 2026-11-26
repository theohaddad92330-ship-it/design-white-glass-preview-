import { Badge, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@bellum/ui'
import type { ProjectRow } from '@bellum/contracts'
import { Check, ChevronDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useProjectStageMove } from '../hooks/useProjectStageMove'
import { STAGE_VARIANT, PROJECT_STAGE_ORDER, asStage } from '../model/project-index'
import { formatOpportunityDate } from '../model/project-provenance'

/**
 * La pastille d'étape et son sélecteur, sur un projet.
 *
 * C'est ce que la projection de `raw_analysis` ne peut pas porter : un état que
 * le commercial DÉPLACE, daté et persisté. Aucune transition n'est interdite —
 * reculer est un geste de correction, et un pipe qui l'empêche se fait
 * contourner par des projets qu'on n'ose plus toucher.
 *
 * Une seule étape pose une question avant de partir : « perdu » demande son
 * motif, parce que c'est le seul moment où le pipe apprend quelque chose. La
 * question est posée AVANT l'envoi et non après un refus du serveur : un 400
 * laisse la pastille inchangée et se lit comme une panne, là où un champ
 * obligatoire se lit comme une question.
 */
export function ProjectStageControl({ opportunity }: { opportunity: ProjectRow }) {
  const { t, i18n } = useTranslation('projects')
  const current = asStage(opportunity.stage) ?? 'detected'
  const { choose, isPending, layer } = useProjectStageMove(opportunity)
  const detectedAt = formatOpportunityDate(opportunity.first_detected_at, i18n.language)

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 pl-5">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={isPending}
            className="inline-flex items-center gap-1 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)] disabled:opacity-60"
            aria-label={t('stage.change')}
          >
            <Badge variant={STAGE_VARIANT[current]}>{t(`stage.states.${current}`)}</Badge>
            <ChevronDown className="size-3 text-[var(--bellum-text-muted)]" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {PROJECT_STAGE_ORDER.map(state => (
            <DropdownMenuItem key={state} disabled={isPending} onSelect={() => choose(state)}>
              <span className="flex-1">{t(`stage.states.${state}`)}</span>
              {state === current ? <Check className="size-3.5 text-[var(--bellum-text-accent)]" /> : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {detectedAt ? (
        <span className="text-xs text-[var(--bellum-text-muted)]">{t('stage.detectedOn', { date: detectedAt })}</span>
      ) : null}

      {layer}
    </div>
  )
}
