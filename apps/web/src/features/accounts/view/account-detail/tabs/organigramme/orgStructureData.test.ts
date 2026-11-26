import { describe, expect, it } from 'vitest'
import { buildOrgStructureData } from './orgStructureData'

// The real EDF payload shape: everything lives under `raw_analysis.org`.
const EDF = {
  org: {
    organigramme: [
      {
        level: 'groupe',
        entity: 'EDF SA (Groupe holding)',
        contacts: ['Patrick Charignon'],
        missingRoles: ['CEO/Président', 'CFO', 'Directeur Général'],
      },
      {
        level: 'direction',
        entity: 'DSIT (Direction des Systèmes d’Information et Télécoms)',
        contacts: ['François Raynaud', 'Olivier Ligneul'],
        missingRoles: ['Responsable Infrastructure Cloud'],
      },
    ],
    decisionChain: {
      description: "Processus d'achat centralisé.",
      steps: [{ step: '1. Identification du besoin', actors: ['Olivier Ligneul'], duration: '2 semaines' }],
      estimatedCycleLength: '6 mois',
      budgetAuthority: 'DSIT au-delà de 100 k€',
    },
    approach_order: [
      { step: 2, contact: 'Patrick Charignon', role: 'sponsor', why_first: 'Valide le budget' },
      { step: 1, contact: 'Franck Michon', role: 'champion', why_first: 'Décideur opérationnel direct' },
    ],
    stakeholderMap: [{ fullName: 'Olivier Ligneul', stance: 'advocate', reasoning: 'Pilote la modernisation' }],
  },
}

