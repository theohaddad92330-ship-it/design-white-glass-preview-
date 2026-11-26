import { failure, isFailure, isSuccess, success, type Result } from '@bellum/utils'
import {
  creditCostOf,
  REFRESH_DIMENSION_CREDIT_COST,
  REFRESH_DIMENSION_PHASE,
  type RefreshDimension,
} from '@bellum/contracts'
import { AnalysisRefreshService } from './analysis-refresh.service'
import { AnalysisOnDemandService, type OnDemandFailure } from './analysis-ondemand.service'
import { CreditsService } from '../credits/credits.service'
import { createMockQueryBuilder } from '../../database/test-utils'

type OnDemandMock = {
  refreshResearch: jest.Mock
  enrichContacts: jest.Mock
  enrichOrganigram: jest.Mock
  replan: jest.Mock
}

function buildService(opts: {
  hasCredit?: boolean
  consumeOk?: boolean
  remaining?: number
  underlying?: Result<unknown, OnDemandFailure>
  /** La ligne de compte rendue, avec ses dates de fraîcheur par dimension. */
  account?: Record<string, unknown>
}) {
  const underlying = opts.underlying ?? success({ refreshed: true })

  const onDemand: OnDemandMock = {
    refreshResearch: jest.fn().mockResolvedValue(underlying),
    enrichContacts: jest.fn().mockResolvedValue(underlying),
    enrichOrganigram: jest.fn().mockResolvedValue(underlying),
    replan: jest.fn().mockResolvedValue(underlying),
  }

  const credits = {
    hasEnrichmentCredit: jest.fn().mockResolvedValue(opts.hasCredit ?? true),
    consumeEnrichmentCredit: jest
      .fn()
      .mockResolvedValue({ ok: opts.consumeOk ?? true, remaining: opts.remaining ?? 9 }),
  }

  // La fraîcheur par dimension. Par défaut, AUCUNE date : c'est l'état de tous
  // les dossiers antérieurs, et la règle de non-rerun ne s'y déclenche pas.
  const accounts = {
    findOne: jest.fn().mockResolvedValue(opts.account ?? { id: 'acc-1' }),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    // #2650.1 — le verrou de rafraîchissement (réservation/libération de
    // l'axe) passe par `createQueryBuilder`, pas par `update()`. Par défaut il
    // réussit toujours : ces tests ne portent pas sur la concurrence.
    createQueryBuilder: jest.fn().mockReturnValue(createMockQueryBuilder()),
  }

  const service = new AnalysisRefreshService(
    onDemand as unknown as AnalysisOnDemandService,
    credits as unknown as CreditsService,
    accounts as never,
  )
  return { service, onDemand, credits, accounts }
}

// Which on-demand method each dimension must re-run (and only that one).
//
// #2318.2 — les six noms produit de LAU-FINAL-059 sont des ALIAS des quatre
// phases : ils appellent la MÊME méthode on-demand que la phase qui produit
// réellement ce contenu (voir le commentaire de `refreshDimensionSchema`).
const DIMENSION_METHOD: Record<RefreshDimension, keyof OnDemandMock> = {
  signals: 'refreshResearch',
  contacts: 'enrichContacts',
  entities: 'enrichOrganigram',
  strategy: 'replan',
  identity_group: 'refreshResearch',
  subsidiaries: 'enrichOrganigram',
  positions: 'enrichOrganigram',
  ecosystem: 'refreshResearch',
  buying_path: 'replan',
  projects: 'refreshResearch',
}

describe('AnalysisRefreshService.refresh', () => {
  // Théo A comptes-fiche-reference.A2 — une archive figée n'est jamais réécrite.
  it('refuse d’actualiser un dossier de référence (archive figée), sans débit ni phase rejouée', async () => {
    const { service, onDemand, credits } = buildService({
      account: {
        id: 'acc-1',
        raw_analysis: {
          reference_archive: {
            label: 'Archive du dépôt fourni',
            period_from: '2026-09-30',
            period_to: '2026-10-01',
            scope_note: 'périmètre France',
            verified_online: false,
          },
        },
      },
    })

    const result = await service.refresh('acc-1', 'u-1', 'signals')

    expect(isFailure(result)).toBe(true)
    if (isFailure(result)) {
      expect(result.problem.code).toBe('precondition_failed')
      expect(result.problem.message).toMatch(/archive/i)
    }
    expect(onDemand.refreshResearch).not.toHaveBeenCalled()
    expect(credits.consumeEnrichmentCredit).not.toHaveBeenCalled()
  })

  it.each(Object.entries(DIMENSION_METHOD) as Array<[RefreshDimension, keyof OnDemandMock]>)(
    'dispatches the %s dimension to exactly one phase and consumes an enrichment credit',
    async (dimension, method) => {
      const { service, onDemand, credits } = buildService({ remaining: 7 })

      const result = await service.refresh('acc-1', 'u-1', dimension)

      expect(isSuccess(result)).toBe(true)
      // #2452.6 — la réponse porte AUSSI ce qui a changé : l'approfondissement
      // depuis /chat résume plusieurs axes d'un geste, alors que
      // `raw_analysis.last_refresh` ne garde que le dernier.
      if (isSuccess(result)) {
        expect(result.output).toEqual({
          dimension,
          remaining: 7,
          diff: expect.objectContaining({ unmeasured: expect.any(Array) }),
        })
      }
      // Only the targeted phase re-ran — the others were reused (not re-paid).
      // Sans cadrage, les deux dimensions qui savent le lire reçoivent
      // `undefined` : pleine dimension, comme avant.
      expect(onDemand[method]).toHaveBeenCalledWith(
        'acc-1',
        'u-1',
        ...(method === 'enrichContacts' || method === 'replan' ? [undefined] : []),
      )
      for (const other of Object.values(DIMENSION_METHOD)) {
        if (other !== method) expect(onDemand[other]).not.toHaveBeenCalled()
      }
      // Credit charged AFTER the refresh succeeded, tagged with the dimension.
      expect(credits.consumeEnrichmentCredit).toHaveBeenCalledWith(
        'u-1',
        expect.objectContaining({ reason: expect.stringContaining(dimension), accountId: 'acc-1' }),
      )
    },
  )

  it('rejects with insufficient_credits BEFORE any IA call when the pool is empty', async () => {
    const { service, onDemand, credits } = buildService({ hasCredit: false })

    const result = await service.refresh('acc-1', 'u-1', 'strategy')

    expect(isFailure(result)).toBe(true)
    if (isFailure(result)) expect(result.problem.code).toBe('insufficient_credits')
    expect(onDemand.replan).not.toHaveBeenCalled()
    expect(credits.consumeEnrichmentCredit).not.toHaveBeenCalled()
  })

  it('does NOT consume a credit when the underlying phase fails (propagates its code)', async () => {
    const { service, credits } = buildService({
      underlying: failure({ code: 'ia_failed', message: 'IA down' }),
    })

    const result = await service.refresh('acc-1', 'u-1', 'signals')

    expect(isFailure(result)).toBe(true)
    if (isFailure(result)) {
      expect(result.problem.code).toBe('ia_failed')
      expect(result.problem.message).toBe('IA down')
    }
    expect(credits.consumeEnrichmentCredit).not.toHaveBeenCalled()
  })

  it('surfaces insufficient_credits if the atomic decrement loses a race (consume ok:false)', async () => {
    const { service } = buildService({ consumeOk: false, remaining: 0 })

    const result = await service.refresh('acc-1', 'u-1', 'entities')

    expect(isFailure(result)).toBe(true)
    if (isFailure(result)) expect(result.problem.code).toBe('insufficient_credits')
  })
})

