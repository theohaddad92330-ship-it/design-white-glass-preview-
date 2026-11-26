import type { CoverageGap } from '@bellum/contracts'
import { ORG_ENRICHMENT_WAVE_SIZE } from '@bellum/contracts'
import { selectEnrichmentCandidates, type TargetableContact } from './org-enrichment-targeting'

function contact(partial: Partial<TargetableContact> & { id: string }): TargetableContact {
  return {
    id: partial.id,
    fullName: partial.fullName ?? `Contact ${partial.id}`,
    title: partial.title ?? null,
    entity: partial.entity ?? null,
    family: partial.family ?? null,
    priority: partial.priority ?? null,
  }
}

function gap(partial: Partial<CoverageGap>): CoverageGap {
  return {
    family: 'cyber',
    family_label: 'Cyber / Sécurité',
    level: 'n1',
    level_label: 'N-1',
    label: 'Cyber / Sécurité — RSSI (N-1)',
    suggested_titles: 'RSSI',
    reason: 'Aucun contact cyber identifié',
    priority: 1,
    ...partial,
  }
}

describe('selectEnrichmentCandidates — next_batch', () => {
  it('ne retient que les contacts non encore enrichis (family === null)', () => {
    const contacts = [
      contact({ id: 'a', family: 'IT' }), // déjà enrichi — jamais renvoyé
      contact({ id: 'b' }),
      contact({ id: 'c' }),
    ]
    const result = selectEnrichmentCandidates(contacts, { mode: 'next_batch' }, {})
    expect(result.candidateIds).toEqual(['b', 'c'])
    expect(result.contactsTargeted).toEqual({ status: 'measured', value: 2 })
  })

  it('trie par priorité décroissante, puis garde l’ordre stable', () => {
    const contacts = [
      contact({ id: 'low', priority: 1 }),
      contact({ id: 'none' }),
      contact({ id: 'high', priority: 9 }),
    ]
    const result = selectEnrichmentCandidates(contacts, { mode: 'next_batch' }, {})
    expect(result.candidateIds).toEqual(['high', 'low', 'none'])
  })

  it('borne le nombre ciblé à une seule vague — jamais plus que ORG_ENRICHMENT_WAVE_SIZE', () => {
    const contacts = Array.from({ length: ORG_ENRICHMENT_WAVE_SIZE + 10 }, (_, i) => contact({ id: `c${i}` }))
    const result = selectEnrichmentCandidates(contacts, { mode: 'next_batch' }, {})
    expect(result.candidateIds).toHaveLength(ORG_ENRICHMENT_WAVE_SIZE)
    expect(result.contactsTargeted).toEqual({ status: 'measured', value: ORG_ENRICHMENT_WAVE_SIZE })
  })

  it('un compte sans rien à enrichir rend un ZÉRO mesuré, jamais « unknown »', () => {
    const result = selectEnrichmentCandidates([contact({ id: 'a', family: 'IT' })], { mode: 'next_batch' }, {})
    expect(result.contactsTargeted).toEqual({ status: 'measured', value: 0 })
    expect(result.candidateIds).toEqual([])
  })
})

describe('selectEnrichmentCandidates — direction', () => {
  const contacts = [
    contact({ id: 'a', entity: 'Engineering', family: 'IT' }), // déjà enrichi, hors périmètre de la vague
    contact({ id: 'b', entity: 'Engineering' }),
    contact({ id: 'c', entity: 'Finance' }),
    contact({ id: 'd', entity: 'Engineering' }),
  ]

  it('borne aux contacts NON enrichis de l’entité demandée', () => {
    const result = selectEnrichmentCandidates(contacts, { mode: 'direction', entity: 'Engineering' }, {})
    expect(result.candidateIds.sort()).toEqual(['b', 'd'])
    expect(result.scopeLabel).toContain('Engineering')
  })

  it('compare insensible à la casse et aux espaces', () => {
    const result = selectEnrichmentCandidates(contacts, { mode: 'direction', entity: '  engineering ' }, {})
    expect(result.candidateIds.sort()).toEqual(['b', 'd'])
  })

  it('zéro contact restant dans cette entité est un ZÉRO mesuré, pas un inconnu', () => {
    const result = selectEnrichmentCandidates(contacts, { mode: 'direction', entity: 'Introuvable' }, {})
    expect(result.contactsTargeted).toEqual({ status: 'measured', value: 0 })
  })
})

