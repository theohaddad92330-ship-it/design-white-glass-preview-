import { failure, success } from '@bellum/utils'
import type { Repository } from 'typeorm'
import { SEGMENT_CAPABILITY_EPOCH, segmentCapabilityAt } from '@bellum/contracts'
import {
  ATS_HISTORY_BY_WORKSPACE_CAPABILITY,
  MERGER_SIGNALS_CAPABILITY,
  SegmentCatchupService,
} from './segment-catchup.service'
import { AnalysisOnDemandService } from './analysis-ondemand.service'
import { AccountEntity } from '../../database/entities/account.entity'

/**
 * #AF.2/#AF.4 — LE RATTRAPAGE CIBLÉ PAR SEGMENT (décision Louis, 18/09/2026).
 *
 * Deux exigences que ce lot doit savoir dire NON, chacune cassée puis
 * corrigée pendant l'écriture de ce fichier (voir le commit) :
 *  1. le ciblage ne devient JAMAIS massif — un compte dont la collecte est
 *     POSTÉRIEURE à la capacité #2543 ne doit PAS être rejoué, témoin positif
 *     ET négatif dans le même corpus (non vide : deux comptes réels) ;
 *  2. un interrupteur coupé (GA-84/GA-85) arrête TOUT, y compris un appel
 *     explicite — le seul frein qui reste si le ciblage se trompait un jour.
 */