describe('AnalysisRefreshService.refresh — le cadrage, qui était jeté', () => {
  it('transmet l’entité retenue au refresh des contacts', async () => {
    // `scope` était déclaré au contrat, transmis par le contrôleur, reçu par
    // `refresh` — et `runDimension` n'avait pas de paramètre pour lui. Un
    // refresh était donc TOUJOURS pleine dimension.
    const { service, onDemand } = buildService({ remaining: 7 })
    await service.refresh('acc-1', 'u-1', 'contacts', { included_entities: ['Boursorama'] })
    expect(onDemand.enrichContacts).toHaveBeenCalledWith('acc-1', 'u-1', { entity: 'Boursorama' })
  })

  it('transmet l’angle retenu au replan', async () => {
    const { service, onDemand } = buildService({ remaining: 7 })
    await service.refresh('acc-1', 'u-1', 'strategy', { selected_angles: ['cybersécurité'] })
    expect(onDemand.replan).toHaveBeenCalledWith('acc-1', 'u-1', { angle: 'cybersécurité' })
  })

  it('un cadrage sans ancre unique ne cadre rien', async () => {
    const { service, onDemand } = buildService({ remaining: 7 })
    await service.refresh('acc-1', 'u-1', 'contacts', { included_entities: ['A', 'B', 'C'] })
    expect(onDemand.enrichContacts).toHaveBeenCalledWith('acc-1', 'u-1', undefined)
  })
})

/**
 * Lot H du Recovery Pack — la fraîcheur par dimension, et le non-rerun.
 *
 * Le seuil de trente jours protège le LANCEMENT d'une analyse complète ; le
 * chemin de refresh ne consultait aucune date. Cliquer « Rafraîchir → Signaux »
 * deux fois de suite débitait deux crédits pour rejouer exactement la même phase.
 */
describe('non-rerun — une dimension qui vient d’être rafraîchie', () => {
  const NOW = new Date('2026-08-25T10:00:00.000Z')

  it('refuse un second refresh dans la fenêtre, SANS débiter', async () => {
    const { service, credits, onDemand } = buildService({
      account: { id: 'acc-1', signals_refreshed_at: new Date('2026-08-25T08:00:00.000Z') },
    })

    const result = await service.refresh('acc-1', 'u-1', 'signals', undefined, NOW)

    expect(isFailure(result)).toBe(true)
    expect(isFailure(result) && result.problem.code).toBe('refreshed_recently')
    // Ni appel de phase, ni crédit : c'est tout l'intérêt.
    expect(onDemand.refreshResearch).not.toHaveBeenCalled()
    expect(credits.consumeEnrichmentCredit).not.toHaveBeenCalled()
  })

  it('laisse passer une AUTRE dimension — la fraîcheur est par axe', async () => {
    const { service, onDemand } = buildService({
      account: { id: 'acc-1', signals_refreshed_at: new Date('2026-08-25T08:00:00.000Z') },
    })

    const result = await service.refresh('acc-1', 'u-1', 'contacts', undefined, NOW)

    expect(isFailure(result)).toBe(false)
    expect(onDemand.enrichContacts).toHaveBeenCalled()
  })

  it('laisse passer au-delà de la fenêtre', async () => {
    const { service } = buildService({
      account: { id: 'acc-1', signals_refreshed_at: new Date('2026-08-24T10:00:00.000Z') },
    })
    expect(isFailure(await service.refresh('acc-1', 'u-1', 'signals', undefined, NOW))).toBe(false)
  })

  it('ne bloque RIEN sur un dossier sans date — l’état de tous les dossiers antérieurs', async () => {
    const { service } = buildService({ account: { id: 'acc-1', signals_refreshed_at: null } })
    expect(isFailure(await service.refresh('acc-1', 'u-1', 'signals', undefined, NOW))).toBe(false)
  })

  it('écrit la fraîcheur de la BONNE dimension après un succès', async () => {
    const { service, accounts } = buildService({})

    await service.refresh('acc-1', 'u-1', 'entities', undefined, NOW)

    expect(accounts.update).toHaveBeenCalledWith({ id: 'acc-1' }, { entities_refreshed_at: NOW })
  })

  it('une écriture de fraîcheur ratée n’annule pas un refresh déjà payé', async () => {
    // Le pire cas est un refresh de trop, jamais une perte de travail.
    const { service, accounts } = buildService({})
    accounts.update.mockRejectedValueOnce(new Error('deadlock'))

    expect(isFailure(await service.refresh('acc-1', 'u-1', 'signals', undefined, NOW))).toBe(false)
  })
})

