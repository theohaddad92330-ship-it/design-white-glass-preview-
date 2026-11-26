import { describe, expect, it } from 'vitest'
import { REFRESH_DIMENSION_CREDIT_COST, REFRESH_MIN_INTERVAL_MS } from './analysis.js'
import {
  accountIdsInReply,
  buildDeepenQuote,
  deepenActionsFor,
  deepenLevel,
  deepenQuoteRequestSchema,
  deepenTargetsFor,
  summarizeDeepenRun,
  DEEPEN_MAX_ACCOUNTS,
  type DeepenAccountState,
} from './chat-deepen.js'
import type { RefreshDiff } from './refresh-explained.js'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const NOW = new Date('2026-09-22T20:00:00.000Z')
const HOUR = 3_600_000
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString()
const COST = REFRESH_DIMENSION_CREDIT_COST.signals

function account(id: string, over: Partial<DeepenAccountState> = {}): DeepenAccountState {
  return {
    accountId: id,
    name: id === A ? 'Acme' : 'Beta',
    hasDossier: true,
    invested: 0,
    freshness: { signals: null, contacts: null, entities: null, strategy: null },
    ...over,
  }
}

describe('#2452.3 — les actions proposées dépendent de la réponse', () => {
  it('une réponse sans compte ne propose RIEN', () => {
    expect(deepenActionsFor(0)).toEqual([])
  })
  it('un seul compte : pas de « cinq premiers »', () => {
    const ids = deepenActionsFor(1)
    expect(ids).toContain('verify_now')
    expect(ids).toContain('refresh_contacts')
    expect(ids).not.toContain('deepen_top_five')
  })
  it('plusieurs comptes : les sept actions de l’issue, plus #2263.20', () => {
    expect(deepenActionsFor(3)).toHaveLength(8)
  })
  // #2263.20 — « offrir de vérifier un poste » : seul axe des six de
  // l'ACTUALISATION CIBLÉE absent des actions de chat (les cinq autres —
  // contacts, signaux, filiale, coordonnée, dossier complet — existaient déjà
  // ou passent par un autre outil). Le moteur (`AnalysisRefreshService`,
  // RefreshDimension `positions`) existe et coûte déjà séparément côté
  // fiche de compte (`AccountRefreshMenu.tsx`) ; il ne manquait qu'à cette
  // table de traduction.
  it('un seul compte propose aussi « vérifier un poste »', () => {
    expect(deepenActionsFor(1)).toContain('verify_position')
  })
  it('« vérifier un poste » cible l’axe `positions`, sur le premier compte seulement', () => {
    expect(deepenTargetsFor('verify_position', [A, B])).toEqual([{ accountId: A, dimension: 'positions' }])
  })
})

describe('accountIdsInReply — les comptes que la réponse CITE, dans son ordre', () => {
  it('lit les liens de fiche, dédoublonne, garde l’ordre, borne à cinq', () => {
    const ids = Array.from({ length: 7 }, (_, i) => `${i}${A.slice(1)}`)
    const text =
      `[X](/accounts/${B}) puis /accounts/${A} et encore /accounts/${B} ` + ids.map(id => `/accounts/${id}`).join(' ')
    const out = accountIdsInReply(text)
    expect(out.slice(0, 2)).toEqual([B, A])
    expect(out).toHaveLength(DEEPEN_MAX_ACCOUNTS)
  })
  it('un texte sans lien de fiche ne rend rien', () => {
    expect(accountIdsInReply('Acme est un bon compte.')).toEqual([])
  })
})

describe('deepenTargetsFor', () => {
  it('« Approfondir les cinq premiers » vise chaque compte, « Actualiser les contacts » le premier seulement', () => {
    expect(deepenTargetsFor('deepen_top_five', [A, B]).map(t => t.accountId)).toEqual(expect.arrayContaining([A, B]))
    expect(deepenTargetsFor('refresh_contacts', [A, B])).toEqual([{ accountId: A, dimension: 'contacts' }])
  })
})

