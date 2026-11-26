import type { TFunction } from 'i18next'
import type { LauraContextFacet, LauraPageContext } from '@bellum/contracts'

/**
 * #1904 — CE QUE LE PIPE DÉCLARE À LAURA.
 *
 * L'exemple de l'issue en est la recette : « Cette page suit tes opportunités
 * commerciales. Trois dossiers n'ont aucune prochaine action. » Laura reçoit le
 * nombre d'affaires du pipe et celles SANS prochaine action ; la phrase « je
 * commencerais par… » reste la sienne.
 *
 * ⚠️ « Sans prochaine action » ne compte qu'un `null` AFFIRMÉ, exactement comme
 * le filtre de l'écran : `undefined` veut dire que l'API ne l'a pas dit.
 */

type PipeContextInput = {
  isLoading: boolean
  /** Le résumé du pipe — `null` quand il n'a pas été lu. */
  summary: { total_count: number; intake: number } | null
  /** Les projets aux étapes du pipe — `null` quand ils n'ont pas été lus. */
  pipelineProjects: readonly { next_action?: unknown }[] | null
  /** Le libellé de l'étape filtrée (`?stage=`), s'il y en a une. */
  stageLabel: string | null
}

export function pipeLauraContext(t: TFunction<'projects'>, input: PipeContextInput): LauraPageContext {
  const facets: LauraContextFacet[] = [{ label: t('laura.lens'), value: t('lens.pipeline') }]
  if (input.pipelineProjects) {
    facets.push({ label: t('laura.inPipe'), value: String(input.pipelineProjects.length) })
    const withoutNextAction = input.pipelineProjects.filter(project => project.next_action === null).length
    facets.push({ label: t('laura.withoutNextAction'), value: String(withoutNextAction) })
  }
  if (input.stageLabel) facets.push({ label: t('laura.stage'), value: input.stageLabel })

  const emptyPipe = input.summary !== null && input.summary.total_count === 0 && input.summary.intake === 0
  return {
    kind: 'screen',
    label: t('page.title'),
    entityId: null,
    facets,
    state: input.isLoading ? 'loading' : 'ready',
    purpose: t('laura.purpose'),
    ...(emptyPipe ? { missing: [t('emptyState.noProjectTitle')] } : {}),
  }
}
