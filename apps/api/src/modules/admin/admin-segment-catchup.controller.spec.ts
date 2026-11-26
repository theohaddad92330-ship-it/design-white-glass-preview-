import { AdminSegmentCatchupController } from './admin-segment-catchup.controller'
import type { SegmentCatchupService } from '../analysis/segment-catchup.service'

/**
 * #2543.7 (18/09/2026) — LA SEULE PORTE D'ENTRÉE du rattrapage, étendue aux
 * trois segments qui rejoignent contacts (#AF.4). Ce contrôleur ne fait que
 * déléguer — la garde utile est « le bon segment part vers le bon appel »,
 * jamais réécrite en dur d'un segment sur l'autre.
 */
describe('AdminSegmentCatchupController', () => {
  let listConcernedAccountsForSegment: jest.Mock
  let runCatchup: jest.Mock
  let runSegmentCatchup: jest.Mock
  let listPartnerPlacementAccounts: jest.Mock
  let runPartnerPlacementCatchup: jest.Mock
  let listSubsidiaryAccounts: jest.Mock
  let runSubsidiaryCatchup: jest.Mock
  let listAtsHistoryAccounts: jest.Mock
  let runAtsHistoryCatchup: jest.Mock
  let listMergerAccounts: jest.Mock
  let runMergerCatchup: jest.Mock
  let controller: AdminSegmentCatchupController

  beforeEach(() => {
    listConcernedAccountsForSegment = jest.fn().mockResolvedValue([{ id: 'acc-1' }])
    runSegmentCatchup = jest.fn().mockResolvedValue({ scanned: 1, launched: 1, failed: 0, cut: false })
    listPartnerPlacementAccounts = jest.fn().mockResolvedValue([{ id: 'acc-p' }])
    runPartnerPlacementCatchup = jest.fn().mockResolvedValue({ scanned: 1, launched: 1, failed: 0, cut: false })
    listSubsidiaryAccounts = jest.fn().mockResolvedValue([{ id: 'acc-s' }])
    runSubsidiaryCatchup = jest.fn().mockResolvedValue({ scanned: 1, launched: 1, failed: 0, cut: false })
    listAtsHistoryAccounts = jest.fn().mockResolvedValue([{ id: 'acc-a' }])
    runAtsHistoryCatchup = jest.fn().mockResolvedValue({ scanned: 1, launched: 1, failed: 0, cut: false })
    listMergerAccounts = jest.fn().mockResolvedValue([{ id: 'acc-m' }])
    runMergerCatchup = jest.fn().mockResolvedValue({ scanned: 1, launched: 1, failed: 0, cut: false })
    runCatchup = jest.fn().mockResolvedValue({ scanned: 0, launched: 0, failed: 0, cut: false })
    const catchup = {
      listConcernedAccounts: jest.fn().mockResolvedValue([]),
      runCatchup,
      listConcernedAccountsForSegment,
      runSegmentCatchup,
      listPartnerPlacementAccounts,
      runPartnerPlacementCatchup,
      listSubsidiaryAccounts,
      runSubsidiaryCatchup,
      listAtsHistoryAccounts,
      runAtsHistoryCatchup,
      listMergerAccounts,
      runMergerCatchup,
    } as unknown as SegmentCatchupService
    controller = new AdminSegmentCatchupController(catchup)
  })

  describe('#4923.15 — rattrapage contacts restreint à des comptes nommés', () => {
    it('transmet account_ids au service, sans élargir', async () => {
      const ids = ['11111111-1111-4111-8111-111111111111']
      await controller.run({ actor: 'louis', limit: 5, account_ids: ids })
      expect(runCatchup).toHaveBeenCalledWith('louis', 5, ids)
    })

    it('sans account_ids, appel inchangé (le parc concerné, borné par limit)', async () => {
      await controller.run({ actor: 'louis', limit: 5 })
      expect(runCatchup).toHaveBeenCalledWith('louis', 5, undefined)
    })
  })

  describe('preview par segment', () => {
    it('signals/preview lit le segment signaux avec la limite fournie', async () => {
      const result = await controller.previewSignals('50')
      expect(listConcernedAccountsForSegment).toHaveBeenCalledWith('signals', 50)
      expect(result).toEqual({ concerned: 1 })
    })

    it('entities/preview lit le segment entités', async () => {
      await controller.previewEntities(undefined)
      expect(listConcernedAccountsForSegment).toHaveBeenCalledWith('entities', undefined)
    })

    it('strategy/preview lit le segment stratégie', async () => {
      await controller.previewStrategy(undefined)
      expect(listConcernedAccountsForSegment).toHaveBeenCalledWith('strategy', undefined)
    })

    // #2118.51 — le CINQUIÈME segment : la lecture du dossier en sept axes.
    it('dossier-read/preview lit le segment dossier_read, jamais strategy', async () => {
      await controller.previewDossierRead('50')
      expect(listConcernedAccountsForSegment).toHaveBeenCalledWith('dossier_read', 50)
    })
  })

  describe('le rattrapage par segment', () => {
    it('signals déclenche runSegmentCatchup(actor, "signals", limit), jamais un autre segment', async () => {
      const outcome = await controller.runSignals({ actor: 'louis', limit: 25 })
      expect(runSegmentCatchup).toHaveBeenCalledWith('louis', 'signals', 25)
      expect(outcome).toEqual({ scanned: 1, launched: 1, failed: 0, cut: false })
    })

    it('entities déclenche runSegmentCatchup(actor, "entities", limit)', async () => {
      await controller.runEntities({ actor: 'louis', limit: 25 })
      expect(runSegmentCatchup).toHaveBeenCalledWith('louis', 'entities', 25)
    })

    it('strategy déclenche runSegmentCatchup(actor, "strategy", limit)', async () => {
      await controller.runStrategy({ actor: 'louis', limit: 25 })
      expect(runSegmentCatchup).toHaveBeenCalledWith('louis', 'strategy', 25)
    })

    it('sans acteur explicite, retombe sur "backoffice" — même convention que contacts', async () => {
      await controller.runEntities({})
      expect(runSegmentCatchup).toHaveBeenCalledWith('backoffice', 'entities', undefined)
    })

    // #2118.51 — la porte d'opérateur du cinquième segment, même famille,
    // même garde de secret interne (InternalSecretGuard sur le contrôleur).
    it('dossier-read déclenche runSegmentCatchup(actor, "dossier_read", limit), jamais strategy', async () => {
      const outcome = await controller.runDossierRead({ actor: 'louis', limit: 25 })
      expect(runSegmentCatchup).toHaveBeenCalledWith('louis', 'dossier_read', 25)
      expect(outcome).toEqual({ scanned: 1, launched: 1, failed: 0, cut: false })
    })
  })

  // #2887.11 — le rattrapage « partenaire actif » a sa PROPRE porte : jamais le rejeu de tout le segment signaux.
  describe('partenaire actif — #2887.11', () => {
    it('preview compte les seuls comptes partenaires, avec la limite', async () => {
      expect(await controller.previewPartnerPlacements('40')).toEqual({ concerned: 1 })
      expect(listPartnerPlacementAccounts).toHaveBeenCalledWith(40)
      expect(listConcernedAccountsForSegment).not.toHaveBeenCalled()
    })

    it('le rejeu passe par runPartnerPlacementCatchup, jamais par runSegmentCatchup("signals")', async () => {
      await controller.runPartnerPlacements({ actor: 'louis', limit: 25 })
      expect(runPartnerPlacementCatchup).toHaveBeenCalledWith('louis', 25)
      expect(runSegmentCatchup).not.toHaveBeenCalled()
    })
  })

  // #4327 — le rattrapage des FILIALES a sa PROPRE porte : ciblé, jamais tout le parc.
  describe('filiales — #4327', () => {
    it('preview compte les seuls comptes concernés, avec la limite', async () => {
      expect(await controller.previewSubsidiaries('30')).toEqual({ concerned: 1 })
      expect(listSubsidiaryAccounts).toHaveBeenCalledWith(30)
      expect(listConcernedAccountsForSegment).not.toHaveBeenCalled()
    })

    it('le rejeu passe par runSubsidiaryCatchup, jamais par runSegmentCatchup("signals")', async () => {
      await controller.runSubsidiaries({ actor: 'louis', limit: 10 })
      expect(runSubsidiaryCatchup).toHaveBeenCalledWith('louis', 10)
      expect(runSegmentCatchup).not.toHaveBeenCalled()
    })
  })

  // #4687 — le rattrapage de l'historique interne a sa PROPRE porte : ciblé, jamais tout le parc.
  describe('historique interne — #4687', () => {
    it('preview compte les seuls comptes concernés, avec la limite', async () => {
      expect(await controller.previewAtsHistory('30')).toEqual({ concerned: 1 })
      expect(listAtsHistoryAccounts).toHaveBeenCalledWith(30)
      expect(listConcernedAccountsForSegment).not.toHaveBeenCalled()
    })

    it('le rejeu passe par runAtsHistoryCatchup, jamais par runSegmentCatchup("signals")', async () => {
      await controller.runAtsHistory({ actor: 'louis', limit: 10 })
      expect(runAtsHistoryCatchup).toHaveBeenCalledWith('louis', 10)
      expect(runSegmentCatchup).not.toHaveBeenCalled()
    })
  })

  // #4732 — le rattrapage des rachats et fusions a sa PROPRE porte : ciblé, jamais tout le parc.
  describe('rachats et fusions — #4732', () => {
    it('preview compte les seuls comptes concernés, avec la limite', async () => {
      expect(await controller.previewMergers('30')).toEqual({ concerned: 1 })
      expect(listMergerAccounts).toHaveBeenCalledWith(30)
      expect(listConcernedAccountsForSegment).not.toHaveBeenCalled()
    })

    it('le rejeu passe par runMergerCatchup, jamais par runSegmentCatchup("signals")', async () => {
      await controller.runMergers({ actor: 'louis', limit: 10 })
      expect(runMergerCatchup).toHaveBeenCalledWith('louis', 10)
      expect(runSegmentCatchup).not.toHaveBeenCalled()
    })
  })
})
