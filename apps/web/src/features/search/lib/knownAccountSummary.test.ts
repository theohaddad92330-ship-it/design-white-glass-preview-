import { describe, expect, it } from 'vitest'
import type { Account, Contact, RecordFieldAudit } from '@bellum/contracts'
import {
  deriveKnownContactsSummary,
  deriveKnownCorrectionsSummary,
  deriveKnownFreshSignalsSummary,
  deriveKnownIdentitySummary,
  deriveKnownWorkspaceAnalysisSummary,
} from './knownAccountSummary'

function contact(source_tag: Contact['source_tag']): Contact {
  return { source_tag } as Contact
}

function account(over: Partial<Account> = {}): Account {
  return {
    id: 'acc-1',
    company_name: 'ACME',
    sector: null,
    employees: null,
    revenue: null,
    headquarters: null,
    website: null,
    siren: null,
    naf_code: null,
    trade_name: null,
    last_analyzed_at: null,
    raw_analysis: null,
    ...over,
  } as Account
}

describe('deriveKnownContactsSummary (#2163.48, #2163.53-.56)', () => {
  it('bloc ABSENT (null) sans aucun contact — jamais un bloc à zéro', () => {
    expect(deriveKnownContactsSummary([])).toBeNull()
  })

  it('compte les FAITS (INTERNE/PUBLIC/RISQUE/ARRIVEE) séparément des HYPOTHÈSES', () => {
    const contacts = [
      contact('INTERNE'),
      contact('PUBLIC'),
      contact('RISQUE'),
      contact('ARRIVEE'),
      contact('HYPOTHÈSE'),
    ]
    expect(deriveKnownContactsSummary(contacts)).toEqual({ total: 5, facts: 4, hypotheses: 1 })
  })

  it('un contact sans source_tag calculé (ancien instantané) compte en HYPOTHÈSE, jamais en fait', () => {
    expect(deriveKnownContactsSummary([contact(null), contact(undefined)])).toEqual({
      total: 2,
      facts: 0,
      hypotheses: 2,
    })
  })

  it('tous faits — zéro hypothèse, jamais absent pour autant (un compte réel a une donnée)', () => {
    expect(deriveKnownContactsSummary([contact('INTERNE')])).toEqual({ total: 1, facts: 1, hypotheses: 0 })
  })
})

describe('deriveKnownIdentitySummary (#2163.46)', () => {
  it('bloc ABSENT sans compte source', () => {
    expect(deriveKnownIdentitySummary(null)).toBeNull()
  })

  it('bloc ABSENT quand rien n’est connu — jamais un bloc vide', () => {
    expect(deriveKnownIdentitySummary(account())).toBeNull()
  })

  it('ne nomme QUE les champs connus, jamais ceux qui manquent (« on n’affiche pas ce qu’on n’a pas »)', () => {
    const summary = deriveKnownIdentitySummary(account({ sector: 'Média', siren: '326300159' }))
    expect(summary).toEqual({ knownFields: ['sector', 'siren'] })
  })

  it('reconnaît tous les champs d’identité, un par un', () => {
    const summary = deriveKnownIdentitySummary(
      account({
        sector: 'Média',
        employees: '500-1000',
        headquarters: 'Paris',
        siren: '326300159',
        naf_code: '62.01Z',
        trade_name: 'ACME France',
      }),
    )
    expect(summary?.knownFields).toEqual(['tradeName', 'sector', 'employees', 'headquarters', 'siren', 'nafCode'])
  })
})

describe('deriveKnownWorkspaceAnalysisSummary (#2163.47)', () => {
  it('bloc ABSENT — société jamais analysée dans cet espace', () => {
    expect(deriveKnownWorkspaceAnalysisSummary(account({ last_analyzed_at: null }))).toBeNull()
  })

  it('bloc ABSENT sans compte source', () => {
    expect(deriveKnownWorkspaceAnalysisSummary(null)).toBeNull()
  })

  it('nomme la date de la dernière analyse TERMINÉE, jamais devinée', () => {
    expect(deriveKnownWorkspaceAnalysisSummary(account({ last_analyzed_at: '2026-08-01T00:00:00.000Z' }))).toEqual({
      lastAnalyzedAt: '2026-08-01T00:00:00.000Z',
    })
  })
})

describe('deriveKnownFreshSignalsSummary (#2163.51)', () => {
  it('bloc ABSENT sans compte source', () => {
    expect(deriveKnownFreshSignalsSummary(null)).toBeNull()
  })

  it('bloc ABSENT — aucun signal encore frais (« current »)', () => {
    const summary = deriveKnownFreshSignalsSummary(
      account({ raw_analysis: { recentSignals: [{ id: 's1', signal: 'x', freshness: 'archive' }] } }),
    )
    expect(summary).toBeNull()
  })

  it('compte les signaux ENCORE FRAIS, jamais les archivés ni les non datés', () => {
    const summary = deriveKnownFreshSignalsSummary(
      account({
        raw_analysis: {
          recentSignals: [
            { id: 's1', signal: 'recrute 12 data engineers', freshness: 'current' },
            { id: 's2', signal: 'lève 40M€', freshness: 'current' },
            { id: 's3', signal: 'vieux communiqué', freshness: 'archive' },
            { id: 's4', signal: 'date inconnue', freshness: 'undated' },
          ],
        },
      }),
    )
    expect(summary).toEqual({ current: 2 })
  })
})

function correction(over: Partial<RecordFieldAudit> = {}): RecordFieldAudit {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    entityType: 'account',
    entityId: 'acc-1',
    field: 'headquarters',
    oldValue: 'La Défense',
    newValue: 'Paris',
    source: 'human',
    actorId: '33333333-3333-4333-8333-333333333333',
    actorName: 'Louis',
    createdAt: '2026-09-18T09:00:00.000Z',
    rule: null,
    ...over,
  }
}

describe('deriveKnownCorrectionsSummary (#2163.52)', () => {
  it('bloc ABSENT sans entrées', () => {
    expect(deriveKnownCorrectionsSummary(undefined)).toBeNull()
    expect(deriveKnownCorrectionsSummary([])).toBeNull()
  })

  it('compte le TOTAL des corrections, jamais un statut deviné', () => {
    expect(deriveKnownCorrectionsSummary([correction(), correction({ id: '2' })])).toEqual({ total: 2 })
  })
})