/**
 * Le prix ANNONCÉ et le prix DÉBITÉ sortent de la même dérivation.
 *
 * Le service appelait `consumeEnrichmentCredit` SANS `cost`. Le montant retombait
 * donc sur `resolveEnrichmentCost(undefined)`, c'est-à-dire le poids de
 * l'ENRICHISSEMENT DE CONTACT — pendant que le menu « Rafraîchir » annonce, lui,
 * `REFRESH_DIMENSION_CREDIT_COST`, désormais dérivé de `targeted_refresh`. Les
 * deux valent 1 aujourd'hui : aucun client n'a été mal facturé, et c'est
 * exactement ce qui rendait le défaut invisible. Deux sources pour un prix
 * finissent toujours par diverger (GA-26).
 *
 * ⚠️ La garde compare au CONTRAT, jamais à un littéral : écrire `cost: 1` ici la
 * rendrait complice du défaut qu'elle surveille.
 */
describe('AnalysisRefreshService — le débit vient de la grille annoncée', () => {
  const DIMENSIONS: RefreshDimension[] = ['signals', 'contacts', 'entities', 'strategy']

  it('a un corpus de dimensions non vide', () => {
    expect(DIMENSIONS.length).toBeGreaterThanOrEqual(4)
  })

  it.each(DIMENSIONS)('débite %s au prix que le menu annonce', async dimension => {
    const { service, credits } = buildService({})

    await service.refresh('acc-1', 'u-1', dimension)

    // La borne basse : sans elle, un service qui ne débiterait PLUS RIEN
    // rendrait ce test vert sur un tableau vide.
    expect(credits.consumeEnrichmentCredit).toHaveBeenCalledTimes(1)
    const call = credits.consumeEnrichmentCredit.mock.calls[0]
    expect(call[1]).toEqual({
      reason: `refresh:${dimension}`,
      accountId: 'acc-1',
      cost: REFRESH_DIMENSION_CREDIT_COST[dimension],
    })
  })

  it('le prix débité est celui de `targeted_refresh`, pas celui d’un enrichissement de contact', async () => {
    const { service, credits } = buildService({})

    await service.refresh('acc-1', 'u-1', 'contacts')

    expect(credits.consumeEnrichmentCredit.mock.calls[0][1].cost).toBe(creditCostOf('targeted_refresh'))
  })
})

/**
 * #2125.50-.67 — le rafraîchissement REVIENT en disant ce qu'il a changé.
 *
 * Le geste débitait un crédit et ne rendait qu'un `remaining` : l'utilisateur
 * payait pour une modification qu'il devait retrouver à l'œil, en relisant son
 * dossier. Le diff est donc écrit AU RETOUR, dans `raw_analysis.last_refresh`
 * — pas une nouvelle table, pas une migration : le blob est déjà rendu au
 * front avec le compte, et il porte déjà ce que le run produit.
 *
 * ⚠️ Ce qui décide si une valeur entrante remplace l'ancienne n'est pas écrit
 * ici : le diff passe par `decideFieldWrite` (contrats), l'arbitre que le
 * pipeline appelle déjà. Deux arbitres divergeraient, et le diff finirait par
 * annoncer « modifié » une valeur que la base a refusé d'écrire.
 */
