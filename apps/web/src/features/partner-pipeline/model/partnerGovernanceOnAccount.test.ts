import type { PartnerGovernanceReadiness } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { partnerGovernanceOnAccount } from './partnerGovernanceOnAccount'

const readiness = (
  risk: PartnerGovernanceReadiness['risk'],
  nextValidation: PartnerGovernanceReadiness['nextValidation'] = null,
): Pick<PartnerGovernanceReadiness, 'risk' | 'nextValidation'> => ({ risk, nextValidation })

const relation = (
  id: string,
  name: string,
  status: 'active' | 'rules_missing' | 'historical',
  risk: PartnerGovernanceReadiness['risk'] = 'none',
) => ({
  id,
  name,
  governanceStatus: status,
  governanceReadiness: readiness(risk, risk === 'none' ? null : 'margin_floor'),
})

describe('partnerGovernanceOnAccount (#3270.6 — surface Opportunité)', () => {
  it('rend le cadre de la relation désignée par un lien explicite, jamais par le nom', () => {
    const rows = partnerGovernanceOnAccount(
      [{ id: 'p1', name: 'Un autre libellé', rank: 'rank2', partner_relation_id: 'r1' }],
      [relation('r1', 'Halden Numérique', 'rules_missing', 'blocking')],
    )
    expect(rows).toEqual([
      {
        key: 'r1',
        name: 'Un autre libellé',
        status: 'rules_missing',
        risk: 'blocking',
        nextValidation: 'margin_floor',
      },
    ])
  })

  it('sans lien, rapproche par nom normalisé (même règle que la fiche Partenaires)', () => {
    const rows = partnerGovernanceOnAccount(
      [{ id: 'p1', name: '  orsan CONSEIL (exemple) ', rank: 'rank2', partner_relation_id: null }],
      [relation('r2', 'Orsan Conseil (exemple)', 'active')],
    )
    expect(rows.map(row => row.key)).toEqual(['r2'])
  })

  it('une présence rang 2 sans relation gouvernée ne fait AUCUNE ligne — pas de cadre inventé', () => {
    expect(
      partnerGovernanceOnAccount(
        [{ id: 'p1', name: 'Inconnue', rank: 'rank2', partner_relation_id: null }],
        [relation('r1', 'Autre', 'active')],
      ),
    ).toEqual([])
  })

  it('ne retient que le rang 2 : un rang 1 ou une ESN concurrente n’est pas une route partenaire', () => {
    const rows = partnerGovernanceOnAccount(
      [
        { id: 'p1', name: 'Alpha', rank: 'rank1', partner_relation_id: 'r1' },
        { id: 'p2', name: 'Beta', rank: 'unknown', partner_relation_id: 'r2' },
      ],
      [relation('r1', 'Alpha', 'active'), relation('r2', 'Beta', 'active')],
    )
    expect(rows).toEqual([])
  })

  it('une relation visée par deux présences ne s’affiche qu’une fois', () => {
    const rows = partnerGovernanceOnAccount(
      [
        { id: 'p1', name: 'Alpha', rank: 'rank2', partner_relation_id: 'r1' },
        { id: 'p2', name: 'Alpha bis', rank: 'rank2', partner_relation_id: 'r1' },
      ],
      [relation('r1', 'Alpha', 'active')],
    )
    expect(rows).toHaveLength(1)
  })

  it('lecture des relations absente ou en échec : rien, jamais un cadre « vide »', () => {
    expect(
      partnerGovernanceOnAccount([{ id: 'p1', name: 'A', rank: 'rank2', partner_relation_id: 'r1' }], undefined),
    ).toEqual([])
    expect(partnerGovernanceOnAccount(undefined, [relation('r1', 'A', 'active')])).toEqual([])
  })
})
