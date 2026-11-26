import { describe, expect, it } from 'vitest'
import type { AccountSignalItem } from '@bellum/contracts'
import {
  buildSignalHistoryLines,
  buildSignalReasons,
  buildWatchlistItems,
  countWatchlistFacets,
  filterWatchlistItems,
  groupWatchlistByAccount,
  type WatchlistFilterKey,
} from './watchlist'

const signal = (overrides: Partial<AccountSignalItem>): AccountSignalItem => ({
  id: 'account-1-signal-0',
  account_id: '11111111-1111-4111-8111-111111111111',
  account_created_at: '2026-07-01T08:00:00.000Z',
  account_score: 8,
  company_name: 'Nordia',
  date: '2026-07-05T09:00:00.000Z',
  label: 'Programme data',
  sector: 'Services',
  source: 'Communiqué',
  type: 'Projet',
  ...overrides,
})

describe('buildWatchlistItems', () => {
  it('maps normalized account signals', () => {
    const items = buildWatchlistItems([
      signal({ id: 'signal-low', account_id: '11111111-1111-4111-8111-111111111112', account_score: 4 }),
      signal({ id: 'signal-high', account_id: '11111111-1111-4111-8111-111111111113', account_score: 9 }),
    ])

    expect(items.map(item => item.id)).toEqual(['signal-low', 'signal-high'])
  })

  // #2107.31 — l'ampleur business du signal, distincte de #1424 (salesImplication).
  it('carries the business impact of the signal, distinct from the sales reading', () => {
    const [item] = buildWatchlistItems([
      signal({ sales_implication: 'Renfort recrutement à proposer.', impact: "Transformation à l'échelle du groupe." }),
    ])

    expect(item?.impact).toBe("Transformation à l'échelle du groupe.")
    expect(item?.impact).not.toBe(item?.salesImplication)
  })

  it('leaves impact null when the analysis evaluated none — never a filler sentence', () => {
    const [item] = buildWatchlistItems([signal({})])

    expect(item?.impact).toBeNull()
  })
})

// #3922.3 — le lecteur UNIQUE : l'URL du flux atteint la ligne de Mes cibles, sans repli.
describe('buildWatchlistItems — le lien source (#3922.3)', () => {
  it('carries the verified url and kind', () => {
    const [item] = buildWatchlistItems([signal({ source_url: 'https://www.bodacc.fr/a?id=1', source_kind: 'bodacc' })])
    expect(item).toMatchObject({ sourceUrl: 'https://www.bodacc.fr/a?id=1', sourceKind: 'bodacc' })
  })

  it('leaves the link null when the signal has none — never a fallback', () => {
    const [item] = buildWatchlistItems([signal({})])
    expect(item?.sourceUrl).toBeNull()
  })

  it('flags a signal collected before the link capability', () => {
    const [before] = buildWatchlistItems([signal({ signals_collected_at: '2026-10-05T08:00:00.000Z' })])
    // #4762 — après la dernière capacité du segment signaux (#2322.70, bascule 31/10 15:50Z).
    const [after] = buildWatchlistItems([signal({ signals_collected_at: '2026-10-31T18:00:00.000Z' })])
    expect(before?.collectedBeforeLink).toBe(true)
    expect(after?.collectedBeforeLink).toBe(false)
  })
})

describe('groupWatchlistByAccount — signaux par compte', () => {
  it('groups Veille signals per account (Théo p.35)', () => {
    const a1 = '11111111-1111-4111-8111-111111111111'
    const a2 = '11111111-1111-4111-8111-111111111112'
    const groups = groupWatchlistByAccount(
      buildWatchlistItems([
        signal({ id: 'a1-old', account_id: a1, account_score: 8, date: '2026-06-01T00:00:00.000Z' }),
        signal({ id: 'a1-new', account_id: a1, account_score: 8, date: '2026-07-10T00:00:00.000Z' }),
        signal({ id: 'a1-archive', account_id: a1, account_score: 8, date: '2000-01-01T00:00:00.000Z' }),
        signal({ id: 'a2-only', account_id: a2, account_score: 9, date: '2026-07-05T00:00:00.000Z' }),
      ]),
    )
    // One row per account, higher score first.
    expect(groups.map(g => g.accountId)).toEqual([a2, a1])
    const a1Group = groups.find(g => g.accountId === a1)!
    // Representative = most recent ACTIVE signal (not the 2000 archive).
    expect(a1Group.latest.id).toBe('a1-new')
    expect(a1Group.activeSignalCount).toBe(2)
    expect(a1Group.totalSignalCount).toBe(3)
  })

  it('keeps an account whose signals are all archived (representative = latest)', () => {
    const groups = groupWatchlistByAccount(
      buildWatchlistItems([
        signal({
          id: 'old-2019',
          account_id: '11111111-1111-4111-8111-111111111119',
          date: '2019-01-01T00:00:00.000Z',
        }),
        signal({
          id: 'old-2020',
          account_id: '11111111-1111-4111-8111-111111111119',
          date: '2020-01-01T00:00:00.000Z',
        }),
      ]),
    )
    expect(groups).toHaveLength(1)
    expect(groups[0]!.activeSignalCount).toBe(0)
    expect(groups[0]!.latest.id).toBe('old-2020')
  })
})

