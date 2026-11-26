import { failure, success } from '@bellum/utils'
import type { Repository } from 'typeorm'
import { MISSING_ROLES_CATCHUP_MAX_ATTEMPTS } from '@bellum/contracts'
import { MissingRolesCatchupService } from './missing-roles-catchup.service'
import { OrgEnrichmentJobService } from './org-enrichment-job.service'
import { AccountEntity } from '../../database/entities/account.entity'

/**
 * #2637.1 — LE RATTRAPAGE AUTOMATIQUE DES RÔLES MANQUANTS.
 *
 * Quatre exigences que ce lot doit savoir dire NON, chacune son témoin :
 *  1. l'interrupteur coupé (GA-84/GA-85) arrête TOUT, y compris un appel
 *     explicite — comme les six segments gratuits ;
 *  2. un compte rattrapé DEPUIS la capacité n'est pas concerné (date, jamais
 *     symptôme) ;
 *  3. un compte qui a ÉPUISÉ ses tentatives ne repart pas, même si son job
 *     reste `partial`/`failed` — le second garde-fou, distinct du premier ;
 *  4. la correction humaine est héritée : le SEUL point d'écriture
 *     d'enrichissement est `OrgEnrichmentJobService.advance`, jamais une
 *     écriture directe.
 */
describe('MissingRolesCatchupService', () => {
  let query: jest.Mock
  let update: jest.Mock
  let advance: jest.Mock
  let service: MissingRolesCatchupService

  const CONCERNED_ROW = {
    id: 'acc-never-caught-up',
    user_id: 'user-owner-1',
    missing_roles_catchup_at: null as Date | null,
    missing_roles_catchup_attempts: 0,
  }
  const CAUGHT_UP_ROW = {
    id: 'acc-caught-up',
    user_id: 'user-owner-2',
    // Postérieur à MISSING_ROLES_CATCHUP_CAPABILITY_AT (2026-09-21T15:30:00.000Z).
    missing_roles_catchup_at: new Date('2026-09-21T16:00:00.000Z'),
    missing_roles_catchup_attempts: 1,
  }

  beforeEach(() => {
    query = jest.fn().mockResolvedValue([CONCERNED_ROW])
    update = jest.fn().mockResolvedValue({ affected: 1 })
    const accounts = { manager: { query }, update } as unknown as Repository<AccountEntity>
    advance = jest.fn().mockResolvedValue(
      success({
        job: { status: 'completed' },
        ranWave: { index: 0, matched: 2, creditsDebited: 3 },
      }),
    )
    const orgEnrichmentJobs = { advance } as unknown as OrgEnrichmentJobService
    service = new MissingRolesCatchupService(accounts, orgEnrichmentJobs)
    delete process.env.MISSING_ROLES_CATCHUP_DISABLED
  })

  afterEach(() => {
    delete process.env.MISSING_ROLES_CATCHUP_DISABLED
  })

  describe('listConcernedAccounts — ciblage par DATE, jamais par symptôme', () => {
    it('un compte jamais rattrapé est concerné (témoin positif)', async () => {
      query.mockResolvedValueOnce([CONCERNED_ROW])
      const result = await service.listConcernedAccounts()
      expect(result.map(r => r.id)).toEqual(['acc-never-caught-up'])
    })

    it("un compte rattrapé APRÈS la capacité n'est PAS concerné, même si le SQL le rend — la fonction pure tranche en dernier (témoin négatif)", async () => {
      query.mockResolvedValueOnce([CONCERNED_ROW, CAUGHT_UP_ROW])
      const result = await service.listConcernedAccounts()
      expect(result.map(r => r.id)).toEqual(['acc-never-caught-up'])
    })

    it('un compte ayant ÉPUISÉ ses tentatives (attempts >= plafond) n’est PAS concerné, même si le SQL le rend — second garde-fou', async () => {
      const exhausted = {
        id: 'acc-exhausted',
        user_id: 'user-owner-3',
        missing_roles_catchup_at: null,
        missing_roles_catchup_attempts: MISSING_ROLES_CATCHUP_MAX_ATTEMPTS,
      }
      query.mockResolvedValueOnce([CONCERNED_ROW, exhausted])
      const result = await service.listConcernedAccounts()
      expect(result.map(r => r.id)).toEqual(['acc-never-caught-up'])
    })

    it('borne la requête SQL — jamais tout le parc', async () => {
      await service.listConcernedAccounts(50)
      expect(query).toHaveBeenCalledWith(expect.any(String), [
        MISSING_ROLES_CATCHUP_MAX_ATTEMPTS,
        '2026-09-21T15:30:00.000Z',
        50,
      ])
    })
  })

  describe('runCatchup — jamais automatique, jamais massif, jamais un achat sans crédit du client', () => {
    it("l'interrupteur d'arrêt (GA-84/GA-85) coupe TOUT, même un appel explicite — zéro appel réseau", async () => {
      process.env.MISSING_ROLES_CATCHUP_DISABLED = 'true'
      const outcome = await service.runCatchup('operator-1')
      expect(outcome).toEqual({ scanned: 0, launched: 0, skipped: 0, failed: 0, cut: true })
      expect(advance).not.toHaveBeenCalled()
      expect(query).not.toHaveBeenCalled()
    })

    it('rejoue chaque compte concerné AU NOM DE SON PROPRIÉTAIRE, jamais un userId opérateur, via advance({ mode: "missing_roles" }), et GRATUITEMENT (#2637.1)', async () => {
      query.mockResolvedValueOnce([CONCERNED_ROW])
      const outcome = await service.runCatchup('operator-1')
      // #2637.1 — gratuit, décision Louis 21/09/2026 : le rattrapage
      // AUTOMATIQUE passe `{ free: true }`, contrairement au bouton manuel
      // (`enrich-gaps`) qui n'appelle jamais `advance` avec cette option.
      expect(advance).toHaveBeenCalledWith(
        'acc-never-caught-up',
        'user-owner-1',
        { mode: 'missing_roles' },
        undefined,
        {
          free: true,
        },
      )
      expect(outcome).toEqual({ scanned: 1, launched: 1, skipped: 0, failed: 0, cut: false })
    })

    it('un job COMPLETED marque le compte rattrapé (missing_roles_catchup_at posé) — il ne revient plus', async () => {
      query.mockResolvedValueOnce([CONCERNED_ROW])
      advance.mockResolvedValueOnce(
        success({ job: { status: 'completed' }, ranWave: { index: 0, matched: 0, creditsDebited: 1 } }),
      )
      await service.runCatchup('operator-1')
      expect(update).toHaveBeenCalledWith(
        'acc-never-caught-up',
        expect.objectContaining({ missing_roles_catchup_attempts: 1, missing_roles_catchup_at: expect.any(Date) }),
      )
    })

    it('un job encore PARTIAL (plus de vagues à venir) incrémente les tentatives SANS marquer le compte rattrapé — il reste concerné', async () => {
      query.mockResolvedValueOnce([CONCERNED_ROW])
      advance.mockResolvedValueOnce(
        success({ job: { status: 'partial' }, ranWave: { index: 0, matched: 1, creditsDebited: 2 } }),
      )
      await service.runCatchup('operator-1')
      expect(update).toHaveBeenCalledWith('acc-never-caught-up', { missing_roles_catchup_attempts: 1 })
    })

    it('un job PARTIAL qui atteint le plafond de tentatives est marqué rattrapé — le compte ne revient plus, même sans résultat', async () => {
      const almostExhausted = {
        id: 'acc-almost-exhausted',
        user_id: 'user-owner-4',
        missing_roles_catchup_at: null,
        missing_roles_catchup_attempts: MISSING_ROLES_CATCHUP_MAX_ATTEMPTS - 1,
      }
      query.mockResolvedValueOnce([almostExhausted])
      advance.mockResolvedValueOnce(
        success({ job: { status: 'partial' }, ranWave: { index: 1, matched: 0, creditsDebited: 2 } }),
      )
      await service.runCatchup('operator-1')
      expect(update).toHaveBeenCalledWith(
        'acc-almost-exhausted',
        expect.objectContaining({
          missing_roles_catchup_attempts: MISSING_ROLES_CATCHUP_MAX_ATTEMPTS,
          missing_roles_catchup_at: expect.any(Date),
        }),
      )
    })

    it('rien à enrichir (not_found) ou crédit insuffisant : le compte est marqué rattrapé tout de suite, compté "skipped" — jamais retenté pour rien', async () => {
      query.mockResolvedValueOnce([CONCERNED_ROW])
      advance.mockResolvedValueOnce(failure({ code: 'not_found', message: 'Rien à enrichir dans ce périmètre.' }))
      const outcome = await service.runCatchup('operator-1')
      expect(outcome).toEqual({ scanned: 1, launched: 0, skipped: 1, failed: 0, cut: false })
      expect(update).toHaveBeenCalledWith(
        'acc-never-caught-up',
        expect.objectContaining({ missing_roles_catchup_at: expect.any(Date) }),
      )
    })

    it('une vague qui échoue (ia_failed) ne bloque pas les autres comptes, et se compte "failed" à part', async () => {
      query.mockResolvedValueOnce([
        CONCERNED_ROW,
        { id: 'acc-2', user_id: 'user-owner-5', missing_roles_catchup_at: null, missing_roles_catchup_attempts: 0 },
      ])
      advance
        .mockResolvedValueOnce(failure({ code: 'ia_failed', message: 'panne' }))
        .mockResolvedValueOnce(
          success({ job: { status: 'completed' }, ranWave: { index: 0, matched: 1, creditsDebited: 1 } }),
        )
      const outcome = await service.runCatchup('operator-1')
      expect(outcome).toEqual({ scanned: 2, launched: 1, skipped: 0, failed: 1, cut: false })
    })

    it("le SEUL point d'écriture d'enrichissement est OrgEnrichmentJobService.advance — jamais une écriture directe (correction humaine héritée)", async () => {
      query.mockResolvedValueOnce([CONCERNED_ROW])
      await service.runCatchup('operator-1')
      // Le mock `accounts` n'expose que `manager.query` (lecture) et `update`
      // (notre propre bookkeeping de date/tentatives) — aucune autre méthode
      // n'est appelée : ni upsert de contact, ni écriture de graphe.
      expect(advance).toHaveBeenCalledTimes(1)
    })
  })
})
