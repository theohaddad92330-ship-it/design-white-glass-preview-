import type { RunTrace } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import type { ApprovalRequestView } from './api'
import {
  approvalFacts,
  availableValues,
  crmWriteFacts,
  erpWriteFacts,
  matchesQueueFilters,
  playbookSendFacts,
} from './queueFilters'

/**
 * #2200.39 / #2200.42 / #2200.43 — LES FAITS DE LA FILE « À VALIDER ».
 *
 * Chaque famille de carte (approbation générique, écriture CRM, écriture ERP,
 * relance de playbook) porte une donnée différente pour risque/agent/source —
 * parfois aucune. La doctrine du dépôt (« on n'affiche pas ce qu'on n'a pas »)
 * interdit de deviner : une famille sans donnée rend `null`, jamais une valeur
 * par défaut, et ne matche donc aucun filtre actif sur cette dimension.
 */

// ⚠️ Type EXPLICITE (`RunTrace`, jamais requêté via `approval().trace`, qui
// serait `RunTrace | undefined` — un champ optionnel étalé rend TOUTES ses
// propriétés optionnelles, ce que `pnpm check-types` refuse à raison.
const DEFAULT_TRACE: RunTrace = {
  trigger: 'manual',
  triggeredByName: null,
  approvedByName: null,
  approvedAt: null,
  accountName: null,
}

function approval(overrides: Partial<ApprovalRequestView> = {}): ApprovalRequestView {
  return {
    id: 'ap-1',
    run_id: 'run-1',
    required_level: 'n2_user_approval',
    state: 'pending',
    summary: 'Ajouter une note CRM',
    estimated_credits: 1,
    expires_at: '2026-10-01T00:00:00.000Z',
    created_at: '2026-09-23T00:00:00.000Z',
    trace: DEFAULT_TRACE,
    risk: null,
    ...overrides,
  }
}

describe('approvalFacts — la carte générique de l’Action OS', () => {
  it('un déclencheur nommé est un agent HUMAIN', () => {
    const facts = approvalFacts(approval({ trace: { ...DEFAULT_TRACE, triggeredByName: 'Louis Schlegel' } }))
    expect(facts.agent).toBe('human')
  })

  it('aucun nom = déclenchée par une AUTOMATISATION — jamais une supposition', () => {
    const facts = approvalFacts(approval({ trace: { ...DEFAULT_TRACE, triggeredByName: null } }))
    expect(facts.agent).toBe('automation')
  })

  it('la source vient du déclencheur du run', () => {
    const facts = approvalFacts(approval({ trace: { ...DEFAULT_TRACE, trigger: 'signal_detected' } }))
    expect(facts.source).toBe('signal_detected')
  })

  it('le risque est celui calculé côté serveur, jamais recalculé ici', () => {
    const facts = approvalFacts(approval({ risk: 'high' }))
    expect(facts.risk).toBe('high')
  })
})

describe('crmWriteFacts — une écriture CRM', () => {
  const request = {
    id: 'w-1',
    kind: 'enroll_sequence' as const,
    preview: [],
    origin: 'system' as const,
    createdAt: '2026-09-01T00:00:00.000Z',
    expiresAt: '2026-09-04T00:00:00.000Z',
    requestedByYou: false,
    target: {
      accountId: null,
      accountName: null,
      contactId: null,
      contactName: null,
      ownerId: 'u-1',
      ownerName: 'Louis',
      channel: null,
      risk: 'medium' as const,
      source: null,
    },
  }

  it('origin=system => agent automatisation', () => {
    expect(crmWriteFacts(request).agent).toBe('automation')
  })

  it('origin=user => agent humain', () => {
    expect(crmWriteFacts({ ...request, origin: 'user' }).agent).toBe('human')
  })

  it('reprend le risque déjà calculé par kind', () => {
    expect(crmWriteFacts(request).risk).toBe('medium')
  })

  it('aucune source nommée pour une écriture CRM — jamais devinée', () => {
    expect(crmWriteFacts(request).source).toBeNull()
  })
})

describe('erpWriteFacts et playbookSendFacts — pas encore de donnée à la bonne maille', () => {
  it('une écriture ERP ne porte aucun des trois faits aujourd’hui', () => {
    const facts = erpWriteFacts({
      id: 'e-1',
      kind: 'update_tjm',
      preview: 'Passer le TJM à 700€',
      createdAt: '2026-09-01T00:00:00.000Z',
      expiresAt: '2026-09-04T00:00:00.000Z',
      requestedByYou: false,
      canDecide: true,
      blockedReason: null,
    })
    expect(facts).toEqual({ risk: null, agent: null, source: null })
  })

  it('une relance de playbook est TOUJOURS automatisée — un fait de la capacité, jamais deviné par carte', () => {
    const facts = playbookSendFacts({
      id: 'p-1',
      playbook: 'stale_pipeline' as never,
      recipient: 'client@example.com',
      subject: 'Suivi',
      body: 'Bonjour',
      requestedAt: '2026-09-01T00:00:00.000Z',
      expiresAt: '2026-09-04T00:00:00.000Z',
    })
    expect(facts.agent).toBe('automation')
    expect(facts.risk).toBeNull()
    expect(facts.source).toBeNull()
  })
})

describe('matchesQueueFilters', () => {
  it('sans filtre actif, tout matche', () => {
    expect(matchesQueueFilters({ risk: null, agent: null, source: null }, {})).toBe(true)
  })

  it('un filtre risque exclut une carte sans risque connu — pas de fausse correspondance', () => {
    expect(matchesQueueFilters({ risk: null, agent: 'human', source: 'manual' }, { risk: 'high' })).toBe(false)
  })

  it('un filtre agent exclut une carte du mauvais agent', () => {
    expect(matchesQueueFilters({ risk: null, agent: 'human', source: null }, { agent: 'automation' })).toBe(false)
  })

  it('les trois filtres se combinent en ET', () => {
    const facts = { risk: 'medium' as const, agent: 'automation' as const, source: 'manual' }
    expect(matchesQueueFilters(facts, { risk: 'medium', agent: 'automation', source: 'manual' })).toBe(true)
    expect(matchesQueueFilters(facts, { risk: 'medium', agent: 'automation', source: 'signal_detected' })).toBe(false)
  })
})

describe('availableValues — doctrine « on n’affiche pas ce qu’on n’a pas »', () => {
  it('ne retient que les valeurs réellement présentes, sans doublon', () => {
    expect(availableValues(['low', null, 'low', 'high', null])).toEqual(['low', 'high'])
  })

  it('un tableau entièrement vide de données rend un tableau vide — aucune option fantôme', () => {
    expect(availableValues([null, null])).toEqual([])
  })
})