describe('groupWatchlistByAccount — representative signal', () => {
  const account = '11111111-1111-4111-8111-1111111111aa'

  it('picks a genuinely recent relative signal over a year-only one', () => {
    // Production symptom (Blablacar): the date column read "1 janv. 2026" while
    // the row's own freshest signal said "3 days ago". `Date.parse('3 days ago')`
    // was NaN → sorted as epoch 0, so the year-only "2026" (→ 1 January) won the
    // representative slot. The signal date is FREE TEXT and must be parsed as such.
    const groups = groupWatchlistByAccount(
      buildWatchlistItems([
        signal({ id: 'year-only', account_id: account, date: '2026', label: 'Rapport annuel' }),
        signal({ id: 'recent', account_id: account, date: '3 days ago', label: 'Levée de fonds' }),
      ]),
    )

    expect(groups).toHaveLength(1)
    expect(groups[0]?.latest.id).toBe('recent')
  })

  it('still orders precise dates correctly', () => {
    const groups = groupWatchlistByAccount(
      buildWatchlistItems([
        signal({ id: 'older', account_id: account, date: '2026-01-10' }),
        signal({ id: 'newer', account_id: account, date: '2026-06-10' }),
      ]),
    )

    expect(groups[0]?.latest.id).toBe('newer')
  })
})