describe('buildOrgStructureData', () => {
  it('reads the block under raw_analysis.org, not a top-level key', () => {
    // The whole reason the tab was blank: `raw_analysis.organigramme` does not
    // exist — the array is at `raw_analysis.org.organigramme`.
    const data = buildOrgStructureData(EDF)
    expect(data.units.map(u => u.entity)).toEqual([
      'EDF SA (Groupe holding)',
      'DSIT (Direction des Systèmes d’Information et Télécoms)',
    ])
    expect(data.isEmpty).toBe(false)
  })

  it('keeps the uncovered roles as-is — they are information, not a hole to fill', () => {
    const data = buildOrgStructureData(EDF)
    expect(data.units[0]?.missingRoles).toEqual(['CEO/Président', 'CFO', 'Directeur Général'])
    expect(data.units[0]?.contacts).toEqual(['Patrick Charignon'])
  })

  it('drops the prose instruction the prompt puts first in the array', () => {
    const data = buildOrgStructureData({
      org: { organigramme: ['(MINIMUM 2 entites) Structure hierarchique :', { entity: 'DSIT' }] },
    })
    expect(data.units).toHaveLength(1)
    expect(data.units[0]?.entity).toBe('DSIT')
  })

  it('orders the approach sequence by step, not by array order', () => {
    const data = buildOrgStructureData(EDF)
    expect(data.approachOrder.map(s => s.contact)).toEqual(['Franck Michon', 'Patrick Charignon'])
  })

  it('reads the decision chain including its steps and budget authority', () => {
    const chain = buildOrgStructureData(EDF).decisionChain
    expect(chain?.estimatedCycleLength).toBe('6 mois')
    expect(chain?.budgetAuthority).toBe('DSIT au-delà de 100 k€')
    expect(chain?.steps[0]?.actors).toEqual(['Olivier Ligneul'])
  })

  it('keeps a known stance and falls back to unknown for anything else', () => {
    expect(buildOrgStructureData(EDF).stakeholders[0]?.stance).toBe('advocate')
    const odd = buildOrgStructureData({ org: { stakeholderMap: [{ fullName: 'X', stance: 'enthusiastic' }] } })
    expect(odd.stakeholders[0]?.stance).toBe('unknown')
  })

  it('reports empty for an analysis without an org block — never throws', () => {
    for (const input of [{}, null, undefined, 'nope', { org: {} }, { org: { organigramme: [] } }]) {
      expect(buildOrgStructureData(input).isEmpty).toBe(true)
    }
  })

  it('tolerates the block already unwrapped', () => {
    expect(buildOrgStructureData({ organigramme: [{ entity: 'DSIT' }] }).units).toHaveLength(1)
  })

  // `buyingCommittee` is assembled deterministically by the IA (not a prompt
  // field), so its shape is stable enough to render — these lock the read.
  describe('buyingCommittee', () => {
    const COMMITTEE = {
      org: {
        buyingCommittee: {
          members: [
            {
              fullName: 'Marc Petit',
              title: 'DSI',
              entity: 'DSIT',
              committeeRole: 'technical_buyer',
              roleLabel: 'Décideur IT',
              power: 4,
              interest: 3,
              quadrant: 'CHAMPIONS',
              cadence: 'hebdomadaire',
              engagementAction: 'Co-construire le cadrage technique',
              evidenceLevel: 'named',
              evidenceLevelLabel: 'Nommé',
            },
          ],
          byQuadrant: { CHAMPIONS: ['Marc Petit'] },
          roleCoverage: { technical_buyer: 1 },
          missingRoles: ['economic_buyer', 'champion'],
          summary: "Comité d'achat : 1 décideur it. Sièges à couvrir : décideur budget, champion.",
        },
      },
    }

    it('reads the members, their matrix position and the seats left to cover', () => {
      const committee = buildOrgStructureData(COMMITTEE).committee
      expect(committee?.members).toHaveLength(1)
      expect(committee?.members[0]).toMatchObject({
        fullName: 'Marc Petit',
        roleLabel: 'Décideur IT',
        power: 4,
        interest: 3,
        quadrant: 'CHAMPIONS',
        cadence: 'hebdomadaire',
      })
      expect(committee?.missingRoles).toEqual(['economic_buyer', 'champion'])
      expect(committee?.summary).toContain('Sièges à couvrir')
    })

    // #2311.24 — le niveau de preuve du siège, déjà résolu par l'IA (jamais
    // re-dérivé côté web, même règle que `roleLabel`).
    it('reads the evidence level, already resolved — never re-derived here', () => {
      const committee = buildOrgStructureData(COMMITTEE).committee
      expect(committee?.members[0]).toMatchObject({
        evidenceLevel: 'named',
        evidenceLevelLabel: 'Nommé',
      })
    })

    it('a member with neither evidence field rends null, never a fabricated level', () => {
      const data = buildOrgStructureData({
        org: { buyingCommittee: { members: [{ title: 'RSSI' }], missingRoles: [] } },
      })
      expect(data.committee?.members[0]).toMatchObject({ evidenceLevel: null, evidenceLevelLabel: null })
    })

    // #3263.20 — la source du contact (`contact.source`), recroisée sur le siège,
    // déjà résolue par l'IA (même règle que `roleLabel`/`evidenceLevelLabel`).
    it('reads the member source, already resolved — never re-derived here', () => {
      const committee = buildOrgStructureData({
        org: {
          buyingCommittee: {
            members: [{ fullName: 'Marc Petit', title: 'DSI', source: 'apollo' }],
            missingRoles: [],
          },
        },
      }).committee
      expect(committee?.members[0]).toMatchObject({ source: 'apollo' })
    })

    it('a member with no source rends null, never a fabricated one', () => {
      const data = buildOrgStructureData({
        org: { buyingCommittee: { members: [{ title: 'RSSI' }], missingRoles: [] } },
      })
      expect(data.committee?.members[0]).toMatchObject({ source: null })
    })

    it('drops a member with neither name nor title instead of rendering an anonymous seat', () => {
      const data = buildOrgStructureData({
        org: { buyingCommittee: { members: [{ power: 4 }, { title: 'RSSI' }], missingRoles: [] } },
      })
      expect(data.committee?.members.map(m => m.title)).toEqual(['RSSI'])
    })

    it('rejects an out-of-range Power/Interest rather than displaying it', () => {
      const data = buildOrgStructureData({
        org: { buyingCommittee: { members: [{ fullName: 'X', power: 9, interest: -1 }] } },
      })
      expect(data.committee?.members[0]).toMatchObject({ power: null, interest: null })
    })

    it('is null (section hidden) when the analysis placed nobody', () => {
      expect(
        buildOrgStructureData({ org: { buyingCommittee: { members: [], missingRoles: [] } } }).committee,
      ).toBeNull()
      expect(buildOrgStructureData({ org: {} }).committee).toBeNull()
    })

    it('a committee alone is enough for the block not to read as empty', () => {
      expect(buildOrgStructureData(COMMITTEE).isEmpty).toBe(false)
    })
  })

  // `uncoveredZones` is deliberately NOT read: same meaning as the deterministic
  // "Zones blanches" tab, different (LLM) source — one surface, one source.
  it('does not surface uncoveredZones (the Zones blanches tab owns that question)', () => {
    const data = buildOrgStructureData({
      org: { uncoveredZones: [{ zone: 'Direction Achats', importance: 'critique' }] },
    })
    expect(data.isEmpty).toBe(true)
    expect(JSON.stringify(data)).not.toContain('Direction Achats')
  })

  it('drops rows without an entity or contact name rather than rendering blanks', () => {
    const data = buildOrgStructureData({
      org: {
        organigramme: [{ level: 'groupe' }],
        approach_order: [{ step: 1 }],
        stakeholderMap: [{ stance: 'neutral' }],
      },
    })
    expect(data.units).toEqual([])
    expect(data.approachOrder).toEqual([])
    expect(data.stakeholders).toEqual([])
  })
})
