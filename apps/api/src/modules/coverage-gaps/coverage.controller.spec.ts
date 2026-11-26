import { NotFoundException } from '@nestjs/common'
import { failure, success } from '@bellum/utils'
import { CoverageController } from './coverage.controller'

const USER = { userId: 'user-1', email: 'rep@esn.fr' }

/** La couverture NUE, telle que `CoverageService` la rend — sans mémoire
 *  marché : elle est composée ici, dans le contrôleur (#1610, GA-07). */
const COUVERTURE_NUE = { account_id: 'acc-1', score: 0.5 }

/** Mémoire marché muette par défaut. Tous les tests d'AVANT #1610 n'en disent
 *  rien, et leur comportement doit rester byte-identique. */
function memoireMuette() {
  return { coverageFor: jest.fn().mockResolvedValue({ status: 'unavailable', reason: 'not mocked' }) }
}

function makeController(marketMemory: { coverageFor: jest.Mock } = memoireMuette()) {
  const coverage = { computeForAccount: jest.fn().mockResolvedValue(COUVERTURE_NUE) }
  const accounts = {
    findOneForWorkspace: jest.fn().mockResolvedValue(
      success({
        id: 'acc-1',
        company_name: 'Compte Test',
        website: null,
        registry_country: null,
        raw_analysis: { entities_exhaustive: [] },
      }),
    ),
  }
  const workspaceContext = {
    resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'owner' }),
  }
  const controller = new CoverageController(
    coverage as never,
    accounts as never,
    workspaceContext as never,
    marketMemory as never,
    // Le cloisonnement de périmètre (revue sécurité 15/09/2026). `@Optional()`
    // au constructeur, jamais optionnel pour la RÈGLE : absent, le contrôleur
    // LÈVE. Ici, « pas de cloisonnement » se dit `null`.
    { scopeFor: jest.fn().mockResolvedValue(null) } as never,
  )
  return { controller, coverage, accounts, workspaceContext, marketMemory }
}

describe('CoverageController', () => {
  it('computes coverage for an owned account, scoped by the resolved workspace', async () => {
    const { controller, coverage, accounts, workspaceContext } = makeController()
    const res = await controller.getCoverageGaps('acc-1', USER)

    expect(workspaceContext.resolveActiveWorkspace).toHaveBeenCalledWith('user-1')
    expect(accounts.findOneForWorkspace).toHaveBeenCalledWith('acc-1', 'ws-1', null)
    // P5 (29/09) : le `raw_analysis` déjà lu par la garde est prêté, jamais relu.
    expect(coverage.computeForAccount).toHaveBeenCalledWith('acc-1', 'ws-1', {
      rawAnalysis: { entities_exhaustive: [] },
    })
    expect(res).toEqual({ ...COUVERTURE_NUE, market_role_families_observed: [] })
  })

  it('throws 404 for an account outside the caller workspace and never computes coverage', async () => {
    const { controller, coverage, accounts } = makeController()
    accounts.findOneForWorkspace.mockResolvedValue(failure({ code: 'not_found', message: 'nope' }))

    await expect(controller.getCoverageGaps('acc-x', USER)).rejects.toBeInstanceOf(NotFoundException)
    expect(coverage.computeForAccount).not.toHaveBeenCalled()
  })

  /* ── #1610 — les familles de rôles OBSERVÉES par la mémoire marché ──────── */

  describe('les familles de rôles observées (#1610)', () => {
    it('les rend quand la mémoire marché couvre le compte', async () => {
      const marketMemory = {
        coverageFor: jest.fn().mockResolvedValue({
          status: 'ok',
          coverage: {
            covered: true,
            marketPaths: 12,
            esnObserved: [],
            observedStack: [],
            roleFamilies: [{ family: 'Direction / Conseil', persons: 5 }],
            exEsnPresent: null,
          },
        }),
      }
      const { controller } = makeController(marketMemory)
      const res = await controller.getCoverageGaps('acc-1', USER)

      expect(res.market_role_families_observed).toEqual([{ family: 'Direction / Conseil', persons: 5 }])
      expect(marketMemory.coverageFor).toHaveBeenCalledWith({
        ref: 'acc-1',
        name: 'Compte Test',
        website: null,
        country: null,
      })
    })

    it('rend [] quand la mémoire marché n’a rien à dire — jamais planter la couverture', async () => {
      const { controller } = makeController()
      const res = await controller.getCoverageGaps('acc-1', USER)
      expect(res.market_role_families_observed).toEqual([])
    })

    it('rend [] quand la couverture est sous le seuil', async () => {
      const marketMemory = {
        coverageFor: jest.fn().mockResolvedValue({
          status: 'ok',
          coverage: {
            covered: false,
            marketPaths: null,
            esnObserved: [],
            observedStack: [],
            roleFamilies: [],
            exEsnPresent: null,
          },
        }),
      }
      const { controller } = makeController(marketMemory)
      const res = await controller.getCoverageGaps('acc-1', USER)
      expect(res.market_role_families_observed).toEqual([])
    })

    it('n’interroge même pas la mémoire quand le compte n’a pas de nom d’entreprise', async () => {
      const marketMemory = memoireMuette()
      const { controller, accounts } = makeController(marketMemory)
      accounts.findOneForWorkspace.mockResolvedValue(success({ id: 'acc-1', company_name: null }))

      const res = await controller.getCoverageGaps('acc-1', USER)
      expect(marketMemory.coverageFor).not.toHaveBeenCalled()
      expect(res.market_role_families_observed).toEqual([])
    })

    /**
     * La contrainte VERBATIM de l'issue : « Ne jamais modifier ce score avec
     * Market Memory ». Le contrôleur COMPOSE, il ne recalcule rien — et la
     * preuve est que la couverture rendue par le service ressort octet pour
     * octet, quelle que soit la réponse de la mémoire marché.
     */
    it('ne modifie JAMAIS le score de couverture — la contrainte non négociable', async () => {
      const riche = {
        coverageFor: jest.fn().mockResolvedValue({
          status: 'ok',
          coverage: {
            covered: true,
            marketPaths: 40,
            esnObserved: [],
            observedStack: [],
            roleFamilies: [{ family: 'Développement', persons: 30 }],
            exEsnPresent: null,
          },
        }),
      }
      const avec = await makeController(riche).controller.getCoverageGaps('acc-1', USER)
      const sans = await makeController().controller.getCoverageGaps('acc-1', USER)

      const { market_role_families_observed: _a, ...couvertureAvec } = avec
      const { market_role_families_observed: _b, ...couvertureSans } = sans
      expect(couvertureAvec).toEqual(couvertureSans)
      expect(couvertureAvec).toEqual(COUVERTURE_NUE)
    })
  })
})
