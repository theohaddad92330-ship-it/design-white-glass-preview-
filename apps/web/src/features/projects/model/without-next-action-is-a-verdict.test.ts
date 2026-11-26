import { describe, expect, it } from 'vitest'
import type { PipelineSummary } from '@bellum/contracts'
import { pipelineWithoutNextAction } from './pipeline-total'

/**
 * « SANS PROCHAINE ACTION » EST UN VERDICT, PAS UNE SOMME — #1324, 3ᵉ carte.
 *
 * Le piège que ces tests tiennent est celui que ce dépôt paie le plus souvent :
 * `columns.reduce((n, c) => n + c.without_next_action, 0)` sur un tableau vide
 * rend `0`, et « 0 projet sans prochaine action » est la plus rassurante des
 * phrases fausses — elle dit « tout est sous contrôle » à quelqu'un dont on n'a
 * simplement pas pu lire le pipe.
 *
 * ⚠️ Et le SIGNÉ est exclu. Une affaire gagnée n'a pas besoin d'une prochaine
 * action ; la compter fabriquerait une dette qui n'existe pas — et le chiffre
 * ne redescendrait jamais quand on gagne, exactement le défaut corrigé le
 * 29/08 sur le montant.
 */
const column = (over: Partial<PipelineSummary['columns'][number]>): PipelineSummary['columns'][number] => ({
  stage: 'qualified',
  label: 'Qualifié',
  count: 0,
  amount_cents: 0,
  without_amount: 0,
  without_next_action: 0,
  ...over,
})

describe('pipelineWithoutNextAction', () => {
  it('somme les étapes ENCORE EN JEU et rend leur dénominateur', () => {
    const verdict = pipelineWithoutNextAction({
      columns: [
        column({ stage: 'qualified', count: 5, without_next_action: 2 }),
        column({ stage: 'negotiation', count: 3, without_next_action: 1 }),
      ],
    })
    expect(verdict).toEqual({ kind: 'measured', count: 3, total: 8 })
  })

  it('IGNORE la colonne signée — une affaire gagnée n’a pas de dette d’action', () => {
    const verdict = pipelineWithoutNextAction({
      columns: [
        column({ stage: 'qualified', count: 2, without_next_action: 1 }),
        column({ stage: 'won', count: 40, without_next_action: 40 }),
      ],
    })
    // Sans l'exclusion, ce serait 41 sur 42 — un pipe qui aurait l'air à l'abandon.
    expect(verdict).toEqual({ kind: 'measured', count: 1, total: 2 })
  })

  it('rend « non mesuré » plutôt que 0 quand le résumé ne porte aucune colonne', () => {
    expect(pipelineWithoutNextAction({ columns: [] })).toEqual({ kind: 'unmeasured' })
    expect(pipelineWithoutNextAction(undefined)).toEqual({ kind: 'unmeasured' })
    expect(pipelineWithoutNextAction(null)).toEqual({ kind: 'unmeasured' })
  })

  it('rend « non mesuré » si UNE colonne a un chiffre illisible — jamais un total amputé', () => {
    const verdict = pipelineWithoutNextAction({
      columns: [
        column({ stage: 'qualified', count: 5, without_next_action: 2 }),
        // Une réponse abîmée : `usePipeline` ne valide par aucun schéma, donc le
        // champ peut manquer à l'exécution alors que TypeScript le croit là.
        column({ stage: 'negotiation', count: 3, without_next_action: undefined as unknown as number }),
      ],
    })
    expect(verdict).toEqual({ kind: 'unmeasured' })
  })

  it('rend un vrai zéro quand tout le pipe porte une action', () => {
    const verdict = pipelineWithoutNextAction({
      columns: [column({ stage: 'qualified', count: 4, without_next_action: 0 })],
    })
    // Ici zéro est VRAI : quatre projets, quatre actions. C'est la différence
    // que le cas « unmeasured » existe pour tenir.
    expect(verdict).toEqual({ kind: 'measured', count: 0, total: 4 })
  })
})
