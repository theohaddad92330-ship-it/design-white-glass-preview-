import type { CrmDealPipelines } from '@/features/crm/api'

/**
 * #1934.18 — la cible d'une proposition de stade CRM, dérivée à UN endroit.
 *
 * La carte (bouton ouvert ou fermé, phrase affichée) et l'envoi (ce qui part
 * dans `crmStage`) lisent la même dérivation : deux chemins qui la referaient
 * divergeraient, et un bouton ouvert pourrait envoyer une cible que la carte
 * n'a pas montrée.
 *
 * ⚠️ `dealstage` attend l'IDENTIFIANT interne d'un stade. Rien ici ne transforme
 * un libellé en identifiant par approximation : le stade proposé par le modèle
 * ne sert qu'à PRÉSÉLECTIONNER, et seulement s'il est ÉGAL, caractère pour
 * caractère, au libellé d'un stade du pipeline de l'affaire.
 */

type Deal = { id: string; name: string | null; stage: string | null; pipeline?: string | null }
type Pipeline = Extract<CrmDealPipelines, { status: 'ready' }>['pipelines'][number]
type Stage = Pipeline['stages'][number]

export type StageTargetInput = {
  crmConnected: boolean
  deals: readonly Deal[]
  /** `undefined` = lecture en cours. */
  pipelines: CrmDealPipelines | undefined
  selectedDealId: string
  selectedStageId: string
}

/** Pourquoi rien ne peut encore être proposé. Chaque raison a SA phrase. */
type StageTargetBlock =
  | 'noCrm'
  | 'noDeals'
  | 'loading'
  | 'unreadable'
  | 'pickDeal'
  | 'dealPipelineUnknown'
  | 'pickStage'

type StageTargetState =
  | { ready: true; deal: Deal; pipeline: Pipeline; stage: Stage }
  | { ready: false; block: StageTargetBlock; deal?: Deal; pipeline?: Pipeline; unreadableReason?: string }

/** Le pipeline d'une affaire, s'il est CONNU et LU. Jamais un pipeline « par défaut ». */
export function pipelineOf(deal: Deal | undefined, pipelines: CrmDealPipelines | undefined): Pipeline | undefined {
  if (!deal?.pipeline || pipelines?.status !== 'ready') return undefined
  return pipelines.pipelines.find(pipeline => pipeline.id === deal.pipeline)
}

/**
 * La présélection : l'identifiant du stade dont le libellé est EXACTEMENT le
 * stade proposé. Aucune casse ignorée, aucun espace retiré, aucune distance
 * d'édition — « négociation » n'est pas « Négociation », et deux stades du même
 * libellé rendent la question ambiguë : rien n'est présélectionné.
 */
export function exactStageMatch(pipeline: Pipeline | undefined, proposedLabel: string | null | undefined): string {
  if (!pipeline || !proposedLabel) return ''
  const matches = pipeline.stages.filter(stage => stage.label === proposedLabel)
  return matches.length === 1 ? (matches[0]?.id ?? '') : ''
}

export function stageTargetState(input: StageTargetInput): StageTargetState {
  if (!input.crmConnected) return { ready: false, block: 'noCrm' }
  if (input.deals.length === 0) return { ready: false, block: 'noDeals' }
  if (!input.pipelines) return { ready: false, block: 'loading' }
  if (input.pipelines.status !== 'ready') {
    return {
      ready: false,
      block: input.pipelines.status === 'not_connected' ? 'noCrm' : 'unreadable',
      ...(input.pipelines.status === 'unreadable' ? { unreadableReason: input.pipelines.reason } : {}),
    }
  }
  const deal = input.deals.find(candidate => candidate.id === input.selectedDealId)
  if (!deal) return { ready: false, block: 'pickDeal' }
  const pipeline = pipelineOf(deal, input.pipelines)
  if (!pipeline || pipeline.stages.length === 0) return { ready: false, block: 'dealPipelineUnknown', deal }
  // Le stade choisi doit appartenir au pipeline DE CETTE affaire : un choix
  // resté d'une affaire précédente ne voyage pas vers la suivante.
  const stage = pipeline.stages.find(candidate => candidate.id === input.selectedStageId)
  if (!stage) return { ready: false, block: 'pickStage', deal, pipeline }
  return { ready: true, deal, pipeline, stage }
}