describe('#2452.2 / #2452.4 / #2452.5 — réutiliser, ne relancer que le delta', () => {
  it('une section fraîche est RÉUTILISÉE (0 crédit), une section périmée est relancée', () => {
    const quote = buildDeepenQuote({
      targets: [
        { accountId: A, dimension: 'signals' },
        { accountId: A, dimension: 'contacts' },
      ],
      accounts: [
        account(A, { invested: 2, freshness: { signals: ago(HOUR), contacts: null, entities: null, strategy: null } }),
      ],
      remaining: 10,
      now: NOW,
    })
    expect(quote.lines.map(l => [l.dimension, l.status, l.cost])).toEqual([
      ['signals', 'reuse', 0],
      ['contacts', 'run', REFRESH_DIMENSION_CREDIT_COST.contacts],
    ])
    expect(quote.alreadyInvested).toBe(2)
    expect(quote.delta).toBe(REFRESH_DIMENSION_CREDIT_COST.contacts)
    expect(quote.sufficient).toBe(true)
  })

  it('deux axes de la MÊME phase ne se paient qu’une fois (jamais refacturer la même recherche)', () => {
    const quote = buildDeepenQuote({
      targets: [
        { accountId: A, dimension: 'signals' },
        { accountId: A, dimension: 'identity_group' },
      ],
      accounts: [account(A)],
      remaining: 10,
      now: NOW,
    })
    expect(quote.lines.map(l => l.status)).toEqual(['run', 'same_phase'])
    expect(quote.delta).toBe(COST)
  })

  it('au-delà de la fenêtre de fraîcheur, la section se relance', () => {
    const quote = buildDeepenQuote({
      targets: [{ accountId: A, dimension: 'signals' }],
      accounts: [
        account(A, {
          freshness: { signals: ago(REFRESH_MIN_INTERVAL_MS + HOUR), contacts: null, entities: null, strategy: null },
        }),
      ],
      remaining: 10,
      now: NOW,
    })
    expect(quote.lines[0]?.status).toBe('run')
  })

  it('un compte sans dossier se NOMME, sans coût inventé ; un compte introuvable ne fait aucune ligne', () => {
    const quote = buildDeepenQuote({
      targets: [
        { accountId: A, dimension: 'signals' },
        { accountId: B, dimension: 'signals' },
      ],
      accounts: [account(A, { hasDossier: false })],
      remaining: 10,
      now: NOW,
    })
    expect(quote.lines).toEqual([expect.objectContaining({ accountId: A, status: 'no_dossier', cost: 0 })])
    expect(quote.delta).toBe(0)
  })

  it('un solde insuffisant se dit AVANT de lancer', () => {
    const quote = buildDeepenQuote({
      targets: [{ accountId: A, dimension: 'signals' }],
      accounts: [account(A)],
      remaining: 0,
      now: NOW,
    })
    expect(quote.sufficient).toBe(false)
  })

  it('le schéma de requête refuse un identifiant qui n’est pas un UUID', () => {
    expect(deepenQuoteRequestSchema.safeParse({ targets: [{ accountId: 'x', dimension: 'signals' }] }).success).toBe(
      false,
    )
    expect(deepenQuoteRequestSchema.safeParse({ targets: [{ accountId: A, dimension: 'signals' }] }).success).toBe(true)
  })
})

describe('#2452.7 — rapide, vérifié, approfondi : les étapes d’UN travail', () => {
  const since = ago(3 * HOUR)
  it('rien rejoué depuis la réponse : rapide', () => {
    expect(deepenLevel([account(A)], since)).toBe('quick')
  })
  it('signaux rejoués depuis la réponse : vérifié', () => {
    expect(
      deepenLevel(
        [account(A, { freshness: { signals: ago(HOUR), contacts: null, entities: null, strategy: null } })],
        since,
      ),
    ).toBe('verified')
  })
  it('organigramme ou stratégie rejoués depuis la réponse : approfondi', () => {
    expect(
      deepenLevel(
        [account(A, { freshness: { signals: null, contacts: null, entities: null, strategy: ago(HOUR) } })],
        since,
      ),
    ).toBe('deepened')
  })
  it('une fraîcheur ANTÉRIEURE à la réponse ne compte pas', () => {
    expect(
      deepenLevel(
        [account(A, { freshness: { signals: ago(5 * HOUR), contacts: null, entities: null, strategy: null } })],
        since,
      ),
    ).toBe('quick')
  })
})

describe('#2452.6 — ce qui a changé, et ce que ça a coûté', () => {
  const diff = (over: Partial<RefreshDiff>): RefreshDiff =>
    ({
      newFacts: [],
      changedFacts: [],
      obsoleteFacts: [],
      preservedCorrections: [],
      overwrittenCorrections: [],
      changedRecommendations: [],
      obsoleteActions: [],
      expiredSignals: [],
      scoreChanged: null,
      confidenceChanged: null,
      scoreNotRecalculated: null,
      confidenceNotRecalculated: null,
      unmeasured: [],
      ...over,
    }) as RefreshDiff

  it('confirmé / changé / écarté / non mesuré / coût', () => {
    const summary = summarizeDeepenRun([
      { dimension: 'signals', cost: 1, diff: diff({}) },
      {
        dimension: 'entities',
        cost: 1,
        diff: diff({
          changedFacts: [{ key: 'hq', label: 'Siège', before: 'Paris', after: 'Lyon' }],
          newFacts: [{ key: 'size', label: 'Effectif', value: '500', measuredAt: null }],
          obsoleteFacts: [{ key: 'cto', label: 'CTO', lastKnownValue: 'X', lastSeenAt: null }],
        }),
      },
      { dimension: 'contacts', cost: 1, diff: diff({ unmeasured: ['contacts'] }) },
      { dimension: 'strategy', cost: 0, diff: null, failed: true },
    ])
    expect(summary.confirmed).toEqual(['signals'])
    expect(summary.changed).toEqual(['Siège'])
    expect(summary.added).toEqual(['Effectif'])
    expect(summary.dropped).toEqual(['CTO'])
    expect(summary.unmeasured).toEqual(['contacts'])
    expect(summary.failed).toEqual(['strategy'])
    expect(summary.spent).toBe(3)
  })
})