describe('AnalysisRefreshService — le diff écrit au retour (#2125.50-.56)', () => {
  const NOW = new Date('2026-09-15T12:00:00.000Z')

  function buildDiffService(opts: {
    before: Record<string, unknown>
    after?: Record<string, unknown>
    provenance?: { field: string; source: string; observed_at: Date }[]
    underlying?: Result<unknown, OnDemandFailure>
  }) {
    const underlying = opts.underlying ?? success({ refreshed: true })
    const onDemand: OnDemandMock = {
      refreshResearch: jest.fn().mockResolvedValue(underlying),
      enrichContacts: jest.fn().mockResolvedValue(underlying),
      enrichOrganigram: jest.fn().mockResolvedValue(underlying),
      replan: jest.fn().mockResolvedValue(underlying),
    }
    const credits = {
      hasEnrichmentCredit: jest.fn().mockResolvedValue(true),
      consumeEnrichmentCredit: jest.fn().mockResolvedValue({ ok: true, remaining: 4 }),
    }
    const findOne = jest
      .fn()
      // 1 — la lecture de fraîcheur, 2 — l'instantané AVANT, 3 — l'APRÈS.
      .mockResolvedValueOnce({ id: 'acc-1' })
      .mockResolvedValueOnce(opts.before)
      .mockResolvedValueOnce(opts.after ?? opts.before)
    const accounts = {
      findOne,
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      createQueryBuilder: jest.fn().mockReturnValue(createMockQueryBuilder()),
    }
    const provenance = { find: jest.fn().mockResolvedValue(opts.provenance ?? []) }
    const service = new AnalysisRefreshService(
      onDemand as unknown as AnalysisOnDemandService,
      credits as unknown as CreditsService,
      accounts as never,
      undefined,
      provenance as never,
    )
    return { service, accounts }
  }

  /** Le `last_refresh` écrit dans `raw_analysis`, quel que soit l'ordre des updates. */
  function lastRefreshOf(accounts: { update: jest.Mock }): Record<string, unknown> | null {
    for (const call of accounts.update.mock.calls) {
      const raw = (call[1] as { raw_analysis?: Record<string, unknown> }).raw_analysis
      if (raw && 'last_refresh' in raw) return raw.last_refresh as Record<string, unknown>
    }
    return null
  }

  it('sépare les faits nouveaux, modifiés et devenus obsolètes', async () => {
    const { service, accounts } = buildDiffService({
      before: { id: 'acc-1', raw_analysis: { keep: 1 }, employees: '1200', revenue: '90 M€' },
      after: { id: 'acc-1', raw_analysis: { keep: 1 }, employees: '1450', website: 'acme.fr' },
    })

    await service.refresh('acc-1', 'u-1', 'signals', undefined, NOW)

    const last = lastRefreshOf(accounts)
    expect(last).not.toBeNull()
    const diff = last?.diff as {
      newFacts: { key: string }[]
      changedFacts: { key: string; before: string | null; after: string | null }[]
      obsoleteFacts: { key: string; lastKnownValue: string | null }[]
    }
    expect(diff.newFacts.map(f => f.key)).toEqual(['website'])
    expect(diff.changedFacts).toContainEqual(
      expect.objectContaining({ key: 'employees', before: '1200', after: '1450' }),
    )
    // On archive, on ne supprime pas : le CA n'est plus observé, il redevient
    // inconnu AVEC sa dernière valeur connue.
    expect(diff.obsoleteFacts).toContainEqual(expect.objectContaining({ key: 'revenue', lastKnownValue: '90 M€' }))
  })

  // #2318.4 — trois des onze champs du diff : « score modifié », « confiance
  // modifiée », « signaux expirés ». L'instantané doit désormais les lire, pas
  // seulement `buildRefreshDiff` savoir les comparer (voir refresh-explained.ts).
  it('lit le score, la confiance et les signaux récents — « score modifié », « confiance modifiée », « signaux expirés »', async () => {
    const { service, accounts } = buildDiffService({
      before: {
        id: 'acc-1',
        raw_analysis: { confidence: { score: 54 } },
        priority_score: 62,
        recent_signals: [{ signal: 'Levée de fonds', date: '2026-06-01T00:00:00.000Z', sales_implication: '20M€' }],
      },
      after: {
        id: 'acc-1',
        raw_analysis: { confidence: { score: 80 } },
        priority_score: 78,
        recent_signals: [],
      },
    })

    await service.refresh('acc-1', 'u-1', 'signals', undefined, NOW)

    const diff = lastRefreshOf(accounts)?.diff as {
      scoreChanged: { before: string | null; after: string | null } | null
      confidenceChanged: { before: string | null; after: string | null } | null
      expiredSignals: { label: string; lastKnownValue: string | null }[]
    }
    expect(diff.scoreChanged).toEqual(expect.objectContaining({ before: '62', after: '78' }))
    expect(diff.confidenceChanged).toEqual(expect.objectContaining({ before: '54', after: '80' }))
    expect(diff.expiredSignals).toContainEqual(
      expect.objectContaining({ label: 'Levée de fonds', lastKnownValue: '20M€' }),
    )
  })

  it('ne réécrit PAS le blob : le reste de `raw_analysis` traverse intact', async () => {
    const { service, accounts } = buildDiffService({
      before: { id: 'acc-1', raw_analysis: { signals: ['levée'], sites_france: ['Lyon'] } },
    })

    await service.refresh('acc-1', 'u-1', 'signals', undefined, NOW)

    const written = accounts.update.mock.calls
      .map(call => (call[1] as { raw_analysis?: Record<string, unknown> }).raw_analysis)
      .find(raw => raw && 'last_refresh' in raw)
    expect(written).toMatchObject({ signals: ['levée'], sites_france: ['Lyon'] })
  })

  it('une correction humaine est CONSERVÉE, et le diff le dit', async () => {
    const { service, accounts } = buildDiffService({
      before: { id: 'acc-1', raw_analysis: {}, headquarters: 'Lyon' },
      after: { id: 'acc-1', raw_analysis: {}, headquarters: 'Lyon' },
      provenance: [{ field: 'headquarters', source: 'human', observed_at: new Date('2026-04-01T09:00:00.000Z') }],
    })

    await service.refresh('acc-1', 'u-1', 'entities', undefined, NOW)

    const diff = lastRefreshOf(accounts)?.diff as {
      preservedCorrections: { key: string; keptValue: string | null }[]
      changedFacts: { key: string }[]
    }
    expect(diff.preservedCorrections).toContainEqual(
      expect.objectContaining({ key: 'headquarters', keptValue: 'Lyon' }),
    )
    expect(diff.changedFacts.map(f => f.key)).not.toContain('headquarters')
  })

  // ───────────────────────────────────────────────────────────────────────────
  // #2318.8 — « Elle ne doit pas modifier silencieusement la mémoire partagée ».
  //
  // Le test juste au-dessus passait déjà, et il ne prouvait PAS ce qu'on croyait :
  // il pose `before === after` (« Lyon » des deux côtés). Personne n'y tente
  // d'écrasement, donc rien n'y résiste à un écrasement.
  //
  // Le défaut réel, mesuré le 20/09/2026 : l'instantané d'APRÈS est relu DANS LA
  // BASE, après l'écriture de la phase (`snapshot(accountId, {})`, ligne 348).
  // Si un writer aveugle a vraiment remplacé « Lyon » par « Paris », ce `after`
  // contient « Paris » sans provenance, `decideFieldWrite` compare à un `before`
  // marqué `human`, refuse l'écriture… et le diff annonce « correction
  // conservée : Lyon ». La base contient Paris. L'écran dit Lyon. C'est
  // exactement le NO-GO de LAU-FINAL-059, avec une pastille verte.
  //
  // Le coupable factice de ce test est donc un `after` qui porte la valeur
  // écrasée — ce que produirait n'importe quel writer contournant l'arbitre.
  describe('#2318.8 — un écrasement réel de correction est NOMMÉ, jamais blanchi', () => {
    it('NOMME le champ, la valeur perdue et la PHASE coupable', async () => {
      const { service, accounts } = buildDiffService({
        before: { id: 'acc-1', raw_analysis: {}, headquarters: 'Lyon' },
        // Le coupable factice : la phase a réellement écrit « Paris » en base.
        after: { id: 'acc-1', raw_analysis: {}, headquarters: 'Paris' },
        provenance: [{ field: 'headquarters', source: 'human', observed_at: new Date('2026-04-01T09:00:00.000Z') }],
      })

      await service.refresh('acc-1', 'u-1', 'entities', undefined, NOW)

      const diff = lastRefreshOf(accounts)?.diff as {
        overwrittenCorrections: {
          key: string
          correctedValue: string | null
          overwrittenWith: string | null
          byPhase: string
          correctedAt: string | null
        }[]
        preservedCorrections: { key: string }[]
      }
      expect(diff.overwrittenCorrections).toContainEqual(
        expect.objectContaining({
          key: 'headquarters',
          correctedValue: 'Lyon',
          overwrittenWith: 'Paris',
          byPhase: 'entities',
          correctedAt: '2026-04-01T09:00:00.000Z',
        }),
      )
      // …et surtout : elle n'est PLUS annoncée conservée. Les deux à la fois
      // seraient le mensonge que ce point vient supprimer.
      expect(diff.preservedCorrections.map(c => c.key)).not.toContain('headquarters')
    })

    it('n’accuse PAS un run qui a respecté la correction', async () => {
      const { service, accounts } = buildDiffService({
        before: { id: 'acc-1', raw_analysis: {}, headquarters: 'Lyon' },
        after: { id: 'acc-1', raw_analysis: {}, headquarters: 'Lyon' },
        provenance: [{ field: 'headquarters', source: 'human', observed_at: new Date('2026-04-01T09:00:00.000Z') }],
      })

      await service.refresh('acc-1', 'u-1', 'entities', undefined, NOW)

      const diff = lastRefreshOf(accounts)?.diff as {
        overwrittenCorrections: { key: string }[]
        preservedCorrections: { key: string }[]
      }
      expect(diff.overwrittenCorrections).toEqual([])
      expect(diff.preservedCorrections.map(c => c.key)).toContain('headquarters')
    })

    it('n’attrape PAS ce qu’il ne vise pas : un fait NON corrigé qui change reste un fait modifié', async () => {
      const { service, accounts } = buildDiffService({
        before: { id: 'acc-1', raw_analysis: {}, employees: '1200' },
        after: { id: 'acc-1', raw_analysis: {}, employees: '1450' },
        provenance: [{ field: 'employees', source: 'pipeline', observed_at: new Date('2026-03-02T09:00:00.000Z') }],
      })

      await service.refresh('acc-1', 'u-1', 'entities', undefined, NOW)

      const diff = lastRefreshOf(accounts)?.diff as {
        overwrittenCorrections: { key: string }[]
        changedFacts: { key: string }[]
      }
      expect(diff.overwrittenCorrections).toEqual([])
      expect(diff.changedFacts.map(f => f.key)).toContain('employees')
    })

    // Sans dépôt de provenance injecté, le service ne SAIT pas qui a écrit quoi.
    // Il doit alors se taire plutôt que d'accuser : « non mesuré » n'est pas
    // « aucun écrasement », et une accusation devinée vaut moins que rien.
    it('ne devine AUCUN écrasement quand la provenance n’est pas lisible', async () => {
      const { service, accounts } = buildDiffService({
        before: { id: 'acc-1', raw_analysis: {}, headquarters: 'Lyon' },
        after: { id: 'acc-1', raw_analysis: {}, headquarters: 'Paris' },
        provenance: [],
      })

      await service.refresh('acc-1', 'u-1', 'entities', undefined, NOW)

      const diff = lastRefreshOf(accounts)?.diff as { overwrittenCorrections: { key: string }[] }
      expect(diff.overwrittenCorrections).toEqual([])
    })
  })

  it('une mesure qui n’a pas eu lieu est NOMMÉE, jamais rendue « aucun changement »', async () => {
    // L'instantané d'après est illisible (ligne disparue, lecture en échec) :
    // on ne sait pas ce qui a changé, et on le dit.
    const { service, accounts } = buildDiffService({ before: { id: 'acc-1', raw_analysis: {}, employees: '1200' } })
    accounts.findOne
      .mockReset()
      .mockResolvedValueOnce({ id: 'acc-1' })
      .mockResolvedValueOnce({ id: 'acc-1', raw_analysis: {}, employees: '1200' })
      .mockResolvedValueOnce(null)

    await service.refresh('acc-1', 'u-1', 'signals', undefined, NOW)

    const diff = lastRefreshOf(accounts)?.diff as { unmeasured: string[] }
    expect(diff.unmeasured).toEqual(['signals'])
  })

  it('un axe dont l’instantané ne lit pas la sortie est NOMMÉ plutôt que rendu silencieux', async () => {
    // L'instantané compare les FAITS de la fiche. Le plan et les contacts vivent
    // ailleurs : dire « aucun changement » après un rerun de stratégie
    // affirmerait une mesure qui n'a pas eu lieu.
    const { service, accounts } = buildDiffService({ before: { id: 'acc-1', raw_analysis: {}, employees: '1200' } })

    await service.refresh('acc-1', 'u-1', 'strategy', undefined, NOW)

    const diff = lastRefreshOf(accounts)?.diff as { unmeasured: string[] }
    expect(diff.unmeasured).toEqual(['strategy'])
  })

  // #2318.11 → FERMÉ par #2591.1. NO-GO de LAU-FINAL-059 : « une correction
  // est visible dans une page mais l'ancienne information continue
  // d'alimenter Laura, le score ou le plan ».
  //
  // Ce que ce test établissait, avec preuve à l'appui (et qui reste vrai) :
  //  · `AccountsService.refreshResearch` (accounts.service.ts:3337-3343) NE
  //    RECALCULE JAMAIS `priority_score` pour une dimension 'signals' —
  //    `writePriority: false`, DÉLIBÉRÉMENT, pour ne pas réintroduire une
  //    divergence d'échelle /10 vs /25 (seul `applyPlan`, appelé par la
  //    dimension 'strategy', écrit cette colonne) ;
  //  · `AnalysisRefreshService.snapshot` lit pourtant `priority_score` dans
  //    CHAQUE instantané, quelle que soit la dimension (`analysis-refresh
  //    .service.ts:352`), et 'signals' EST dans `DIMENSIONS_THE_SNAPSHOT_READS`
  //    — donc `unmeasured` reste `[]` : ce rafraîchissement n'est PAS marqué
  //    « non mesuré ».
  //
  // Ce que #2591.1 ferme : `refresh()` sait maintenant QUELLES dimensions
  // recalculent vraiment le score (`SCORE_RECALCULATING_DIMENSIONS`, importé
  // de `@bellum/contracts` — un seul endroit décide, GA-26) et le passe à
  // `buildRefreshDiff`. Une correction (un fait neuf) reste visible dans le
  // diff, ET le score, potentiellement périmé par ce même fait, se NOMME
  // « non recalculé » plutôt que de se taire.
  it('#2318.11 (fermé par #2591.1) — un score jamais recalculé par « signals » se NOMME, jamais confondu avec un score stable', async () => {
    const { service, accounts } = buildDiffService({
      // `writePriority: false` en réalité : la colonne ne bouge jamais pour
      // 'signals'. On modélise cette vérité en gardant `priority_score`
      // IDENTIQUE avant/après, alors que des FAITS, eux, changent bel et bien.
      before: { id: 'acc-1', raw_analysis: {}, priority_score: 62, employees: '1200' },
      after: { id: 'acc-1', raw_analysis: {}, priority_score: 62, employees: '1450' },
    })

    await service.refresh('acc-1', 'u-1', 'signals', undefined, NOW)

    const diff = lastRefreshOf(accounts)?.diff as {
      changedFacts: { key: string }[]
      scoreChanged: unknown
      scoreNotRecalculated: { lastKnownValue: string | null } | null
      unmeasured: string[]
    }
    // Une correction EST visible : le diff montre bien le fait modifié.
    expect(diff.changedFacts.map(f => f.key)).toContain('employees')
    // …et le score, jamais recalculé par cette dimension, le DIT — ce n'est
    // plus « rien à signaler ».
    expect(diff.scoreChanged).toBeNull()
    expect(diff.scoreNotRecalculated).toEqual({ lastKnownValue: '62' })
    expect(diff.unmeasured).toEqual([])
  })

  // Le contrôle négatif que l'issue #2591 demande explicitement : après une
  // dimension qui RECALCULE vraiment le score ('strategy'), un score stable
  // reste silencieux — c'est l'arbitrage d'écran existant, pas une régression.
  it('#2591.1 — contrôle négatif : « strategy » recalcule vraiment le score, un score stable reste silencieux', async () => {
    const { service, accounts } = buildDiffService({
      before: { id: 'acc-1', raw_analysis: {}, priority_score: 62 },
      after: { id: 'acc-1', raw_analysis: {}, priority_score: 62 },
    })

    await service.refresh('acc-1', 'u-1', 'strategy', undefined, NOW)

    const diff = lastRefreshOf(accounts)?.diff as {
      scoreChanged: unknown
      scoreNotRecalculated: unknown
    }
    expect(diff.scoreChanged).toBeNull()
    expect(diff.scoreNotRecalculated).toBeNull()
  })

  // #2591.6 — même correctif que #2591.1, pour la CONFIANCE :
  // `AccountsService.mergeRawAnalysis` (appelée par `applyResearch`, elle-même
  // appelée par `refreshResearch`) réémet `raw_analysis.confidence` à CHAQUE
  // 'signals'. Aucune autre dimension ne la touche — 'contacts' ici.
  it('#2591.6 — une confiance jamais recalculée par « contacts » se NOMME, jamais confondue avec une confiance stable', async () => {
    const { service, accounts } = buildDiffService({
      before: {
        id: 'acc-1',
        raw_analysis: { confidence: { score: 58 } },
        priority_score: 62,
        employees: '1200',
      },
      after: {
        id: 'acc-1',
        raw_analysis: { confidence: { score: 58 } },
        priority_score: 62,
        employees: '1450',
      },
    })

    await service.refresh('acc-1', 'u-1', 'contacts', undefined, NOW)

    const diff = lastRefreshOf(accounts)?.diff as {
      changedFacts: { key: string }[]
      confidenceChanged: unknown
      confidenceNotRecalculated: { lastKnownValue: string | null } | null
    }
    expect(diff.changedFacts.map(f => f.key)).toContain('employees')
    expect(diff.confidenceChanged).toBeNull()
    expect(diff.confidenceNotRecalculated).toEqual({ lastKnownValue: '58' })
  })

  // Contrôle négatif : 'signals' RECALCULE vraiment la confiance — une
  // confiance stable reste silencieuse (arbitrage d'écran existant).
  it('#2591.6 — contrôle négatif : « signals » recalcule vraiment la confiance, une confiance stable reste silencieuse', async () => {
    const { service, accounts } = buildDiffService({
      before: { id: 'acc-1', raw_analysis: { confidence: { score: 58 } } },
      after: { id: 'acc-1', raw_analysis: { confidence: { score: 58 } } },
    })

    await service.refresh('acc-1', 'u-1', 'signals', undefined, NOW)

    const diff = lastRefreshOf(accounts)?.diff as {
      confidenceChanged: unknown
      confidenceNotRecalculated: unknown
    }
    expect(diff.confidenceChanged).toBeNull()
    expect(diff.confidenceNotRecalculated).toBeNull()
  })

  it('une écriture de diff ratée n’annule pas un refresh déjà payé', async () => {
    const { service, accounts } = buildDiffService({ before: { id: 'acc-1', raw_analysis: {} } })
    accounts.update.mockRejectedValue(new Error('deadlock'))

    expect(isFailure(await service.refresh('acc-1', 'u-1', 'signals', undefined, NOW))).toBe(false)
  })
})