describe('selectEnrichmentCandidates — missing_roles', () => {
  const contacts = [
    contact({ id: 'a', title: 'RSSI Groupe' }), // cyber
    contact({ id: 'b', title: 'Directeur Achats IT' }), // achat
    contact({ id: 'c', title: 'Développeur backend' }), // dev — hors zones à couvrir
    contact({ id: 'd', title: 'RSSI Groupe', family: 'Cyber' }), // déjà enrichi
  ]

  it('cible les familles des zones à couvrir, via le classifieur déterministe existant', () => {
    const gaps = [gap({ family: 'cyber', priority: 1 }), gap({ family: 'achat', family_label: 'Achats', priority: 2 })]
    const result = selectEnrichmentCandidates(contacts, { mode: 'missing_roles' }, { coverageGaps: gaps })
    expect(result.candidateIds.sort()).toEqual(['a', 'b'])
    expect(result.scopeLabel).toContain('Cyber')
    expect(result.scopeLabel).toContain('Achats')
  })

  it('un compte SANS zone à couvrir rend un ZÉRO mesuré — il est réellement couvert', () => {
    const result = selectEnrichmentCandidates(contacts, { mode: 'missing_roles' }, { coverageGaps: [] })
    expect(result.contactsTargeted).toEqual({ status: 'measured', value: 0 })
  })

  it('coverage indisponible (service optionnel absent) rend un INCONNU nommé, jamais 0', () => {
    const result = selectEnrichmentCandidates(contacts, { mode: 'missing_roles' }, { coverageGaps: null })
    expect(result.contactsTargeted.status).toBe('unknown')
    if (result.contactsTargeted.status === 'unknown') {
      expect(result.contactsTargeted.reason.length).toBeGreaterThan(0)
    }
  })
})

describe('selectEnrichmentCandidates — hierarchy_level', () => {
  const contacts = [
    contact({ id: 'a', title: 'Directeur Général' }), // c_level → L1
    contact({ id: 'b', title: 'Directeur Technique' }), // direction → L2
    contact({ id: 'c', title: 'Engineering Manager' }), // management → L3
    contact({ id: 'd', title: 'Architecte Cloud' }), // expert → L4
    contact({ id: 'e', title: 'Développeur' }), // operationnel → L4
    contact({ id: 'f', title: 'Sourcing IT' }), // family Achat → L5, niveau non déterminable
  ]

  it('L2 + L3 (la maquette) retrouve direction ET management', () => {
    const result = selectEnrichmentCandidates(contacts, { mode: 'hierarchy_level', hierarchyLevels: ['L2', 'L3'] }, {})
    expect(result.candidateIds.sort()).toEqual(['b', 'c'])
  })

  it('L4 réunit expert ET opérationnel', () => {
    const result = selectEnrichmentCandidates(contacts, { mode: 'hierarchy_level', hierarchyLevels: ['L4'] }, {})
    expect(result.candidateIds.sort()).toEqual(['d', 'e'])
  })

  it('L5 (Achats/contrôle) est un axe PARALLÈLE, résolu par la famille pas la séniorité', () => {
    const result = selectEnrichmentCandidates(contacts, { mode: 'hierarchy_level', hierarchyLevels: ['L5'] }, {})
    expect(result.candidateIds).toEqual(['f'])
  })

  it('L0 seul (gouvernance) n’est pas déterminable depuis le titre — INCONNU nommé', () => {
    const result = selectEnrichmentCandidates(contacts, { mode: 'hierarchy_level', hierarchyLevels: ['L0'] }, {})
    expect(result.contactsTargeted.status).toBe('unknown')
  })
})

describe('selectEnrichmentCandidates — full_account', () => {
  it('cible TOUS les contacts non encore enrichis, sans plafond de vague', () => {
    const contacts = Array.from({ length: ORG_ENRICHMENT_WAVE_SIZE * 2 + 3 }, (_, i) => contact({ id: `c${i}` }))
    const result = selectEnrichmentCandidates(contacts, { mode: 'full_account' }, {})
    expect(result.candidateIds).toHaveLength(contacts.length)
    expect(result.contactsTargeted).toEqual({ status: 'measured', value: contacts.length })
  })
})
