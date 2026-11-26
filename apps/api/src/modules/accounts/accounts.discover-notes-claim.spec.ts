import { isFailure } from '@bellum/utils'
import { AccountsService } from './accounts.service'

/**
 * #2151.59 — « reprise quand le candidat devient un dossier de compte » :
 * les deux chemins qui transforment un candidat Découvrir en compte
 * (`create`, lancé depuis une analyse, et `addToPortfolio`, le « Suivre »
 * sans analyse) émettent sur `AccountClaimBus` — même ligne, jamais une
 * copie, et jamais un incident ici qui fait échouer la création.
 *
 * GA-07 (18/09/2026) : `AccountsService` n'importe plus
 * `DiscoverCandidateNotesService` directement — il émet sur `AccountClaimBus`
 * (module `discover-notes`), que `AccountClaimListener` écoute pour faire
 * l'appel à sa place. Ce test vérifie donc l'ÉMISSION, pas l'appel direct.
 */
describe('AccountsService — reprise des notes candidat à la conversion (#2151.59)', () => {
  const WORKSPACE = 'ws-1'

  const build = (accountClaims: { emit: jest.Mock } | undefined) => {
    const saved = { id: 'acc-1', siren: '552081317' }
    const accounts = {
      create: jest.fn(input => input),
      save: jest.fn().mockResolvedValue(saved),
    }
    const workspaceContext = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: WORKSPACE }) }
    const service = new AccountsService(
      accounts as never,
      {} as never,
      workspaceContext as never,
      {} as never,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      // #2127.37 (vague 18/09 M) a inséré `similarAccountDismissals` juste avant
      // `accountClaims` — un `undefined` de plus ici, sans quoi `accountClaims`
      // se lie au mauvais paramètre positionnel.
      undefined,
      accountClaims as never,
    )
    return { service, accounts, saved }
  }

  describe('create', () => {
    it('émet la reprise des notes du candidat sur le compte créé', async () => {
      const emit = jest.fn().mockResolvedValue(undefined)
      const { service, saved } = build({ emit })

      const result = await service.create('user-1', { company_name: 'Acme', siren: '552081317' } as never)

      expect(isFailure(result)).toBe(false)
      expect(emit).toHaveBeenCalledWith({ workspaceId: WORKSPACE, siren: '552081317', accountId: saved.id })
    })

    it('sans AccountClaimBus injecté (module optionnel), la création réussit quand même', async () => {
      const { service } = build(undefined)
      const result = await service.create('user-1', { company_name: 'Acme', siren: '552081317' } as never)
      expect(isFailure(result)).toBe(false)
    })
  })

  describe('addToPortfolio', () => {
    it('émet la reprise des notes du candidat sur le compte créé (chemin « Suivre »)', async () => {
      const emit = jest.fn().mockResolvedValue(undefined)
      const { service, saved } = build({ emit })
      // `findPortfolioCandidate` interroge `this.accounts` — le mock ne renvoie
      // rien pour `findOne`/`createQueryBuilder`, donc la branche « nouveau
      // compte » est celle exercée (comme un candidat jamais suivi).
      ;(service as unknown as { findPortfolioCandidate: jest.Mock }).findPortfolioCandidate = jest
        .fn()
        .mockResolvedValue(null)

      const result = await service.addToPortfolio('user-1', {
        company_name: 'Acme',
        siren: '552081317',
      } as never)

      expect(isFailure(result)).toBe(false)
      expect(emit).toHaveBeenCalledWith({ workspaceId: WORKSPACE, siren: '552081317', accountId: saved.id })
    })
  })
})