/**
 * #2125.64-.67 — quand une phase échoue, l'écran doit pouvoir NOMMER la phase,
 * ce qui a été conservé malgré l'échec, le coût débité ou remboursé, et relancer
 * cette phase SEULE.
 *
 * ⚠️ Un timeout n'est pas un échec : une requête PARTIE sans réponse est un
 * `unknown`, et on ne la rejoue jamais sans le dire (`needsConfirmation`).
 */
describe('AnalysisRefreshService — le rapport d’échec (#2125.64-.67)', () => {
  const NOW = new Date('2026-09-15T12:00:00.000Z')

  function buildFailingService(problem: OnDemandFailure) {
    const onDemand: OnDemandMock = {
      refreshResearch: jest.fn().mockResolvedValue(failure(problem)),
      enrichContacts: jest.fn().mockResolvedValue(failure(problem)),
      enrichOrganigram: jest.fn().mockResolvedValue(failure(problem)),
      replan: jest.fn().mockResolvedValue(failure(problem)),
    }
    const credits = {
      hasEnrichmentCredit: jest.fn().mockResolvedValue(true),
      consumeEnrichmentCredit: jest.fn().mockResolvedValue({ ok: true, remaining: 4 }),
    }
    const accounts = {
      findOne: jest.fn().mockResolvedValue({ id: 'acc-1', raw_analysis: {} }),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      createQueryBuilder: jest.fn().mockReturnValue(createMockQueryBuilder()),
    }
    const service = new AnalysisRefreshService(
      onDemand as unknown as AnalysisOnDemandService,
      credits as unknown as CreditsService,
      accounts as never,
    )
    return { service, accounts, credits }
  }

  function failureReportOf(accounts: { update: jest.Mock }): Record<string, unknown> | null {
    for (const call of accounts.update.mock.calls) {
      const raw = (call[1] as { raw_analysis?: Record<string, unknown> }).raw_analysis
      if (raw && 'last_refresh' in raw) {
        return (raw.last_refresh as { failure?: Record<string, unknown> }).failure ?? null
      }
    }
    return null
  }

  it('nomme la phase, les axes conservés et le coût — qui n’a PAS été débité', async () => {
    const { service, accounts, credits } = buildFailingService({ code: 'ia_failed', message: 'IA down' })

    await service.refresh('acc-1', 'u-1', 'contacts', undefined, NOW)

    expect(credits.consumeEnrichmentCredit).not.toHaveBeenCalled()
    const report = failureReportOf(accounts)
    expect(report).toMatchObject({
      phase: 'contacts',
      outcome: 'failed',
      credits: { debited: 0, refunded: false },
    })
    // #2318.2 — l'enum porte maintenant les six alias produit en plus des
    // quatre phases : « conservé » veut dire « toute dimension autre que celle
    // qui a échoué », alias compris.
    expect((report?.keptDimensions as string[]).sort()).toEqual([
      'buying_path',
      'ecosystem',
      'entities',
      'identity_group',
      'positions',
      'projects',
      'signals',
      'strategy',
      'subsidiaries',
    ])
    expect(report?.retry).toEqual({ dimension: 'contacts', allowed: true, needsConfirmation: false })
  })

  it('une requête partie sans réponse est `unknown` : la relance demande confirmation', async () => {
    const { service, accounts } = buildFailingService({ code: 'ia_failed', message: 'socket hang up (ECONNRESET)' })

    await service.refresh('acc-1', 'u-1', 'signals', undefined, NOW)

    const report = failureReportOf(accounts)
    expect(report?.outcome).toBe('unknown')
    expect(report?.retry).toEqual({ dimension: 'signals', allowed: true, needsConfirmation: true })
  })
})