describe('SegmentCatchupService', () => {
  let query: jest.Mock
  let enrichContacts: jest.Mock
  let refreshResearch: jest.Mock
  let enrichOrganigram: jest.Mock
  let replan: jest.Mock
  let recalculateRelationAxis: jest.Mock
  let service: SegmentCatchupService

  const CONCERNED_ROW = { id: 'acc-stale', user_id: 'user-owner-1', contacts_collected_at: null as Date | null }
  // ⚠️ #2655.2 (21/09/2026) — cette date se DÉDUIT de l'epoch, elle ne s'écrit
  // plus à la main. Elle valait `2026-09-18T12:00:00.000Z` en dur, choisie
  // postérieure à la capacité #2543. Quand #2655.1 a daté une SECONDE capacité
  // sur le même segment (20/09 13:08Z), ce compte est devenu concerné sans que
  // le fixture le sache : le « témoin négatif » testait alors le contraire de
  // ce qu'il annonce. Dériver est le seul moyen qu'il reste juste.
  const FRESH_ROW = {
    id: 'acc-fresh',
    user_id: 'user-owner-2',
    contacts_collected_at: new Date(Date.parse(SEGMENT_CAPABILITY_EPOCH.contacts as string) + 12 * 3600 * 1000),
  }

  // #2543.7 — le type expose `SEGMENT_CAPABILITY_EPOCH` en `Readonly`, mais
  // rien ne le `Object.freeze` : ce cast le MUTE le temps d'un test, exactement
  // comme les tests voisins posent/retirent un `process.env`, pour prouver le
  // ciblage générique SANS committer une capacité datée qui n'existe pas.
  // ⚠️ L'absence de gel est DÉLIBÉRÉE et documentée dans `segment-catchup.ts` —
  // c'est ce test-ci qui l'exige.
  const MUTABLE_EPOCH = SEGMENT_CAPABILITY_EPOCH as Record<string, string | undefined>

  beforeEach(() => {
    query = jest.fn().mockResolvedValue([CONCERNED_ROW])
    const accounts = { manager: { query } } as unknown as Repository<AccountEntity>
    enrichContacts = jest.fn().mockResolvedValue(success({ count: 3, identified: 3, organigramRebuild: 'skipped' }))
    refreshResearch = jest.fn().mockResolvedValue(success({ refreshed: true }))
    enrichOrganigram = jest.fn().mockResolvedValue(success({ matched: 1, total: 1 }))
    replan = jest.fn().mockResolvedValue(success({ replanned: true }))
    recalculateRelationAxis = jest.fn().mockResolvedValue(success({ measured: true }))
    const onDemand = {
      enrichContacts,
      refreshResearch,
      enrichOrganigram,
      replan,
      recalculateRelationAxis,
    } as unknown as AnalysisOnDemandService
    service = new SegmentCatchupService(accounts, onDemand)
    delete process.env.CONTACTS_SEGMENT_CATCHUP_DISABLED
    delete process.env.SIGNALS_SEGMENT_CATCHUP_DISABLED
    delete process.env.ENTITIES_SEGMENT_CATCHUP_DISABLED
    delete process.env.STRATEGY_SEGMENT_CATCHUP_DISABLED
    delete process.env.DOSSIER_READ_SEGMENT_CATCHUP_DISABLED
    delete process.env.ACCESS_RELATION_SEGMENT_CATCHUP_DISABLED
  })

  afterEach(() => {
    delete process.env.CONTACTS_SEGMENT_CATCHUP_DISABLED
    delete process.env.SIGNALS_SEGMENT_CATCHUP_DISABLED
    delete process.env.ENTITIES_SEGMENT_CATCHUP_DISABLED
    delete process.env.STRATEGY_SEGMENT_CATCHUP_DISABLED
    delete process.env.DOSSIER_READ_SEGMENT_CATCHUP_DISABLED
    delete process.env.ACCESS_RELATION_SEGMENT_CATCHUP_DISABLED
    delete MUTABLE_EPOCH.signals
    delete MUTABLE_EPOCH.entities
    delete MUTABLE_EPOCH.strategy
  })

  describe('listConcernedAccounts — #AF.2 le ciblage ne devient jamais massif', () => {
    it('un compte collecté AVANT la capacité #2543 est concerné (témoin positif)', async () => {
      query.mockResolvedValueOnce([CONCERNED_ROW])
      const result = await service.listConcernedAccounts()
      expect(result.map(r => r.id)).toEqual(['acc-stale'])
    })

    it("un compte collecté APRÈS la capacité n'est PAS concerné, même si le SQL le rend — la fonction pure tranche en dernier (témoin négatif)", async () => {
      // Corpus non vide : le SQL a un bug (ou une horloge décalée) et rend le
      // compte frais quand même — le filtre applicatif doit l'écarter.
      query.mockResolvedValueOnce([CONCERNED_ROW, FRESH_ROW])
      const result = await service.listConcernedAccounts()
      expect(result.map(r => r.id)).toEqual(['acc-stale'])
    })

    it('borne la requête SQL — jamais tout le parc', async () => {
      await service.listConcernedAccounts(50)
      // Dérivé, pas écrit en dur : la requête doit porter LA capacité en vigueur.
      expect(query).toHaveBeenCalledWith(expect.any(String), [SEGMENT_CAPABILITY_EPOCH.contacts, 50])
    })
  })

  describe('#4923.15 — le rattrapage commence par les comptes NOMMÉS, pas par tout le parc concerné', () => {
    const IDS = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222']

    it('sans liste de comptes, la requête est byte-identique (aucune clause ajoutée)', async () => {
      await service.listConcernedAccounts(50)
      const sql = String(query.mock.calls[0][0])
      expect(sql).not.toContain('ANY(')
      expect(query.mock.calls[0][1]).toEqual([SEGMENT_CAPABILITY_EPOCH.contacts, 50])
    })

    it('avec une liste, la requête se restreint à ces comptes — jamais le parc', async () => {
      await service.listConcernedAccounts(50, IDS)
      expect(String(query.mock.calls[0][0])).toContain('id = ANY($3::uuid[])')
      expect(query.mock.calls[0][1]).toEqual([SEGMENT_CAPABILITY_EPOCH.contacts, 50, IDS])
    })

    it('runCatchup transmet la liste, et un compte hors liste n’est pas rejoué', async () => {
      await service.runCatchup('operator-1', 10, IDS)
      expect(query.mock.calls[0][1]).toEqual([SEGMENT_CAPABILITY_EPOCH.contacts, 10, IDS])
    })

    it('une liste vide ne rattrape RIEN (elle ne se lit pas comme « tout »)', async () => {
      const outcome = await service.runCatchup('operator-1', 10, [])
      expect(query).not.toHaveBeenCalled()
      expect(outcome).toEqual({ scanned: 0, launched: 0, failed: 0, cut: false })
    })
  })

  describe('runCatchup — #AF.4 jamais automatique, jamais massif', () => {
    it('rejoue chaque compte concerné AU NOM DE SON PROPRIÉTAIRE, jamais un userId opérateur', async () => {
      query.mockResolvedValueOnce([CONCERNED_ROW])
      const outcome = await service.runCatchup('operator-1')
      expect(enrichContacts).toHaveBeenCalledWith('acc-stale', 'user-owner-1', undefined)
      expect(outcome).toEqual({ scanned: 1, launched: 1, failed: 0, cut: false })
    })

    it('ne rejoue PAS un compte frais présent dans le lot — le témoin négatif tient aussi à l’exécution', async () => {
      query.mockResolvedValueOnce([CONCERNED_ROW, FRESH_ROW])
      await service.runCatchup('operator-1')
      expect(enrichContacts).toHaveBeenCalledTimes(1)
      expect(enrichContacts).not.toHaveBeenCalledWith('acc-fresh', expect.anything(), expect.anything())
    })

    it('un compte en échec ne bloque pas les autres, et se compte à part', async () => {
      query.mockResolvedValueOnce([
        CONCERNED_ROW,
        { id: 'acc-stale-2', user_id: 'user-owner-3', contacts_collected_at: null },
      ])
      enrichContacts
        .mockResolvedValueOnce(failure({ code: 'ia_failed', message: 'panne' }))
        .mockResolvedValueOnce(success({ count: 1, identified: 1, organigramRebuild: 'skipped' }))
      const outcome = await service.runCatchup('operator-1')
      expect(outcome).toEqual({ scanned: 2, launched: 1, failed: 1, cut: false })
    })

    it("l'interrupteur d'arrêt (GA-84/GA-85) coupe TOUT, même un appel explicite", async () => {
      process.env.CONTACTS_SEGMENT_CATCHUP_DISABLED = 'true'
      const outcome = await service.runCatchup('operator-1')
      expect(outcome).toEqual({ scanned: 0, launched: 0, failed: 0, cut: true })
      expect(enrichContacts).not.toHaveBeenCalled()
      expect(query).not.toHaveBeenCalled()
    })
  })

  /**
   * #2543.7 — LE RATTRAPAGE CIBLÉ, ÉTENDU AUX TROIS AUTRES SEGMENTS.
   *
   * Le test central n'est pas « la colonne existe » — c'est « qui est
   * concerné ». Chaque segment reçoit ici son propre témoin positif ET
   * négatif (non vide), sa borne SQL, son interrupteur ISOLÉ des trois
   * autres, et la preuve qu'un rejeu d'UN segment n'appelle JAMAIS le chemin
   * on-demand d'un autre.
   */
  describe('listConcernedAccountsForSegment / runSegmentCatchup — #2543.7', () => {
    it("rend [] pour un segment sans capacité datée — ne devine jamais (aucune entrée n'a encore été ajoutée à SEGMENT_CAPABILITY_EPOCH pour entities)", async () => {
      const result = await service.listConcernedAccountsForSegment('entities')
      expect(result).toEqual([])
      expect(query).not.toHaveBeenCalled()
    })

    it('un compte collecté AVANT la capacité du segment est concerné (témoin positif)', async () => {
      MUTABLE_EPOCH.entities = '2026-09-18T00:00:00.000Z'
      query.mockResolvedValueOnce([{ id: 'acc-org-stale', user_id: 'user-owner-1', collected_at: null }])
      const result = await service.listConcernedAccountsForSegment('entities')
      expect(result.map(r => r.id)).toEqual(['acc-org-stale'])
    })

    it("un compte collecté APRÈS la capacité n'est PAS concerné — contrôle négatif, même corpus non vide", async () => {
      MUTABLE_EPOCH.signals = '2026-09-18T00:00:00.000Z'
      query.mockResolvedValueOnce([
        { id: 'acc-signals-stale', user_id: 'user-owner-1', collected_at: null },
        { id: 'acc-signals-fresh', user_id: 'user-owner-2', collected_at: new Date('2026-09-18T12:00:00.000Z') },
      ])
      const result = await service.listConcernedAccountsForSegment('signals')
      expect(result.map(r => r.id)).toEqual(['acc-signals-stale'])
    })

    // rejeu signaux 10/10 — les comptes des espaces DÉMO (workspaces.is_demo) ne se rattrapent jamais :
    // 145 « restants » figés en precondition_failed. Même critère que stuck-analysis.reaper.
    it('exclut les comptes des espaces DÉMO dans la requête SQL, pas ceux des espaces réels', async () => {
      MUTABLE_EPOCH.signals = '2026-09-18T00:00:00.000Z'
      await service.listConcernedAccountsForSegment('signals')
      const sql = String(query.mock.calls[0][0])
      expect(sql).toMatch(
        /NOT EXISTS \(SELECT 1 FROM workspaces w WHERE w\.id = accounts\.workspace_id AND w\.is_demo = true\)/,
      )
    })

    // #4036.D4 (Louis 15/10) — le rattrapage « partenaire actif » (#2887, segment signaux) ne vise que
    // les comptes consultés ou suivis dans les 90 derniers jours ; les autres sont rejoués à leur prochaine ouverture.
    it('signaux : ne vise que les comptes actifs dans les 90 derniers jours (mise à jour ou échange)', async () => {
      MUTABLE_EPOCH.signals = '2026-09-18T00:00:00.000Z'
      await service.listConcernedAccountsForSegment('signals')
      const sql = String(query.mock.calls[0][0])
      expect(sql).toMatch(/updated_at >= now\(\) - interval '90 days'/)
      expect(sql).toMatch(/FROM activities act[\s\S]*act\.occurred_at >= now\(\) - interval '90 days'/)
    })

    it('les autres segments ne reçoivent PAS la fenêtre de 90 jours — la décision ne vise que signaux', async () => {
      MUTABLE_EPOCH.strategy = '2026-09-18T00:00:00.000Z'
      await service.listConcernedAccountsForSegment('strategy')
      expect(String(query.mock.calls[0][0])).not.toMatch(/90 days/)
    })

    it('borne la requête SQL — jamais tout le parc', async () => {
      const capacite = '2026-09-18T00:00:00.000Z'
      MUTABLE_EPOCH.strategy = capacite
      await service.listConcernedAccountsForSegment('strategy', 50)
      // La requête porte la capacité DE CE SEGMENT, pas celle d'un autre.
      expect(query).toHaveBeenCalledWith(expect.any(String), [capacite, 50])
    })

    it('runSegmentCatchup(entities) rejoue enrichOrganigram AU NOM DU PROPRIÉTAIRE, jamais les deux autres chemins', async () => {
      MUTABLE_EPOCH.entities = '2026-09-18T00:00:00.000Z'
      query.mockResolvedValueOnce([{ id: 'acc-org', user_id: 'user-owner-1', collected_at: null }])
      const outcome = await service.runSegmentCatchup('operator-1', 'entities')
      expect(enrichOrganigram).toHaveBeenCalledWith('acc-org', 'user-owner-1')
      expect(refreshResearch).not.toHaveBeenCalled()
      expect(replan).not.toHaveBeenCalled()
      expect(enrichContacts).not.toHaveBeenCalled()
      expect(outcome).toEqual({ scanned: 1, launched: 1, failed: 0, cut: false })
    })

    it('runSegmentCatchup(signals) rejoue refreshResearch, jamais enrichOrganigram/replan/enrichContacts', async () => {
      MUTABLE_EPOCH.signals = '2026-09-18T00:00:00.000Z'
      query.mockResolvedValueOnce([{ id: 'acc-sig', user_id: 'user-owner-2', collected_at: null }])
      await service.runSegmentCatchup('operator-1', 'signals')
      expect(refreshResearch).toHaveBeenCalledWith('acc-sig', 'user-owner-2')
      expect(enrichOrganigram).not.toHaveBeenCalled()
      expect(replan).not.toHaveBeenCalled()
      expect(enrichContacts).not.toHaveBeenCalled()
    })

    it('runSegmentCatchup(strategy) rejoue replan, jamais les trois autres chemins', async () => {
      MUTABLE_EPOCH.strategy = '2026-09-18T00:00:00.000Z'
      query.mockResolvedValueOnce([{ id: 'acc-strat', user_id: 'user-owner-3', collected_at: null }])
      await service.runSegmentCatchup('operator-1', 'strategy')
      expect(replan).toHaveBeenCalledWith('acc-strat', 'user-owner-3', undefined)
      expect(refreshResearch).not.toHaveBeenCalled()
      expect(enrichOrganigram).not.toHaveBeenCalled()
      expect(enrichContacts).not.toHaveBeenCalled()
    })

    /**
     * #2118.51 (18/09/2026) — LE CINQUIÈME SEGMENT : la lecture du dossier en
     * sept axes (#2118). Contrairement à entities/signals/strategy ci-dessus,
     * sa capacité est RÉELLEMENT datée en production
     * (`SEGMENT_CAPABILITY_EPOCH.dossier_read`, voir son docblock) — ces tests
     * n'ont donc pas besoin de muter `MUTABLE_EPOCH`, ils lisent la vraie
     * valeur, exactement comme les tests `contacts` plus haut lisent la vraie
     * valeur de `SEGMENT_CAPABILITY_EPOCH.contacts`.
     */
    describe('dossier_read — le cinquième segment (#2118.51)', () => {
      const DOSSIER_READ_EPOCH = '2026-09-14T17:46:41.000Z'

      it('un compte collecté AVANT la capacité #2118.51 est concerné (témoin positif)', async () => {
        query.mockResolvedValueOnce([{ id: 'acc-dr-stale', user_id: 'user-owner-1', collected_at: null }])
        const result = await service.listConcernedAccountsForSegment('dossier_read')
        expect(result.map(r => r.id)).toEqual(['acc-dr-stale'])
      })

      it("un compte collecté APRÈS la capacité n'est PAS concerné — contrôle négatif, même corpus non vide", async () => {
        query.mockResolvedValueOnce([
          { id: 'acc-dr-stale', user_id: 'user-owner-1', collected_at: null },
          {
            id: 'acc-dr-fresh',
            user_id: 'user-owner-2',
            collected_at: new Date('2026-09-18T12:00:00.000Z'),
          },
        ])
        const result = await service.listConcernedAccountsForSegment('dossier_read')
        expect(result.map(r => r.id)).toEqual(['acc-dr-stale'])
      })

      it('borne la requête SQL sur la colonne dossier_read_collected_at — jamais tout le parc', async () => {
        await service.listConcernedAccountsForSegment('dossier_read', 50)
        expect(query).toHaveBeenCalledWith(expect.stringContaining('dossier_read_collected_at'), [
          DOSSIER_READ_EPOCH,
          50,
        ])
      })

      it('runSegmentCatchup(dossier_read) rejoue replan — la MÊME ré-analyse que « Changer de stratégie », jamais les trois autres chemins', async () => {
        query.mockResolvedValueOnce([{ id: 'acc-dr', user_id: 'user-owner-4', collected_at: null }])
        const outcome = await service.runSegmentCatchup('operator-1', 'dossier_read')
        expect(replan).toHaveBeenCalledWith('acc-dr', 'user-owner-4', undefined)
        expect(refreshResearch).not.toHaveBeenCalled()
        expect(enrichOrganigram).not.toHaveBeenCalled()
        expect(enrichContacts).not.toHaveBeenCalled()
        expect(outcome).toEqual({ scanned: 1, launched: 1, failed: 0, cut: false })
      })

      it("l'interrupteur PROPRE à dossier_read coupe CE segment sans couper strategy", async () => {
        MUTABLE_EPOCH.strategy = '2026-09-18T00:00:00.000Z'
        process.env.DOSSIER_READ_SEGMENT_CATCHUP_DISABLED = 'true'
        query.mockResolvedValue([{ id: 'acc-x', user_id: 'user-owner-1', collected_at: null }])

        const dossierReadOutcome = await service.runSegmentCatchup('operator-1', 'dossier_read')
        expect(dossierReadOutcome).toEqual({ scanned: 0, launched: 0, failed: 0, cut: true })
        expect(replan).not.toHaveBeenCalled()

        const strategyOutcome = await service.runSegmentCatchup('operator-1', 'strategy')
        expect(strategyOutcome.cut).toBe(false)
        expect(replan).toHaveBeenCalledWith('acc-x', 'user-owner-1', undefined)
      })
    })

    /**
     * #2298.4 (19/09/2026, lot I3) — le SIXIÈME segment : l'axe relation
     * seul, GRATUIT. Même famille que `dossier_read` (sa capacité est
     * RÉELLEMENT datée en production, `SEGMENT_CAPABILITY_EPOCH.access_relation`)
     * — ces tests lisent la vraie valeur, aucune mutation nécessaire.
     */
    describe('access_relation — le sixième segment, gratuit (#2298.4)', () => {
      const ACCESS_RELATION_EPOCH = '2026-09-19T10:59:00.000Z'

      it('un compte collecté AVANT la capacité #2298.4 est concerné (témoin positif)', async () => {
        query.mockResolvedValueOnce([{ id: 'acc-ar-stale', user_id: 'user-owner-1', collected_at: null }])
        const result = await service.listConcernedAccountsForSegment('access_relation')
        expect(result.map(r => r.id)).toEqual(['acc-ar-stale'])
      })

      it('borne la requête SQL sur addressability_relation_collected_at — jamais tout le parc', async () => {
        await service.listConcernedAccountsForSegment('access_relation', 50)
        expect(query).toHaveBeenCalledWith(expect.stringContaining('addressability_relation_collected_at'), [
          ACCESS_RELATION_EPOCH,
          50,
        ])
      })

      it('runSegmentCatchup(access_relation) rejoue recalculateRelationAxis — le chemin GRATUIT, jamais les quatre autres', async () => {
        query.mockResolvedValueOnce([{ id: 'acc-ar', user_id: 'user-owner-4', collected_at: null }])
        const outcome = await service.runSegmentCatchup('operator-1', 'access_relation')
        expect(recalculateRelationAxis).toHaveBeenCalledWith('acc-ar', 'user-owner-4')
        expect(refreshResearch).not.toHaveBeenCalled()
        expect(enrichOrganigram).not.toHaveBeenCalled()
        expect(enrichContacts).not.toHaveBeenCalled()
        expect(replan).not.toHaveBeenCalled()
        expect(outcome).toEqual({ scanned: 1, launched: 1, failed: 0, cut: false })
      })

      it("l'interrupteur PROPRE à access_relation coupe CE segment sans couper dossier_read", async () => {
        MUTABLE_EPOCH.dossier_read = '2026-09-14T17:46:41.000Z'
        process.env.ACCESS_RELATION_SEGMENT_CATCHUP_DISABLED = 'true'
        query.mockResolvedValue([{ id: 'acc-x', user_id: 'user-owner-1', collected_at: null }])

        const accessRelationOutcome = await service.runSegmentCatchup('operator-1', 'access_relation')
        expect(accessRelationOutcome).toEqual({ scanned: 0, launched: 0, failed: 0, cut: true })
        expect(recalculateRelationAxis).not.toHaveBeenCalled()

        const dossierReadOutcome = await service.runSegmentCatchup('operator-1', 'dossier_read')
        expect(dossierReadOutcome.cut).toBe(false)
        expect(replan).toHaveBeenCalledWith('acc-x', 'user-owner-1', undefined)
      })
    })

    it('un interrupteur PAR SEGMENT coupe SON segment, mais pas les autres', async () => {
      MUTABLE_EPOCH.entities = '2026-09-18T00:00:00.000Z'
      MUTABLE_EPOCH.signals = '2026-09-18T00:00:00.000Z'
      process.env.ENTITIES_SEGMENT_CATCHUP_DISABLED = 'true'
      query.mockResolvedValue([{ id: 'acc-x', user_id: 'user-owner-1', collected_at: null }])

      const entitiesOutcome = await service.runSegmentCatchup('operator-1', 'entities')
      expect(entitiesOutcome).toEqual({ scanned: 0, launched: 0, failed: 0, cut: true })
      expect(enrichOrganigram).not.toHaveBeenCalled()

      const signalsOutcome = await service.runSegmentCatchup('operator-1', 'signals')
      expect(signalsOutcome.cut).toBe(false)
      expect(refreshResearch).toHaveBeenCalledWith('acc-x', 'user-owner-1')
    })

    it('un compte en échec sur un segment ne bloque pas les autres du même lot, et se compte à part', async () => {
      MUTABLE_EPOCH.strategy = '2026-09-18T00:00:00.000Z'
      query.mockResolvedValueOnce([
        { id: 'acc-strat-1', user_id: 'user-owner-1', collected_at: null },
        { id: 'acc-strat-2', user_id: 'user-owner-2', collected_at: null },
      ])
      replan
        .mockResolvedValueOnce(failure({ code: 'ia_failed', message: 'panne' }))
        .mockResolvedValueOnce(success({ replanned: true }))
      const outcome = await service.runSegmentCatchup('operator-1', 'strategy')
      expect(outcome).toEqual({ scanned: 2, launched: 1, failed: 1, cut: false })
    })

    /**
     * #2543.7 — LE TEST DE NON-RÉGRESSION QUI COMPTE VRAIMENT : une
     * correction humaine survit au rejeu.
     *
     * `runSegmentCatchup` n'écrit JAMAIS lui-même — pour chaque segment il
     * délègue à `AnalysisOnDemandService`, le MÊME chemin qu'un geste manuel
     * (« Enrichir la carte », « Actualiser », « Changer de stratégie »).
     * C'est ce qui hérite, SANS RIEN réécrire, les protections déjà
     * garanties et déjà testées à leur propre niveau :
     *  - entités : `enrichOrganigram` → `AnalysisPersistenceService.saveOrgChart`
     *    → `AccountsService.applyOrgChart`, qui rejoue `org_graph_corrections`
     *    (`replayOrgCorrections`) AVANT d'écrire le graphe frais ;
     *  - signaux : `refreshResearch` → `AccountsService.applyResearch`, dont
     *    « provenance — la correction humaine tient » (describe voisin de ce
     *    dépôt) prouve qu'un champ corrigé à la main n'entre JAMAIS dans le
     *    patch d'`UPDATE` ;
     *  - stratégie : `replan` → `AnalysisPersistenceService.savePlan` →
     *    `AccountsService.applyPlan`, dont la fusion JSONB (`||`) ne touche
     *    QUE la clé `plan` — `user_attack_angles`/`user_plan_actions` (écrits
     *    à la main) vivent sous d'autres clés du même blob et ne sont jamais
     *    dans l'opérande remplacée.
     *
     * Preuve ROUGE : si `SegmentCatchupService` appelait un jour une écriture
     * RAW (un `query(...)` direct, un appel à `applyOrgChart`/`applyResearch`/
     * `applyPlan` SANS passer par `AnalysisOnDemandService`), ces trois
     * assertions — DÉJÀ vraies pour chaque segment dans les tests ci-dessus —
     * échoueraient, parce qu'aucun mock `onDemand.*` n'aurait été atteint. Ce
     * test les regroupe pour que la garantie soit lisible EN UN SEUL ENDROIT.
     */
    it('chaque segment est rejoué par le MÊME chemin on-demand qu’un geste manuel — jamais une écriture qui contournerait une correction humaine', async () => {
      MUTABLE_EPOCH.entities = '2026-09-18T00:00:00.000Z'
      MUTABLE_EPOCH.signals = '2026-09-18T00:00:00.000Z'
      MUTABLE_EPOCH.strategy = '2026-09-18T00:00:00.000Z'

      query.mockResolvedValueOnce([{ id: 'acc-e', user_id: 'user-e', collected_at: null }])
      await service.runSegmentCatchup('operator-1', 'entities')
      query.mockResolvedValueOnce([{ id: 'acc-s', user_id: 'user-s', collected_at: null }])
      await service.runSegmentCatchup('operator-1', 'signals')
      query.mockResolvedValueOnce([{ id: 'acc-p', user_id: 'user-p', collected_at: null }])
      await service.runSegmentCatchup('operator-1', 'strategy')
      // #2118.51 — le cinquième segment, capacité RÉELLE (pas de mutation),
      // même chemin on-demand que strategy (`replan`), même garantie.
      query.mockResolvedValueOnce([{ id: 'acc-d', user_id: 'user-d', collected_at: null }])
      await service.runSegmentCatchup('operator-1', 'dossier_read')

      // Le SEUL point d'écriture atteint pour chaque segment est le chemin
      // on-demand PARTAGÉ avec le bouton manuel — jamais une méthode de
      // persistance directe (le service ne connaît même pas
      // `AnalysisPersistenceService`/`AccountsService`, voir son constructeur).
      expect(enrichOrganigram).toHaveBeenCalledWith('acc-e', 'user-e')
      expect(refreshResearch).toHaveBeenCalledWith('acc-s', 'user-s')
      expect(replan).toHaveBeenCalledWith('acc-p', 'user-p', undefined)
      expect(replan).toHaveBeenCalledWith('acc-d', 'user-d', undefined)
    })
  })

  // #2887.11 (Louis 16-17/10) — le rattrapage « partenaire actif » (#2371.4) ne vise QUE les comptes dont le SIREN
  // est celui d'un partenaire de l'espace qui porte des placements en cours. Jamais tout le parc.
  describe('listPartnerPlacementAccounts / runPartnerPlacementCatchup — #2887.11', () => {
    const CAPABILITY = segmentCapabilityAt('signals', '#2371.4') as string

    it('la capacité #2371.4 est bien inscrite : sa date est celle du critère, pas l’epoch du segment', () => {
      expect(CAPABILITY).toBeTruthy()
    })

    it('ne cible que les SIREN partenaires AVEC placements, dans le MÊME espace — et dit NON au reste du parc', async () => {
      await service.listPartnerPlacementAccounts()
      const sql = String(query.mock.calls[0][0])
      expect(sql).toMatch(/FROM partner_relations pr/)
      expect(sql).toMatch(/pr\.placements_active > 0/)
      expect(sql).toMatch(/pr\.workspace_id = accounts\.workspace_id/)
      expect(sql).toMatch(/pr\.siren = /)
      expect(sql).toMatch(/accounts\.siren IS NOT NULL/)
      // jamais le nom, jamais un rapprochement par homonymie
      expect(sql).not.toMatch(/company_name|ILIKE|similarity/i)
      // les espaces démo ne se rattrapent pas
      expect(sql).toMatch(/w\.is_demo = true/)
    })

    it('compare la collecte à la date de la capacité #2371.4 (doctrine : date de collecte contre date de capacité)', async () => {
      await service.listPartnerPlacementAccounts()
      expect(query.mock.calls[0][1][0]).toBe(CAPABILITY)
    })

    it('un compte collecté APRÈS la capacité n’est pas concerné ; avant ou jamais, si', async () => {
      query.mockResolvedValueOnce([
        { id: 'stale', user_id: 'u1', collected_at: null },
        { id: 'fresh', user_id: 'u2', collected_at: new Date(Date.parse(CAPABILITY) + 3600_000) },
      ])
      const rows = await service.listPartnerPlacementAccounts()
      expect(rows.map(r => r.id)).toEqual(['stale'])
    })

    it('le rejeu passe par le chemin du segment signaux, et seulement par lui', async () => {
      query.mockResolvedValueOnce([{ id: 'stale', user_id: 'u1', collected_at: null }])
      const outcome = await service.runPartnerPlacementCatchup('op', 50)
      expect(refreshResearch).toHaveBeenCalledWith('stale', 'u1')
      expect(enrichOrganigram).not.toHaveBeenCalled()
      expect(replan).not.toHaveBeenCalled()
      expect(outcome).toEqual({ scanned: 1, launched: 1, failed: 0, cut: false })
      expect(query.mock.calls[0][1][1]).toBe(50)
    })
  })

  // #4687 — l'historique interne lit la connexion de l'ESPACE ; le rattrapage ne touche que les espaces branchés.
  describe('rattrapage de l’historique interne — #4687', () => {
    const CAPABILITY = ATS_HISTORY_BY_WORKSPACE_CAPABILITY.at

    it('ne cible QUE les comptes d’un espace qui avait une connexion vivante à la collecte — jamais tout le parc', async () => {
      await service.listAtsHistoryAccounts()
      const sql = query.mock.calls[0][0] as string
      expect(sql).toMatch(/FROM ats_connections ac/)
      expect(sql).toMatch(/ac\.workspace_id = accounts\.workspace_id/)
      expect(sql).toMatch(/ac\.created_at <= COALESCE\(accounts\.signals_collected_at, accounts\.created_at\)/)
      expect(sql).toMatch(/ac\.auth_mode <> 'oauth2' OR ac\.access_token_enc IS NOT NULL/)
      // jamais décidé sur un symptôme, ni sur le nom du compte
      expect(sql).not.toMatch(/company_name|ILIKE|similarity|raw_analysis/i)
      expect(sql).toMatch(/w\.is_demo = true/)
    })

    it('décide sur la date de collecte du segment contre la date du correctif', async () => {
      await service.listAtsHistoryAccounts()
      expect(query.mock.calls[0][1][0]).toBe(CAPABILITY)
    })

    it('un compte collecté APRÈS le correctif n’est pas concerné ; avant ou jamais daté, si', async () => {
      query.mockResolvedValueOnce([
        { id: 'stale', user_id: 'u1', collected_at: new Date(Date.parse(CAPABILITY) - 3600_000) },
        { id: 'undated', user_id: 'u3', collected_at: null },
        { id: 'fresh', user_id: 'u2', collected_at: new Date(Date.parse(CAPABILITY) + 3600_000) },
      ])
      const rows = await service.listAtsHistoryAccounts()
      expect(rows.map(r => r.id)).toEqual(['stale', 'undated'])
    })

    it('le rejeu relit l’historique interne du segment signaux, et SEULEMENT lui', async () => {
      query.mockResolvedValueOnce([{ id: 'stale', user_id: 'u1', collected_at: null }])
      const outcome = await service.runAtsHistoryCatchup('op', 50)
      expect(refreshResearch).toHaveBeenCalledWith('stale', 'u1', { internalHistory: true })
      expect(enrichOrganigram).not.toHaveBeenCalled()
      expect(replan).not.toHaveBeenCalled()
      expect(enrichContacts).not.toHaveBeenCalled()
      expect(outcome).toEqual({ scanned: 1, launched: 1, failed: 0, cut: false })
      expect(query.mock.calls[0][1][1]).toBe(50)
    })

    it('REFUS : l’interrupteur du segment coupé n’exécute RIEN, même appelé explicitement', async () => {
      process.env.SIGNALS_SEGMENT_CATCHUP_DISABLED = 'true'
      const outcome = await service.runAtsHistoryCatchup('op')
      expect(outcome).toEqual({ scanned: 0, launched: 0, failed: 0, cut: true })
      expect(query).not.toHaveBeenCalled()
      expect(refreshResearch).not.toHaveBeenCalled()
    })

    it('un « Actualiser » ordinaire ne relit pas l’historique : le rejeu des autres rattrapages est inchangé', async () => {
      query.mockResolvedValueOnce([{ id: 'stale', user_id: 'u1', collected_at: null }])
      await service.runSubsidiaryCatchup('op')
      expect(refreshResearch).toHaveBeenCalledWith('stale', 'u1')
    })
  })

  // #4732 — un rachat / une fusion devient un fait de la fiche ET de la carte ; seuls les comptes qui en portent un sont rejoués.
  describe('rattrapage des rachats et fusions — #4732', () => {
    const CAPABILITY = MERGER_SIGNALS_CAPABILITY.at

    it('ne cible QUE les comptes dont le registre porte un acte de rapprochement des douze derniers mois — jamais tout le parc', async () => {
      await service.listMergerAccounts()
      const sql = query.mock.calls[0][0] as string
      expect(sql).toMatch(/FROM public_registry_announcements pra/)
      expect(sql).toMatch(/pra\.siren = accounts\.siren/)
      expect(sql).toMatch(/pra\.kind = 'sale'/)
      expect(sql).toMatch(/fusion\|absorption\|scission\|rachat\|apport partiel/)
      expect(sql).toMatch(/pra\.published_on >= now\(\) - interval '12 months'/)
      expect(sql).toMatch(/w\.is_demo = true/)
      // jamais décidé sur le nom du compte
      expect(sql).not.toMatch(/company_name|similarity/i)
    })

    it('décide sur la date de collecte du segment contre la date du correctif', async () => {
      await service.listMergerAccounts()
      expect(query.mock.calls[0][1][0]).toBe(CAPABILITY)
    })

    it('un compte collecté APRÈS le correctif n’est pas concerné ; avant ou jamais daté, si', async () => {
      query.mockResolvedValueOnce([
        { id: 'stale', user_id: 'u1', collected_at: new Date(Date.parse(CAPABILITY) - 3600_000) },
        { id: 'undated', user_id: 'u3', collected_at: null },
        { id: 'fresh', user_id: 'u2', collected_at: new Date(Date.parse(CAPABILITY) + 3600_000) },
      ])
      const rows = await service.listMergerAccounts()
      expect(rows.map(r => r.id)).toEqual(['stale', 'undated'])
    })

    it('le rejeu passe par le segment signaux, et SEULEMENT lui', async () => {
      query.mockResolvedValueOnce([{ id: 'stale', user_id: 'u1', collected_at: null }])
      const outcome = await service.runMergerCatchup('op', 50)
      expect(refreshResearch).toHaveBeenCalledWith('stale', 'u1')
      expect(enrichOrganigram).not.toHaveBeenCalled()
      expect(replan).not.toHaveBeenCalled()
      expect(enrichContacts).not.toHaveBeenCalled()
      expect(outcome).toEqual({ scanned: 1, launched: 1, failed: 0, cut: false })
      expect(query.mock.calls[0][1][1]).toBe(50)
    })

    it('REFUS : l’interrupteur du segment coupé n’exécute RIEN, même appelé explicitement', async () => {
      process.env.SIGNALS_SEGMENT_CATCHUP_DISABLED = 'true'
      const outcome = await service.runMergerCatchup('op')
      expect(outcome).toEqual({ scanned: 0, launched: 0, failed: 0, cut: true })
      expect(query).not.toHaveBeenCalled()
      expect(refreshResearch).not.toHaveBeenCalled()
    })
  })
})