describe('buildSignalReasons — « Pourquoi Bellum me montre ça ? » (V2 §11)', () => {
  const base = {
    accountId: 'a1',
    companyName: 'TF1',
    id: 's1',
    sector: 'Média',
    signalDate: '2026-07-20',
    signalLabel: 'Offres IT actives',
    signalSource: 'France Travail',
    signalType: 'Recrutement IT',
    score: 8,
    status: 'new' as const,
    archived: false,
    firstDetectedAt: null,
    firstDetectionExact: false,
    lastSeenAt: null,
    changeCount: 0,
    resolved: false,
    resolvedAt: null,
    importance: null,
    triggeredActionLabel: null,
    lastVerifiedAt: null,
    temporalStatus: null,
    salesImplication: null,
    impact: null,
    logoUrl: null,
    website: null,
  }
  const NOW = Date.UTC(2026, 6, 22)

  it('cite la priorité du compte, la fraîcheur et ce que dit le type', () => {
    const reasons = buildSignalReasons(base, NOW)
    expect(reasons).toHaveLength(3)
    expect(reasons[0]).toContain('8/10')
    expect(reasons[1]).toMatch(/2 jours/)
    expect(reasons[2]).toContain('budget')
  })

  /**
   * ⚠️ ZÉRO JOUR N'EST PAS « il y a 0 jour ». Le français n'a pas de règle de
   * pluriel pour zéro : i18next choisit la forme SINGULIÈRE, et l'écran écrivait
   * « Signal détecté il y a 0 jour ». Mesuré en production le 05/09/2026, sur le
   * panneau de la Veille.
   */
  it('dit « aujourd’hui » pour un signal du jour, jamais « il y a 0 jour »', () => {
    const sameDay = { ...base, signalDate: '2026-07-22' }
    const reasons = buildSignalReasons(sameDay, NOW)

    expect(reasons.some(reason => reason.includes("aujourd'hui"))).toBe(true)
    expect(reasons.some(reason => /0 jours?/.test(reason))).toBe(false)
  })

  it('signale un signal archivé au lieu de le vendre comme une fenêtre ouverte', () => {
    const reasons = buildSignalReasons({ ...base, archived: true }, NOW)
    expect(reasons.some(r => r.includes('24 mois'))).toBe(true)
    expect(reasons.some(r => r.includes("fenêtre d'approche"))).toBe(false)
  })

  it("ne justifie rien quand il n'y a aucun fait exploitable", () => {
    const reasons = buildSignalReasons(
      { ...base, score: null, signalType: 'Autre', signalDate: '', archived: false },
      NOW,
    )
    expect(reasons).toEqual([])
  })

  describe('historique de signal (V2 §11)', () => {
    // #3206.2 (partiel, épopée #3240)
    it('projette last_verified_at (`null` tant que personne n’a cliqué)', () => {
      const [verified] = buildWatchlistItems([signal({ last_verified_at: '2026-07-25T09:00:00.000Z' })])
      expect(verified?.lastVerifiedAt).toBe('2026-07-25T09:00:00.000Z')

      const [unverified] = buildWatchlistItems([signal({})])
      expect(unverified?.lastVerifiedAt).toBeNull()
    })

    // #3206.3 (épopée #3240) — la vérification humaine gagne sur le statut dérivé.
    it('dérive CURRENT_VERIFIED quand une vérification récente existe', () => {
      const [item] = buildWatchlistItems([
        signal({ date: '10 mars 2021', type: 'budget', last_verified_at: new Date().toISOString() }),
      ])
      expect(item?.temporalStatus).toBe('CURRENT_VERIFIED')
    })

    // #3206.3 (reste, épopée #3240) — un signal RÉSOLU n'est plus rapporté
    // par la dernière analyse : SUPERSEDED, même quand il a été vérifié.
    it('dérive SUPERSEDED quand le signal est résolu (history_status)', () => {
      const [item] = buildWatchlistItems([
        signal({ date: 'Juillet 2026', history_status: 'resolved', last_verified_at: new Date().toISOString() }),
      ])
      expect(item?.temporalStatus).toBe('SUPERSEDED')
    })

    it('projette les faits persistés sur le signal', () => {
      const [item] = buildWatchlistItems([
        signal({
          date: '2026-07-05',
          first_detected_at: '2026-06-01T08:00:00.000Z',
          first_detection_exact: true,
          last_seen_at: '2026-07-20T05:20:00.000Z',
          change_count: 2,
          history_status: 'active',
        }),
      ])

      expect(item).toMatchObject({
        // La date de la NOUVELLE reste celle de l'IA…
        signalDate: '2026-07-05',
        // …et la première détection vient de l'historique persisté.
        firstDetectedAt: '2026-06-01T08:00:00.000Z',
        firstDetectionExact: true,
        changeCount: 2,
        resolved: false,
      })
    })

    it("dit « détecté le » pour une date sûre, « suivi depuis » pour une reprise d'existant", () => {
      const exact = buildSignalHistoryLines({
        ...base,
        firstDetectedAt: '2026-06-01T08:00:00.000Z',
        firstDetectionExact: true,
      })
      expect(exact[0]).toContain('Détecté par Bellum le')

      const backfilled = buildSignalHistoryLines({
        ...base,
        firstDetectedAt: '2026-06-01T08:00:00.000Z',
        firstDetectionExact: false,
      })
      expect(backfilled[0]).toContain('Suivi depuis le')
    })

    it('compte les changements et signale la disparition plutôt que la fraîcheur', () => {
      const lines = buildSignalHistoryLines({
        ...base,
        firstDetectedAt: '2026-06-01T08:00:00.000Z',
        firstDetectionExact: true,
        lastSeenAt: '2026-07-10T05:00:00.000Z',
        changeCount: 3,
        resolved: true,
        resolvedAt: '2026-07-21T05:00:00.000Z',
      })

      expect(lines.some(line => line.includes('3 fois'))).toBe(true)
      expect(lines.some(line => line.includes("N'apparaît plus depuis le"))).toBe(true)
      expect(lines.some(line => line.includes('Toujours présent'))).toBe(false)
    })

    it("n'affiche RIEN sans historique matérialisé — jamais de date devinée", () => {
      expect(buildSignalHistoryLines(base)).toEqual([])
    })

    // #3206.2 (partiel, épopée #3240) — « Marquer vérifié ».
    it('cite la vérification humaine quand elle existe', () => {
      const lines = buildSignalHistoryLines({
        ...base,
        firstDetectedAt: '2026-06-01T08:00:00.000Z',
        firstDetectionExact: true,
        lastVerifiedAt: '2026-07-20T09:00:00.000Z',
      })
      expect(lines.some(line => line.includes('Vérifié par toi le'))).toBe(true)
    })

    it("ne cite rien tant que personne n'a cliqué « Marquer vérifié »", () => {
      const lines = buildSignalHistoryLines({
        ...base,
        firstDetectedAt: '2026-06-01T08:00:00.000Z',
        firstDetectionExact: true,
      })
      expect(lines.some(line => line.includes('Vérifié'))).toBe(false)
    })
  })

  // ── L'objet `Signal` complété (restitution V2 §20) ─────────────────────────
  describe('importance + action déclenchée (V2 §20)', () => {
    it('projette l’importance persistée telle quelle (elle est dérivée côté serveur)', () => {
      const [item] = buildWatchlistItems([signal({ importance: 'high' })])
      expect(item?.importance).toBe('high')
    })

    it('laisse l’importance à null quand le serveur n’a rien pu pondérer', () => {
      const [item] = buildWatchlistItems([signal({})])
      expect(item?.importance).toBeNull()
    })

    it('expose le libellé de l’action déclenchée quand le signal en a produit une', () => {
      const [item] = buildWatchlistItems([
        signal({
          action_id: '22222222-2222-4222-8222-222222222222',
          action_label: 'Traiter le signal : Programme data',
        }),
      ])
      expect(item?.triggeredActionLabel).toBe('Traiter le signal : Programme data')
    })

    it('n’annonce aucune action sans lien persisté — jamais un rapprochement deviné', () => {
      const [none] = buildWatchlistItems([signal({})])
      expect(none?.triggeredActionLabel).toBeNull()

      // Lien posé mais libellé introuvable (action supprimée entre-temps) : on
      // n'invente pas un intitulé, on n'affiche rien.
      const [orphan] = buildWatchlistItems([
        signal({ action_id: '22222222-2222-4222-8222-222222222222', action_label: null }),
      ])
      expect(orphan?.triggeredActionLabel).toBeNull()
    })
  })
})