/**
 * #2650.1 (18/09/2026) — mesuré en production : deux clics sur « Rafraîchir →
 * Signaux » à 50 s d'écart ont débité deux crédits et rejoué deux fois la même
 * phase. `refreshedTooRecently` lit `signals_refreshed_at`, mais cette colonne
 * n'est écrite qu'APRÈS la phase (`analysis-refresh.service.ts:282`) — pendant
 * qu'elle tourne (≈1 min), un second appel la traversait sans obstacle.
 *
 * Le verrou est un CAS sur une colonne DÉDIÉE (`*_refresh_lock_at`, jamais lue
 * par l'écran — contrairement à `*_refreshed_at`), donc ces fakes modélisent
 * une vraie ligne Postgres PARTAGÉE entre deux appels concurrents, pas une Map
 * en mémoire par instance.
 */
describe('AnalysisRefreshService — #2650.1 un second appel PENDANT la phase ne rejoue pas et ne débite pas', () => {
  const NOW = new Date('2026-09-18T18:00:00.000Z')

  function makeLockAwareAccounts(initialLock: Date | null = null) {
    let lock = initialLock
    const createQueryBuilder = jest.fn().mockImplementation(() => {
      let setPartial: Record<string, unknown> = {}
      let whereParams: Record<string, unknown> = {}
      const qb = {
        update: jest.fn(() => qb),
        set: jest.fn((partial: Record<string, unknown>) => {
          setPartial = partial
          return qb
        }),
        where: jest.fn((_sql: string, params: Record<string, unknown> = {}) => {
          whereParams = params
          return qb
        }),
        execute: jest.fn(async () => {
          let matches: boolean
          if ('token' in whereParams) {
            // Libération : CAS sur le JETON posé par cet appel.
            matches = lock !== null && lock.getTime() === (whereParams.token as Date).getTime()
          } else if ('currentLock' in whereParams) {
            // Réservation d'un verrou jugé abandonné : CAS sur la valeur relue.
            matches = lock !== null && lock.getTime() === (whereParams.currentLock as Date).getTime()
          } else {
            // Réservation depuis « libre ».
            matches = lock === null
          }
          if (!matches) return { affected: 0 }
          lock = Object.values(setPartial)[0] as Date | null
          return { affected: 1 }
        }),
      }
      return qb
    })
    const findOne = jest.fn().mockImplementation(async () => ({ id: 'acc-1', signals_refresh_lock_at: lock }))
    return { createQueryBuilder, findOne }
  }

  it('un seul débit, un seul appel de phase — le second reçoit un refus NOMMÉ pendant que le premier tourne encore', async () => {
    let resolveFirstPhase!: (r: Result<unknown, OnDemandFailure>) => void
    const firstPhase = new Promise<Result<unknown, OnDemandFailure>>(resolve => {
      resolveFirstPhase = resolve
    })
    const onDemand: OnDemandMock = {
      refreshResearch: jest.fn().mockReturnValueOnce(firstPhase),
      enrichContacts: jest.fn(),
      enrichOrganigram: jest.fn(),
      replan: jest.fn(),
    }
    const credits = {
      hasEnrichmentCredit: jest.fn().mockResolvedValue(true),
      consumeEnrichmentCredit: jest.fn().mockResolvedValue({ ok: true, remaining: 7 }),
    }
    const { createQueryBuilder, findOne } = makeLockAwareAccounts(null)
    const accounts = { findOne, update: jest.fn().mockResolvedValue({ affected: 1 }), createQueryBuilder }
    const service = new AnalysisRefreshService(
      onDemand as unknown as AnalysisOnDemandService,
      credits as unknown as CreditsService,
      accounts as never,
    )

    const first = service.refresh('acc-1', 'u-1', 'signals', undefined, NOW)
    // Attend que le premier appel ait RÉELLEMENT réservé l'axe et atteint la
    // phase — le signal est déterministe (l'appel de phase lui-même), pas un
    // nombre de ticks deviné.
    while (onDemand.refreshResearch.mock.calls.length === 0) await Promise.resolve()

    const second = await service.refresh('acc-1', 'u-1', 'signals', undefined, NOW)

    expect(isFailure(second)).toBe(true)
    if (isFailure(second)) expect(second.problem.code).toBe('refreshed_recently')
    expect(onDemand.refreshResearch).toHaveBeenCalledTimes(1)
    expect(credits.consumeEnrichmentCredit).not.toHaveBeenCalled()

    resolveFirstPhase(success({ refreshed: true }))
    const firstResult = await first
    expect(isSuccess(firstResult)).toBe(true)
    expect(credits.consumeEnrichmentCredit).toHaveBeenCalledTimes(1)
  })

  it('un échec LIBÈRE l’axe : un nouvel appel immédiat est accepté, pas bloqué 6 h', async () => {
    const onDemand: OnDemandMock = {
      refreshResearch: jest
        .fn()
        .mockResolvedValueOnce(failure({ code: 'ia_failed', message: 'IA down' }))
        .mockResolvedValueOnce(success({ refreshed: true })),
      enrichContacts: jest.fn(),
      enrichOrganigram: jest.fn(),
      replan: jest.fn(),
    }
    const credits = {
      hasEnrichmentCredit: jest.fn().mockResolvedValue(true),
      consumeEnrichmentCredit: jest.fn().mockResolvedValue({ ok: true, remaining: 7 }),
    }
    const { createQueryBuilder, findOne } = makeLockAwareAccounts(null)
    const accounts = { findOne, update: jest.fn().mockResolvedValue({ affected: 1 }), createQueryBuilder }
    const service = new AnalysisRefreshService(
      onDemand as unknown as AnalysisOnDemandService,
      credits as unknown as CreditsService,
      accounts as never,
    )

    const first = await service.refresh('acc-1', 'u-1', 'signals', undefined, NOW)
    expect(isFailure(first)).toBe(true)

    // Immédiat : même horodatage `NOW`, donc si l'axe restait verrouillé le
    // second appel serait refusé — la fenêtre d'abandon (5 min) ne serait pas
    // encore dépassée.
    const second = await service.refresh('acc-1', 'u-1', 'signals', undefined, NOW)
    expect(isFailure(second)).toBe(false)
    expect(onDemand.refreshResearch).toHaveBeenCalledTimes(2)
  })
})

/**
 * #2650.2 — le verrou #2650.1 et le remboursement des rafraîchissements déjà
 * payés lisent LE MÊME groupement d'axes par phase (`REFRESH_DIMENSION_PHASE`,
 * `@bellum/contracts` — GA-26). Ce test passe par le service : si le verrou se
 * met à grouper autrement que la table partagée, il rougit — et le
 * remboursement, qui la lit aussi, rembourserait ce que le clic laisse passer
 * (ou l'inverse).
 */
describe('AnalysisRefreshService — #2650.2 le verrou groupe les axes par la phase partagée', () => {
  const NOW = new Date('2026-09-19T10:00:00.000Z')

  it.each(Object.entries(REFRESH_DIMENSION_PHASE) as Array<[RefreshDimension, string]>)(
    '%s lit la fraîcheur et le verrou de la phase %s',
    async (dimension, phase) => {
      const { service, accounts } = buildService({})
      await service.refresh('acc-1', 'u-1', dimension, undefined, NOW)
      const select = (accounts.findOne.mock.calls[0]?.[0] as { select: string[] }).select
      expect(select).toEqual(['id', 'raw_analysis', `${phase}_refreshed_at`, `${phase}_refresh_lock_at`])
    },
  )
})
