import { describe, expect, it } from 'vitest'
import type { CrmDealPipelines } from '@/features/crm/api'
import { exactStageMatch, pipelineOf, stageTargetState } from './stage-target'

/**
 * #1934.18 — la dérivation unique de la cible d'une proposition de stade.
 *
 * Ce qui est tenu : l'IDENTIFIANT envoyé vient TOUJOURS de la liste réelle du
 * CRM, et le libellé du modèle ne sert qu'à une présélection par égalité
 * EXACTE. Le témoin : un identifiant réel du bon pipeline passe.
 */

const PIPELINES: CrmDealPipelines = {
  status: 'ready',
  pipelines: [
    {
      id: 'default',
      label: 'Pipeline commercial',
      stages: [
        { id: 'appointmentscheduled', label: 'Découverte' },
        { id: 'contractsent', label: 'Négociation' },
      ],
    },
    { id: '8812', label: 'Grands comptes', stages: [{ id: '99001', label: 'Négociation' }] },
  ],
}
const DEAL = { id: 'hs-deal-42', name: 'ACME', stage: 'appointmentscheduled', pipeline: 'default' }
const BASE = { crmConnected: true, deals: [DEAL], pipelines: PIPELINES, selectedDealId: 'hs-deal-42' }

describe('#1934.18 — stageTargetState', () => {
  it('elle LIT quelque chose : le pipeline de l’affaire est retrouvé, avec ses deux stades', () => {
    expect(pipelineOf(DEAL, PIPELINES)?.stages).toHaveLength(2)
  })

  it('TÉMOIN — un identifiant réel du pipeline de l’affaire est prêt à partir', () => {
    const state = stageTargetState({ ...BASE, selectedStageId: 'contractsent' })
    expect(state.ready).toBe(true)
    expect(state.ready && state.stage.id).toBe('contractsent')
  })

  it('un LIBELLÉ n’est jamais pris pour un identifiant', () => {
    expect(stageTargetState({ ...BASE, selectedStageId: 'Négociation' })).toMatchObject({
      ready: false,
      block: 'pickStage',
    })
  })

  it('un stade d’un AUTRE pipeline n’est pas pris, même au libellé identique', () => {
    expect(stageTargetState({ ...BASE, selectedStageId: '99001' })).toMatchObject({ ready: false, block: 'pickStage' })
  })

  it('stades illisibles ou en cours de lecture : jamais prêt', () => {
    const unreadable: CrmDealPipelines = { status: 'unreadable', reason: 'empty', pipelines: [] }
    expect(stageTargetState({ ...BASE, selectedStageId: 'contractsent', pipelines: unreadable })).toMatchObject({
      ready: false,
      block: 'unreadable',
      unreadableReason: 'empty',
    })
    expect(stageTargetState({ ...BASE, selectedStageId: 'contractsent', pipelines: undefined })).toMatchObject({
      ready: false,
      block: 'loading',
    })
  })

  it('une affaire au pipeline INCONNU n’hérite d’aucun pipeline « par défaut »', () => {
    const state = stageTargetState({ ...BASE, deals: [{ ...DEAL, pipeline: null }], selectedStageId: 'contractsent' })
    expect(state).toMatchObject({ ready: false, block: 'dealPipelineUnknown' })
  })
})

describe('#1934.18 — exactStageMatch : la seule présélection admise', () => {
  const pipeline = pipelineOf(DEAL, PIPELINES)

  it('une égalité EXACTE présélectionne l’identifiant, pas le libellé', () => {
    expect(exactStageMatch(pipeline, 'Négociation')).toBe('contractsent')
  })

  it('aucune approximation : casse, espaces ou mot voisin ne présélectionnent RIEN', () => {
    expect(exactStageMatch(pipeline, 'négociation')).toBe('')
    expect(exactStageMatch(pipeline, 'Négociation ')).toBe('')
    expect(exactStageMatch(pipeline, 'Négo')).toBe('')
    expect(exactStageMatch(pipeline, null)).toBe('')
  })

  it('deux stades du même libellé rendent la question ambiguë : rien n’est présélectionné', () => {
    const twin = {
      id: 'x',
      label: 'P',
      stages: [
        { id: 'a', label: 'Négociation' },
        { id: 'b', label: 'Négociation' },
      ],
    }
    expect(exactStageMatch(twin, 'Négociation')).toBe('')
  })
})
