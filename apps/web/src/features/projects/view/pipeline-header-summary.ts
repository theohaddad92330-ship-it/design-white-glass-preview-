import type { TFunction } from 'i18next'
import { isPipelineStage } from '@bellum/contracts'
import type { CrmCountersResponse, PipelineSummary, ProjectRow } from '@bellum/contracts'
import { pistesToReviewOf } from '@/features/crm-counters/usePistesToReview'
import { pipelineWithoutNextAction } from '../model/pipeline-total'

/**
 * #2169.18 — LE RÉSUMÉ CHIFFRÉ DE TÊTE D'ÉCRAN.
 *
 * « Ton activité commerciale, {Prénom}. N actives · N sans action · N pistes ·
 * N sans profil. » Les quatre nombres existent déjà (`model/pipeline-total.ts`, `GET /crm-counters`) :
 * cette fonction ne les recalcule pas, elle les LIT — même
 * discipline que `pipe-laura-context.ts`, une lecture de plus sur les mêmes
 * verdicts, jamais un troisième chemin de calcul (GA-26).
 *
 * #4193 — « actives » se lit sur `GET /crm-counters` dès qu'il est mesuré ; le résumé du pipe ne sert
 * que de repli le temps de la requête. #4191 (E2) — « pistes » se lit sur `pistes_to_review`, sans repli :
 * un repli sur une autre population redonnerait deux chiffres pour un même mot.
 *
 * « Sans action » et « sans profil » restent NOMMÉS quand ils ne sont pas
 * mesurés (GA-18/19) : jamais retirés en silence de la phrase, jamais lus
 * comme zéro.
 */
export function pipelineHeaderSummary(
  t: TFunction<'projects'>,
  summary: Pick<PipelineSummary, 'total_count' | 'columns'>,
  projects: readonly Pick<ProjectRow, 'stage' | 'positioned_count'>[],
  counters?: Pick<CrmCountersResponse['counters'], 'opportunities_active' | 'pistes_to_review'>,
): string {
  const active = counters?.opportunities_active.value ?? summary.total_count
  // #4191 (E2) — « N pistes » = `pistes_to_review`, le chiffre de Pilotage et de `/projects/pistes`. Les affaires
  // « à qualifier » (`summary.intake`) sont une AUTRE population : elles ont leur carte, pas cette phrase.
  const intake = pistesToReviewOf(counters)
  const gap = pipelineWithoutNextAction(summary)
  const pipelineProjects = projects.filter(project => isPipelineStage(project.stage))
  // `positioned_count` absent = une API antérieure au déploiement, pas un
  // « zéro profil » — même garde que le filtre rapide `withoutProfile`
  // (`ProjectsPage.tsx`).
  const withProfileData = pipelineProjects.filter(project => project.positioned_count !== undefined)
  const withoutProfileCount = withProfileData.filter(project => project.positioned_count === 0).length

  return [
    t('kpis.headerSummary.active', { count: active }),
    gap.kind === 'measured'
      ? t('kpis.headerSummary.withoutNextAction', { count: gap.count })
      : t('kpis.headerSummary.unmeasured', { axis: t('kpis.headerSummary.withoutNextActionAxis') }),
    intake !== null
      ? t('kpis.headerSummary.intake', { count: intake })
      : t('kpis.headerSummary.unmeasured', { axis: t('kpis.headerSummary.intakeAxis') }),
    withProfileData.length > 0
      ? t('kpis.headerSummary.withoutProfile', { count: withoutProfileCount })
      : t('kpis.headerSummary.unmeasured', { axis: t('kpis.headerSummary.withoutProfileAxis') }),
  ].join(' · ')
}
