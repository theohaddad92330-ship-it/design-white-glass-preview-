import { describe, expect, it } from 'vitest'
import type { PartnerGovernanceReadiness, PartnerGovernanceStatus } from '@bellum/contracts'
import { summarizePartnerGovernance } from './partner-governance-summary'

const readiness = (over: Partial<PartnerGovernanceReadiness> = {}): PartnerGovernanceReadiness => ({
  framed: [],
  missing: [],
  risk: 'none',
  accountsConcerned: [],
  profilesConcerned: [],
  nextValidation: null,
  ...over,
})
const rel = (name: string, status: PartnerGovernanceStatus, r: Partial<PartnerGovernanceReadiness> = {}) => ({
  id: name,
  name,
  governanceStatus: status,
  governanceReadiness: readiness(r),
})

describe('summarizePartnerGovernance (#3270.6, surface Pilotage)', () => {
  it('ne compte que les statuts présents : une absence ne fait aucune ligne', () => {
    const s = summarizePartnerGovernance([rel('A', 'active'), rel('B', 'active'), rel('C', 'blocked')])
    expect(s.byStatus).toEqual([
      { status: 'active', count: 2 },
      { status: 'blocked', count: 1 },
    ])
  })

  it('range les statuts dans l’ordre du cadre (observed → historical)', () => {
    const s = summarizePartnerGovernance([rel('A', 'historical'), rel('B', 'observed'), rel('C', 'rules_missing')])
    expect(s.byStatus.map(row => row.status)).toEqual(['observed', 'rules_missing', 'historical'])
  })

  it('liste à cadrer : le risque bloquant avant l’attention, trois au plus, et jamais un partenaire sans risque', () => {
    const s = summarizePartnerGovernance([
      rel('Calme', 'active'),
      rel('Attention1', 'rules_missing', { risk: 'attention', nextValidation: 'margin_floor' }),
      rel('Bloque', 'blocked', { risk: 'blocking', nextValidation: 'non_circumvention' }),
      rel('Attention2', 'to_qualify', { risk: 'attention' }),
      rel('Attention3', 'to_qualify', { risk: 'attention' }),
    ])
    expect(s.toFrame.map(r => r.name)).toEqual(['Bloque', 'Attention1', 'Attention2'])
    expect(s.toFrame[0]?.nextValidation).toBe('non_circumvention')
    expect(s.toFrameTotal).toBe(4)
  })

  it('une relation « historique » ou « en pause » n’est jamais à cadrer, même à risque', () => {
    const s = summarizePartnerGovernance([
      rel('Vieux', 'historical', { risk: 'blocking' }),
      rel('Pause', 'paused', { risk: 'attention' }),
    ])
    expect(s.toFrame).toEqual([])
  })

  it('aucune relation : rien du tout', () => {
    expect(summarizePartnerGovernance([])).toEqual({ total: 0, byStatus: [], toFrame: [], toFrameTotal: 0 })
  })
})
