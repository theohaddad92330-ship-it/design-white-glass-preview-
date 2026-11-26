import { describe, expect, it } from 'vitest'
import type { MatchAxisResult } from '@bellum/contracts'
import { matchCriteriaCounts } from './matchCriteriaCounts'

const axis = (score: number | null): Pick<MatchAxisResult, 'score'> => ({ score })

describe('matchCriteriaCounts — Théo C projects-rapprochement.R1/N3', () => {
  it('étayé = axe évalué, à confirmer = axe non évaluable', () => {
    expect(matchCriteriaCounts([axis(80), axis(0), axis(null)])).toEqual({ backed: 2, toConfirm: 1 })
  })
  it('un score 0 mesuré reste étayé — seul null sort', () => {
    expect(matchCriteriaCounts([axis(0)])).toEqual({ backed: 1, toConfirm: 0 })
  })
  it('aucun axe → null : on n’affiche pas « 0 critère »', () => {
    expect(matchCriteriaCounts([])).toBeNull()
  })
})