/**
 * Page unique + facettes combinables (§11). Les onglets répondaient à une
 * question à la fois ; ce qui est vérifié ici, c'est le croisement — « nouveau
 * SUR un compte prioritaire » — et le fait qu'une facette ne mente pas sur ce
 * qu'elle retient.
 */
describe('filterWatchlistItems — facettes combinables', () => {
  const DAY = 24 * 60 * 60 * 1000
  const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * DAY).toISOString()
  const items = buildWatchlistItems([
    // Récent (< 30 j) sur un compte prioritaire.
    signal({ id: 'a', account_id: 'acc-a', account_score: 9, date: iso(3), company_name: 'Alpha' }),
    // Récent, compte NON prioritaire.
    signal({ id: 'b', account_id: 'acc-b', account_score: 4, date: iso(3), company_name: 'Beta' }),
    // Ancien (> 90 j) sur un compte prioritaire.
    signal({ id: 'c', account_id: 'acc-c', account_score: 8, date: iso(200), company_name: 'Gamma' }),
  ])
  const none = new Set<WatchlistFilterKey>()

  it('sans facette, ne retient rien de moins que tout', () => {
    expect(filterWatchlistItems(items, { active: none, query: '', rules: [] })).toHaveLength(3)
  })

  it('croise les filtres en ET : à traiter ET compte prioritaire (#4088.5)', () => {
    const active = new Set<WatchlistFilterKey>(['todo', 'priority'])
    const kept = filterWatchlistItems(items, { active, query: '', rules: [] })
    expect(kept.map(i => i.id).sort()).toEqual(['a', 'c'])
  })

  it("la facette « mes règles » ne retient que ce qu'une règle matche", () => {
    const rules = [{ id: 'r1', workspace_id: 'w', kind: 'account', value: 'Alpha', created_at: iso(1) }]
    const active = new Set<WatchlistFilterKey>(['rules'])
    const kept = filterWatchlistItems(items, { active, query: '', rules: rules as never })
    expect(kept.map(i => i.id)).toEqual(['a'])
  })

  it('la recherche se cumule aux facettes', () => {
    const active = new Set<WatchlistFilterKey>(['priority'])
    expect(filterWatchlistItems(items, { active, query: 'gamma', rules: [] }).map(i => i.id)).toEqual(['c'])
  })
})

describe("countWatchlistFacets — une puce annonce ce qu'elle retient", () => {
  const DAY = 24 * 60 * 60 * 1000
  const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * DAY).toISOString()
  const items = buildWatchlistItems([
    signal({ id: 'a', account_id: 'acc-a', account_score: 9, date: iso(3) }),
    signal({ id: 'b', account_id: 'acc-b', account_score: 2, date: iso(200) }),
  ])

  it('compte chaque facette indépendamment des autres', () => {
    const counts = countWatchlistFacets(items, { query: '', rules: [] })
    // #4088.2 — on compte des COMPTES : deux comptes à traiter, un prioritaire.
    expect(counts.todo).toBe(2)
    expect(counts.priority).toBe(1)
  })

  it('sans règle, la facette règles compte zéro — jamais une correspondance inventée', () => {
    expect(countWatchlistFacets(items, { query: '', rules: [] }).rules).toBe(0)
  })

  it('la recherche restreint les compteurs affichés', () => {
    const counts = countWatchlistFacets(items, { query: 'introuvable', rules: [] })
    expect(counts.todo).toBe(0)
  })
})
