import type {
  AnalysisContactSeed,
  AnalysisEnrichedContact,
  AnalysisPlanData,
  AnalysisResearchData,
} from '@bellum/contracts'
import type { DataSource } from 'typeorm'
import { AnalysisPersistenceService } from './analysis.persistence'
import { ActionPlansService } from './action-plans.service'
import { AnalysisEventEmitter } from './analysis-event-emitter.service'
import { AccountVocabularyService } from './account-vocabulary.service'
import { AttackAnglesService } from './attack-angles.service'
import { AccountsService } from '../accounts/accounts.service'
import { ContactsService } from '../contacts/contacts.service'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { ProjectsService } from '../projects/projects.service'
import { SignalHistoryService } from '../signal-history/signal-history.service'
import { ProvenanceService } from '../crm-core/provenance.service'

type ServiceMock<T> = { [K in keyof T]: jest.Mock }

function makeResearch(overrides: Partial<AnalysisResearchData> = {}): AnalysisResearchData {
  return {
    sector: '',
    employees: '',
    revenue: '',
    headquarters: '',
    website: '',
    subsidiaries: [],
    itChallenges: [],
    recentSignals: [],
    priorityScore: 0,
    priorityJustification: '',
    angles: [],
    ...overrides,
  }
}

function makeContact(overrides: Partial<AnalysisContactSeed> = {}): AnalysisContactSeed {
  return {
    fullName: '',
    title: '',
    linkedinUrl: '',
    city: '',
    country: '',
    source: 'apollo',
    ...overrides,
  }
}

function makeEnriched(overrides: Partial<AnalysisEnrichedContact> = {}): AnalysisEnrichedContact {
  return {
    fullName: '',
    entity: '',
    role: 'unknown',
    priority: 3,
    summary: '',
    whyContact: '',
    email: '',
    phone: '',
    emailVerified: false,
    ...overrides,
  }
}

describe('AnalysisPersistenceService', () => {
  let service: AnalysisPersistenceService
  let accounts: ServiceMock<
    Pick<
      AccountsService,
      | 'applyResearch'
      | 'groupAffiliationFor'
      | 'applyPlan'
      | 'markCompleted'
      | 'markErrored'
      | 'applyContactsOutOfScope'
      | 'getPriorityScore'
      | 'applyContactsCollectedAt'
      | 'applyOrgChart'
      | 'applyEntitiesCollectedAt'
      | 'applyStrategyCollectedAt'
      | 'applyDossierReadCollectedAt'
    >
  >
  let contacts: ServiceMock<Pick<ContactsService, 'bulkInsert' | 'applyEnrichment' | 'prepareBulkInsert'>>
  let attackAngles: ServiceMock<Pick<AttackAnglesService, 'bulkInsert'>>
  let vocabulary: ServiceMock<Pick<AccountVocabularyService, 'saveVocabulary'>>
  let actionPlans: ServiceMock<Pick<ActionPlansService, 'create'>>
  let workspaceContext: ServiceMock<Pick<WorkspaceContextService, 'resolveActiveWorkspace'>>
  let opportunities: ServiceMock<Pick<ProjectsService, 'materialize' | 'fillClassifiedDomains'>>
  let signalHistory: ServiceMock<Pick<SignalHistoryService, 'materialize'>>
  let provenance: ServiceMock<Pick<ProvenanceService, 'commit'>>
  let userActionInsert: jest.Mock
  let dataSourceQuery: jest.Mock

  beforeEach(() => {
    accounts = {
      applyResearch: jest.fn().mockResolvedValue(undefined),
      groupAffiliationFor: jest.fn().mockResolvedValue(null),
      applyPlan: jest.fn().mockResolvedValue(undefined),
      markCompleted: jest.fn().mockResolvedValue(undefined),
      markErrored: jest.fn().mockResolvedValue(undefined),
      applyContactsOutOfScope: jest.fn().mockResolvedValue(undefined),
      // Default: never scored before → savePlan can't journal a movement (§8),
      // so the existing savePlan cases stay byte-clean. Tests that exercise a
      // score change override this per-case.
      getPriorityScore: jest.fn().mockResolvedValue(null),
      applyContactsCollectedAt: jest.fn().mockResolvedValue(undefined),
      applyOrgChart: jest.fn().mockResolvedValue(undefined),
      applyEntitiesCollectedAt: jest.fn().mockResolvedValue(undefined),
      applyStrategyCollectedAt: jest.fn().mockResolvedValue(undefined),
      applyDossierReadCollectedAt: jest.fn().mockResolvedValue(undefined),
    }
    contacts = {
      bulkInsert: jest.fn().mockResolvedValue([]),
      applyEnrichment: jest.fn().mockResolvedValue(0),
      prepareBulkInsert: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', erased: new Set<string>() }),
    }
    attackAngles = { bulkInsert: jest.fn().mockResolvedValue(undefined) }
    vocabulary = { saveVocabulary: jest.fn().mockResolvedValue(0) }
    actionPlans = { create: jest.fn().mockResolvedValue(undefined) }
    // Multi-user Phase 2: the pipeline resolves the run owner's active workspace
    // (1 user = 1 workspace today) and stamps it onto every row it writes.
    workspaceContext = {
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'owner' }),
    }
    // Stub ``dataSource.transaction(fn)`` so each save method invokes its
    // callback with a no-op EntityManager. The lower-level mocks ignore
    // the manager arg anyway, so the unit test stays focused on the
    // delegation contract, not on the TX wiring.
    userActionInsert = jest.fn().mockResolvedValue(undefined)
    // #2306.15 — la lecture best-effort de `analysis_runs.profile_provenance`
    // (SELECT brut, pas de repo dédié) pour poser `esn_profile_version` sur le
    // bloc `dossier_read` avant persistance. Défaut : « aucun run trouvé ».
    dataSourceQuery = jest.fn().mockResolvedValue([])
    const dataSource = {
      transaction: <T>(fn: (em: unknown) => Promise<T>) => fn({}),
      getRepository: () => ({ insert: userActionInsert }),
      query: dataSourceQuery,
    } as unknown as DataSource
    const events = { phaseCompleted: jest.fn().mockResolvedValue(undefined) } as unknown as AnalysisEventEmitter
    opportunities = {
      materialize: jest.fn().mockResolvedValue(undefined),
      fillClassifiedDomains: jest.fn().mockResolvedValue(undefined),
    }
    signalHistory = { materialize: jest.fn().mockResolvedValue(undefined) }
    provenance = { commit: jest.fn().mockResolvedValue(undefined) }
    service = new AnalysisPersistenceService(
      dataSource,
      accounts as unknown as AccountsService,
      contacts as unknown as ContactsService,
      attackAngles as unknown as AttackAnglesService,
      vocabulary as unknown as AccountVocabularyService,
      actionPlans as unknown as ActionPlansService,
      events,
      workspaceContext as unknown as WorkspaceContextService,
      opportunities as unknown as ProjectsService,
      signalHistory as unknown as SignalHistoryService,
      provenance as unknown as ProvenanceService,
    )
  })

  // #3978 — le rejeu de recherche (« Actualiser », veille, rattrapage du segment `signals`)
  // reclasse pains/enjeux/signaux dans `raw_analysis` : cette porte ne fait QUE remplir le
  // domaine manquant des pistes existantes — jamais `materialize()`, qui en créerait.
  describe('refreshOpportunityDomains (#3978)', () => {
    it('délègue au seul remplissage du domaine, jamais à la matérialisation complète', async () => {
      await service.refreshOpportunityDomains('acc-1')
      expect(opportunities.fillClassifiedDomains).toHaveBeenCalledWith('acc-1')
      expect(opportunities.materialize).not.toHaveBeenCalled()
    })
  })

  describe('saveResearch', () => {
    // LUDOVIC-D LC.2 — l'APPELANT : l'angle d'un homonyme n'atteint pas `attack_angles`.
    it('LC.2 — n’insère pas l’angle d’un homonyme (Still Waters Farm sur STILL)', async () => {
      const data = makeResearch({
        website: 'https://www.still.fr',
        recentSignals: [{ signal: 'Still Waters Farm opens a barn', url: 'https://stillwatersfarm.com/n' }],
        angles: [
          { title: 'Audit chez Still Waters Farm', description: '', strategy: '', entry_contact_persona: '' },
          { title: 'Renfort méthodes à Lyon', description: '', strategy: '', entry_contact_persona: '' },
        ],
      } as never)
      await service.saveResearch('acc-1', 'user-1', data)
      const inserted = attackAngles.bulkInsert.mock.calls[0]?.[3] as Array<{ title: string }>
      expect(inserted.map(angle => angle.title)).toEqual(['Renfort méthodes à Lyon'])
    })

    it('delegates to AccountsService.applyResearch and AttackAnglesService.bulkInsert', async () => {
      const data = makeResearch({
        sector: 'Transport',
        angles: [
          { title: 'Cloud', description: '', strategy: '', entry_contact_persona: '' },
          { title: 'Data', description: '', strategy: '', entry_contact_persona: '' },
        ],
      })
      await service.saveResearch('acc-1', 'user-1', data)

      // Trailing ``expect.anything()`` matches the ``manager`` arg threaded
      // through the TX wrapper. We don't assert on its shape (the test
      // stubs it to ``{}``); the contract under test is the delegation.
      // #2671 — le `workspaceId` déjà résolu (``ws-1``) voyage jusqu'aux deux
      // lectures internes scopées d'`applyResearch`.
      // #4616 — l'affiliation est lue AVANT la transaction et voyage en option (ici : rien d'exploitable).
      expect(accounts.groupAffiliationFor).toHaveBeenCalledWith(data.siren)
      expect(accounts.applyResearch).toHaveBeenCalledWith('acc-1', data, expect.anything(), {
        workspaceId: 'ws-1',
        groupAffiliation: null,
      })
      // Multi-user Phase 2: the resolved workspace id (``ws-1``) is threaded to
      // the attack_angles + account_vocabulary writes; ``user-1`` stays as
      // created-by attribution.
      expect(workspaceContext.resolveActiveWorkspace).toHaveBeenCalledWith('user-1')
      expect(attackAngles.bulkInsert).toHaveBeenCalledWith('acc-1', 'user-1', 'ws-1', data.angles, expect.anything())
      expect(vocabulary.saveVocabulary).toHaveBeenCalledWith(
        'acc-1',
        'user-1',
        'ws-1',
        data.accountVocabulary,
        expect.anything(),
      )
    })

    it('passes an empty array when angles is empty', async () => {
      await service.saveResearch('acc-1', 'user-1', makeResearch({ sector: 'Transport' }))
      expect(attackAngles.bulkInsert).toHaveBeenCalledWith('acc-1', 'user-1', 'ws-1', [], expect.anything())
    })

    it('no-ops on undefined data', async () => {
      await service.saveResearch('acc-1', 'user-1', undefined)
      expect(accounts.applyResearch).not.toHaveBeenCalled()
      expect(attackAngles.bulkInsert).not.toHaveBeenCalled()
    })

    // V2 §11 — les signaux viennent d'être réécrits : c'est le moment (et le
    // seul) où l'on peut dater une première détection et constater une
    // disparition. Rien à historiser quand la phase n'a rien persisté.
    it('materializes the signal history once the research blob is persisted', async () => {
      await service.saveResearch('acc-1', 'user-1', makeResearch({ sector: 'Transport' }))
      expect(signalHistory.materialize).toHaveBeenCalledWith('acc-1')
    })

    it('does not materialize the signal history when there is nothing to persist', async () => {
      await service.saveResearch('acc-1', 'user-1', undefined)
      expect(signalHistory.materialize).not.toHaveBeenCalled()
    })

    // #3219 (#190.2, lot P02 07/10) — le premier écrivain RÉEL de `scope` :
    // `applyResearch` REND la claim (calcul pur, `AccountsService` ne peut pas
    // joindre `ProvenanceService` sans lever GA-07), cette façade la COMMIT.
    describe('la claim de portée (#3219) — journalisée via ProvenanceService', () => {
      it('commit la claim quand applyResearch en rend une', async () => {
        accounts.applyResearch.mockResolvedValueOnce({
          employeesScopeClaim: { oldValue: '500 000', newValue: '12', scope: 'Business unit' },
        })
        await service.saveResearch('acc-1', 'user-1', makeResearch({ employees: '12', scopeMode: 'business_unit' }))
        expect(provenance.commit).toHaveBeenCalledWith({
          workspaceId: 'ws-1',
          entityType: 'account',
          entityId: 'acc-1',
          source: 'pipeline',
          actorId: null,
          changes: [{ field: 'employees', oldValue: '500 000', newValue: '12', scope: 'Business unit' }],
        })
      })

      it('ne commit rien quand applyResearch ne rend aucune claim (cas par défaut, sans scopeMode)', async () => {
        await service.saveResearch('acc-1', 'user-1', makeResearch({ sector: 'Transport' }))
        expect(provenance.commit).not.toHaveBeenCalled()
      })

      it('un échec du commit ne fait jamais échouer la sauvegarde de la recherche (best-effort, comme signalHistory)', async () => {
        accounts.applyResearch.mockResolvedValueOnce({
          employeesScopeClaim: { oldValue: null, newValue: '12', scope: 'Business unit' },
        })
        provenance.commit.mockRejectedValueOnce(new Error('journal indisponible'))
        await expect(
          service.saveResearch('acc-1', 'user-1', makeResearch({ employees: '12', scopeMode: 'business_unit' })),
        ).resolves.not.toThrow()
      })

      it('sans ProvenanceService câblé (constructeur nu), ne casse rien', async () => {
        const bareService = new AnalysisPersistenceService(
          {
            transaction: <T>(fn: (em: unknown) => Promise<T>) => fn({}),
            getRepository: () => ({ insert: jest.fn() }),
          } as never,
          accounts as unknown as AccountsService,
          contacts as unknown as ContactsService,
          attackAngles as unknown as AttackAnglesService,
          vocabulary as unknown as AccountVocabularyService,
          actionPlans as unknown as ActionPlansService,
          { phaseCompleted: jest.fn().mockResolvedValue(undefined) } as never,
          workspaceContext as unknown as WorkspaceContextService,
          opportunities as unknown as ProjectsService,
          signalHistory as unknown as SignalHistoryService,
        )
        accounts.applyResearch.mockResolvedValueOnce({
          employeesScopeClaim: { oldValue: null, newValue: '12', scope: 'Business unit' },
        })
        await expect(
          bareService.saveResearch('acc-1', 'user-1', makeResearch({ employees: '12', scopeMode: 'business_unit' })),
        ).resolves.not.toThrow()
      })
    })
  })

  describe('saveContacts', () => {
    // #4616 — l'espace et les empreintes effacées se lisent AVANT la transaction : lus dedans, ils prenaient
    // une deuxième connexion du pool pendant que la transaction tenait la première.
    it("#4616 — prépare l'insertion AVANT d'ouvrir la transaction, et la passe aux deux insertions", async () => {
      const order: string[] = []
      contacts.prepareBulkInsert.mockImplementation(async () => {
        order.push('prepare')
        return { workspaceId: 'ws-1', erased: new Set<string>() }
      })
      contacts.bulkInsert.mockImplementation(async () => {
        order.push('insert')
        return []
      })
      await service.saveContacts('acc-1', 'user-1', [makeContact({ fullName: 'Jean Dupont' })])
      expect(contacts.prepareBulkInsert).toHaveBeenCalledWith('user-1')
      expect(order[0]).toBe('prepare')
    })

    it('delegates to ContactsService.bulkInsert', async () => {
      const items = [makeContact({ fullName: 'Jean Dupont', title: 'CTO' })]
      await service.saveContacts('acc-1', 'user-1', items)
      expect(contacts.bulkInsert).toHaveBeenCalledWith('acc-1', 'user-1', items, expect.anything(), {
        workspaceId: 'ws-1',
        erased: new Set<string>(),
      })
    })

    it('forwards an empty list when items is undefined', async () => {
      await service.saveContacts('acc-1', 'user-1', undefined)
      expect(contacts.bulkInsert).toHaveBeenCalledWith('acc-1', 'user-1', [], expect.anything(), {
        workspaceId: 'ws-1',
        erased: new Set<string>(),
      })
    })

    // #AF.2 — `contacts_collected_at` est la date que le ciblage du rattrapage
    // (#2543) compare à la capacité. Elle doit être stampée à CHAQUE collecte
    // réelle, pipeline complet COMME rafraîchissement ciblé (les deux appellent
    // `saveContacts`) — jamais seulement quand un `ctx` de phase est fourni,
    // sinon un rafraîchissement on-demand (sans `ctx`) resterait non daté.
    it('stampe contacts_collected_at à chaque collecte, même sans contexte de phase (rafraîchissement ciblé)', async () => {
      await service.saveContacts('acc-1', 'user-1', [makeContact({ fullName: 'Jean Dupont' })])
      expect(accounts.applyContactsCollectedAt).toHaveBeenCalledWith('acc-1', expect.any(Date), expect.anything())
    })

    it('stampe aussi sur une collecte qui ne trouve RIEN — « on a regardé » reste une mesure', async () => {
      await service.saveContacts('acc-1', 'user-1', undefined)
      expect(accounts.applyContactsCollectedAt).toHaveBeenCalledWith('acc-1', expect.any(Date), expect.anything())
    })

    // #3989 (Louis 11/10/2026, c94) — un compte DÉJÀ connu de la base commune en
    // profite : ses faits publics nommés arrivent en seeds `shared_base`, APRÈS
    // la collecte de l'espace (une personne que l'espace a trouvée garde sa
    // propre source), par la MÊME porte (`bulkInsert` : effacements de l'espace
    // refusés, corrections humaines protégées, aucun débit).
    it('#3989 — recopie les faits de la base commune pour la société du compte, après la collecte de l’espace', async () => {
      dataSourceQuery.mockImplementation(async (sql: string) => {
        if (/FROM accounts a/.test(sql)) return [{ siren: '552120222', website: null, is_demo: false }]
        if (/FROM shared_company_people/.test(sql))
          // #4286.15.b — une personne ACTUELLE, revue récemment : seule recopiée.
          return [
            {
              id: 'f-1',
              full_name: 'Claire Perrin',
              title: 'DSI',
              linkedin_url: null,
              employment_state: 'current',
              last_seen_at: new Date().toISOString(),
            },
          ]
        return []
      })
      contacts.bulkInsert.mockResolvedValueOnce([{ id: 'own' }]).mockResolvedValueOnce([{ id: 'copy' }])
      const items = [makeContact({ fullName: 'Jean Dupont' })]
      const created = await service.saveContacts('acc-1', 'user-1', items)
      expect(contacts.bulkInsert).toHaveBeenNthCalledWith(1, 'acc-1', 'user-1', items, expect.anything(), {
        workspaceId: 'ws-1',
        erased: new Set<string>(),
      })
      expect(contacts.bulkInsert).toHaveBeenNthCalledWith(
        2,
        'acc-1',
        'user-1',
        [expect.objectContaining({ fullName: 'Claire Perrin', source: 'shared_base', sharedFactId: 'f-1' })],
        expect.anything(),
        { workspaceId: 'ws-1', erased: new Set<string>() },
      )
      expect(created).toBe(2)
    })

    it('#3989 — sait dire NON : une société inconnue (sans SIREN ni site) ne lit rien de la base commune', async () => {
      dataSourceQuery.mockImplementation(async (sql: string) =>
        /FROM accounts a/.test(sql) ? [{ siren: null, website: null, is_demo: false }] : [],
      )
      await service.saveContacts('acc-1', 'user-1', [makeContact({ fullName: 'Jean Dupont' })])
      expect(contacts.bulkInsert).toHaveBeenCalledTimes(1)
      expect(dataSourceQuery.mock.calls.some(([sql]) => /shared_company_people/.test(sql as string))).toBe(false)
    })

    it('#3989 — une base commune en panne ne casse jamais la collecte de l’espace', async () => {
      dataSourceQuery.mockRejectedValue(new Error('panne'))
      await expect(service.saveContacts('acc-1', 'user-1', [makeContact({ fullName: 'Jean Dupont' })])).resolves.toBe(0)
      expect(contacts.bulkInsert).toHaveBeenCalledTimes(1)
    })
  })

  describe('saveContactsOutOfScope', () => {
    // « X écartés (hors périmètre) » : le commercial doit VOIR pourquoi le stock a
    // rétréci. Le bloc est propre à une analyse → il vit sur raw_analysis.
    it('persists the count and the entities behind it', async () => {
      const block = { dropped: 2, entities: [{ name: 'SGTM', count: 2 }] }
      await service.saveContactsOutOfScope('acc-1', block)
      expect(accounts.applyContactsOutOfScope).toHaveBeenCalledWith('acc-1', block)
    })

    it('writes nothing when nothing was dropped', async () => {
      // Un « 0 écarté » sur le dossier serait plus trompeur que rien : il ferait
      // croire que le périmètre a été vérifié alors qu'il n'a rien filtré.
      await service.saveContactsOutOfScope('acc-1', { dropped: 0, entities: [] })
      expect(accounts.applyContactsOutOfScope).not.toHaveBeenCalled()
    })

    it('writes nothing for an older IA deploy that does not send the block', async () => {
      await service.saveContactsOutOfScope('acc-1', undefined)
      expect(accounts.applyContactsOutOfScope).not.toHaveBeenCalled()
    })

    it('ignores a malformed block instead of corrupting the dossier', async () => {
      await service.saveContactsOutOfScope('acc-1', { dropped: 'beaucoup' })
      expect(accounts.applyContactsOutOfScope).not.toHaveBeenCalled()
    })
  })

  describe('saveOrgChart', () => {
    // #2543.7 — `entities_collected_at` est la date que le ciblage du
    // rattrapage (#2543) comparera à une future capacité datée sur le segment
    // entités. Elle doit être stampée à CHAQUE graphe réellement écrit,
    // pipeline complet COMME « Enrichir organigramme » (les deux appellent
    // `saveOrgChart`) — miroir exact de `applyContactsCollectedAt`.
    it('stampe entities_collected_at quand un graphe est réellement écrit', async () => {
      await service.saveOrgChart('acc-1', { orgGraph: { decisionChain: [] } })
      expect(accounts.applyOrgChart).toHaveBeenCalled()
      expect(accounts.applyEntitiesCollectedAt).toHaveBeenCalledWith('acc-1', expect.any(Date))
    })

    it("ne stampe rien sur un graphe vide — aucune collecte n'a eu lieu", async () => {
      await service.saveOrgChart('acc-1', undefined)
      expect(accounts.applyOrgChart).not.toHaveBeenCalled()
      expect(accounts.applyEntitiesCollectedAt).not.toHaveBeenCalled()
    })

    it('ne stampe rien sur un objet graphe vide ({})', async () => {
      await service.saveOrgChart('acc-1', {})
      expect(accounts.applyEntitiesCollectedAt).not.toHaveBeenCalled()
    })

    // #2755 — l'appelant (`enrichOrganigram`) doit savoir si l'assemblage a
    // RÉELLEMENT écrit un graphe, pour ne jamais dire « organigramme mis à
    // jour » sur un no-op silencieux (Louis, beta 23/09 : « il n'y avait pas
    // d'organigramme alors que c'est obligatoire » — après un clic
    // « Enrichir la carte » qui a semblé réussir).
    it('#2755 — renvoie true quand un graphe est réellement écrit', async () => {
      await expect(service.saveOrgChart('acc-1', { orgGraph: { decisionChain: [] } })).resolves.toBe(true)
    })

    it('#2755 — renvoie false sur `undefined` (assemblage IA en échec)', async () => {
      await expect(service.saveOrgChart('acc-1', undefined)).resolves.toBe(false)
    })

    it('#2755 — renvoie false sur un objet graphe vide ({})', async () => {
      await expect(service.saveOrgChart('acc-1', {})).resolves.toBe(false)
    })
  })

  describe('saveEnriched', () => {
    it('delegates to ContactsService.applyEnrichment', async () => {
      const items = [makeEnriched({ fullName: 'Jean Dupont', email: 'j@x.fr' })]
      contacts.applyEnrichment.mockResolvedValueOnce(1)
      await service.saveEnriched('acc-1', items)
      expect(contacts.applyEnrichment).toHaveBeenCalledWith('acc-1', items, expect.anything(), undefined)
    })

    it('transmet le périmètre DÉCLARÉ du run (#3219), tel quel', async () => {
      const items = [makeEnriched({ fullName: 'Jean Dupont', email: 'j@x.fr' })]
      contacts.applyEnrichment.mockResolvedValueOnce(1)
      await service.saveEnriched('acc-1', items, undefined, 'filiales')
      expect(contacts.applyEnrichment).toHaveBeenCalledWith('acc-1', items, expect.anything(), 'filiales')
    })

    it('skips applyEnrichment on empty list but still wraps the call', async () => {
      // Behaviour change vs pre-refactor: the empty path used to early-
      // return entirely. Now it still opens a TX so a checkpoint event
      // would be emitted if a caller passed ``ctx`` — but ``applyEnrichment``
      // is correctly skipped because there's nothing to update.
      await service.saveEnriched('acc-1', [])
      expect(contacts.applyEnrichment).not.toHaveBeenCalled()
    })
  })

  describe('savePlan', () => {
    it('creates the action plan and marks the account completed', async () => {
      const ap = { strategy: 'Bottom-up', justification: 'Quick wins', phases: [] }
      await service.savePlan('acc-1', 'user-1', { actionPlan: ap })

      // Multi-user Phase 2: workspace id resolved from the owner and threaded in.
      expect(workspaceContext.resolveActiveWorkspace).toHaveBeenCalledWith('user-1')
      expect(actionPlans.create).toHaveBeenCalledWith('acc-1', 'user-1', 'ws-1', ap, expect.anything())
      expect(accounts.markCompleted).toHaveBeenCalledWith('acc-1', expect.anything())
    })

    it('merges the full plan into raw_analysis so the Plan tab populates', async () => {
      // The Plan tab reads ``account.raw_analysis.plan`` (actionPlan +
      // evaluation + offersToPropose + messages). Persisting only to the
      // ``action_plans`` table left the tab blank — the plan must also land
      // on the account's JSONB blob, unmodified (camelCase, full payload).
      const data = {
        actionPlan: { strategy: 'Bottom-up', justification: 'Quick wins', phases: [] },
        evaluation: { goNoGo: 'GO', globalScore: 8 },
        offersToPropose: [{ title: 'TMA', pitch: '...' }],
      } as unknown as AnalysisPlanData
      await service.savePlan('acc-1', 'user-1', data)

      expect(accounts.applyPlan).toHaveBeenCalledWith('acc-1', data, expect.anything())
    })

    // #2543.7 — `strategy_collected_at` est la date que le ciblage du
    // rattrapage (#2543) comparera à une future capacité datée sur le segment
    // stratégie. Stampée à CHAQUE plan réellement écrit, pipeline complet
    // COMME « Changer de stratégie » (les deux appellent `savePlan`) — miroir
    // exact de `applyContactsCollectedAt`.
    it('stampe strategy_collected_at quand un plan est réellement écrit', async () => {
      await service.savePlan('acc-1', 'user-1', {
        actionPlan: { strategy: 'Bottom-up', justification: '', phases: [] },
      })
      expect(accounts.applyStrategyCollectedAt).toHaveBeenCalledWith('acc-1', expect.any(Date), expect.anything())
    })

    // #2118.51 — `dossier_read_collected_at` est la date que le ciblage du
    // CINQUIÈME segment (#2118.51) comparera à `SEGMENT_CAPABILITY_EPOCH
    // .dossier_read`. Stampée au MÊME point que `strategy_collected_at` :
    // c'est le seul endroit où Phase 4 écrit réellement
    // `evaluation.dossier_read`.
    it('stampe dossier_read_collected_at quand un plan est réellement écrit', async () => {
      await service.savePlan('acc-1', 'user-1', {
        actionPlan: { strategy: 'Bottom-up', justification: '', phases: [] },
      })
      expect(accounts.applyDossierReadCollectedAt).toHaveBeenCalledWith('acc-1', expect.any(Date), expect.anything())
    })

    // LOIC-FIX O.1 — une étape non faite ne se déclare jamais faite : un plan qui
    // arrive SANS messages (étape « messages » interrompue ou dégradée) le dit
    // dans le dossier, au lieu de laisser « Terminé » le taire.
    it('LOIC-FIX O.1 — marque messagesStatus=missing quand le plan arrive sans aucun message', async () => {
      const data = {
        actionPlan: { strategy: 'Bottom-up', justification: '', phases: [] },
      } as unknown as AnalysisPlanData
      await service.savePlan('acc-1', 'user-1', data)
      expect(accounts.applyPlan).toHaveBeenCalledWith(
        'acc-1',
        expect.objectContaining({ messagesStatus: 'missing' }),
        expect.anything(),
      )
    })

    it('LOIC-FIX O.1 — sait dire NON : des messages livrés ne laissent aucune marque « missing »', async () => {
      const data = {
        actionPlan: { strategy: 'Bottom-up', justification: '', phases: [] },
        contactMessages: [{ contactName: 'Claire Dupuis', emailBody: 'Bonjour' }],
      } as unknown as AnalysisPlanData
      ;(contacts as unknown as { applyMessages: jest.Mock }).applyMessages = jest.fn().mockResolvedValue(1)
      await service.savePlan('acc-1', 'user-1', data)
      const applied = accounts.applyPlan.mock.calls[0]?.[1] as Record<string, unknown>
      expect(applied['messagesStatus']).toBeUndefined()
    })

    it('still marks completed when data is undefined', async () => {
      await service.savePlan('acc-1', 'user-1', undefined)
      expect(actionPlans.create).not.toHaveBeenCalled()
      expect(accounts.applyPlan).not.toHaveBeenCalled()
      expect(accounts.applyStrategyCollectedAt).not.toHaveBeenCalled()
      expect(accounts.applyDossierReadCollectedAt).not.toHaveBeenCalled()
      expect(accounts.markCompleted).toHaveBeenCalledWith('acc-1', expect.anything())
    })

    it('records an analysis_completed activity row scoped to the owner workspace', async () => {
      await service.savePlan('acc-1', 'user-1', undefined)
      expect(userActionInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-1',
          workspace_id: 'ws-1',
          account_id: 'acc-1',
          action_type: 'analysis_completed',
        }),
      )
    })

    // §8 « Historique » : le score n'était jamais tracé. Il l'est maintenant,
    // mais UNIQUEMENT sur un mouvement réel.
    it('journalise un CHANGEMENT de score (avant ≠ après) avec le sens du mouvement', async () => {
      accounts.getPriorityScore.mockResolvedValueOnce(6)
      await service.savePlan('acc-1', 'user-1', { priorityScore: 8 } as unknown as AnalysisPlanData)

      // #2671 — la lecture du score porte désormais sa borne d'espace.
      expect(accounts.getPriorityScore).toHaveBeenCalledWith('acc-1', 'ws-1')
      expect(userActionInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-1',
          workspace_id: 'ws-1',
          account_id: 'acc-1',
          action_type: 'account_score_changed',
          metadata: expect.objectContaining({ from: 6, to: 8, detail: '6 → 8' }),
        }),
      )
    })

    it('n’émet AUCUN account_score_changed quand le score ne bouge pas', async () => {
      accounts.getPriorityScore.mockResolvedValueOnce(7)
      await service.savePlan('acc-1', 'user-1', { priorityScore: 7 } as unknown as AnalysisPlanData)

      expect(userActionInsert).not.toHaveBeenCalledWith(
        expect.objectContaining({ action_type: 'account_score_changed' }),
      )
    })

    it('n’émet AUCUN account_score_changed pour un PREMIER score (aucun précédent)', async () => {
      accounts.getPriorityScore.mockResolvedValueOnce(null)
      await service.savePlan('acc-1', 'user-1', { priorityScore: 8 } as unknown as AnalysisPlanData)

      expect(userActionInsert).not.toHaveBeenCalledWith(
        expect.objectContaining({ action_type: 'account_score_changed' }),
      )
    })

    // #2306.15 — la version du profil ESN qui a conditionné CE run vivait déjà
    // sur `analysis_runs.profile_provenance` (recette finale §13), mais pas
    // sur le bloc `dossier_read` lui-même : un score consulté loin de son run
    // n'avait aucun moyen de dire avec quel profil il avait été lu.
    it('attache la version du profil ESN du run au bloc dossier_read avant persistance', async () => {
      dataSourceQuery.mockResolvedValueOnce([{ profile_provenance: { esnProfileVersion: 4 } }])
      const data = {
        evaluation: { score: 17, dossier_read: { why_for_your_esn: 'Pour ton offre data.' } },
      } as unknown as AnalysisPlanData
      await service.savePlan('acc-1', 'user-1', data)

      expect(dataSourceQuery).toHaveBeenCalledWith(expect.stringContaining('analysis_runs'), ['acc-1'])
      expect(accounts.applyPlan).toHaveBeenCalledWith(
        'acc-1',
        expect.objectContaining({
          evaluation: expect.objectContaining({
            dossier_read: expect.objectContaining({ esn_profile_version: 4 }),
          }),
        }),
        expect.anything(),
      )
    })

    it('pose `esn_profile_version: null` quand aucun run ne porte encore de provenance', async () => {
      dataSourceQuery.mockResolvedValueOnce([])
      const data = { evaluation: { dossier_read: { why_for_your_esn: 'x' } } } as unknown as AnalysisPlanData
      await service.savePlan('acc-1', 'user-1', data)

      expect(accounts.applyPlan).toHaveBeenCalledWith(
        'acc-1',
        expect.objectContaining({
          evaluation: expect.objectContaining({ dossier_read: expect.objectContaining({ esn_profile_version: null }) }),
        }),
        expect.anything(),
      )
    })

    it("n'invente pas de bloc dossier_read quand le plan n'en a pas", async () => {
      dataSourceQuery.mockResolvedValueOnce([{ profile_provenance: { esnProfileVersion: 4 } }])
      const data = { evaluation: { score: 17 } } as unknown as AnalysisPlanData
      await service.savePlan('acc-1', 'user-1', data)

      expect(accounts.applyPlan).toHaveBeenCalledWith(
        'acc-1',
        expect.objectContaining({ evaluation: expect.not.objectContaining({ dossier_read: expect.anything() }) }),
        expect.anything(),
      )
    })

    it('un échec de lecture de la provenance ne fait jamais échouer le plan', async () => {
      dataSourceQuery.mockRejectedValueOnce(new Error('db down'))
      const data = { evaluation: { dossier_read: { why_for_your_esn: 'x' } } } as unknown as AnalysisPlanData
      await expect(service.savePlan('acc-1', 'user-1', data)).resolves.toBeUndefined()
      expect(accounts.applyPlan).toHaveBeenCalled()
    })

    it('un échec du journal de score ne fait jamais échouer le plan', async () => {
      accounts.getPriorityScore.mockResolvedValueOnce(6)
      userActionInsert.mockImplementation((row: { action_type?: string }) => {
        if (row.action_type === 'account_score_changed') return Promise.reject(new Error('db down'))
        return Promise.resolve(undefined)
      })
      await expect(
        service.savePlan('acc-1', 'user-1', { priorityScore: 8 } as unknown as AnalysisPlanData),
      ).resolves.toBeUndefined()
    })
  })

  describe('recordAnalysisStarted', () => {
    it('inserts an analysis_started row, reusing a caller-supplied workspace (no extra lookup)', async () => {
      await service.recordAnalysisStarted('acc-4', 'user-4', 'ws-explicit')
      expect(workspaceContext.resolveActiveWorkspace).not.toHaveBeenCalled()
      expect(userActionInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-4',
          workspace_id: 'ws-explicit',
          account_id: 'acc-4',
          action_type: 'analysis_started',
        }),
      )
    })

    it('resolves the active workspace when none is supplied', async () => {
      await service.recordAnalysisStarted('acc-5', 'user-5')
      expect(workspaceContext.resolveActiveWorkspace).toHaveBeenCalledWith('user-5')
      expect(userActionInsert).toHaveBeenCalledWith(
        expect.objectContaining({ workspace_id: 'ws-1', action_type: 'analysis_started' }),
      )
    })

    it('swallows a history-write failure so it never blocks the launch', async () => {
      userActionInsert.mockRejectedValueOnce(new Error('db down'))
      await expect(service.recordAnalysisStarted('acc-6', 'user-6', 'ws-1')).resolves.toBeUndefined()
    })
  })

  describe('recordAnalysisCompleted', () => {
    it('inserts an analysis_completed row with the resolved workspace (gate no-go path)', async () => {
      await service.recordAnalysisCompleted('acc-2', 'user-2')
      expect(workspaceContext.resolveActiveWorkspace).toHaveBeenCalledWith('user-2')
      expect(userActionInsert).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: 'user-2', workspace_id: 'ws-1', action_type: 'analysis_completed' }),
      )
    })

    it('swallows a history-write failure so it never fails the analysis', async () => {
      userActionInsert.mockRejectedValueOnce(new Error('db down'))
      await expect(service.recordAnalysisCompleted('acc-3', 'user-3')).resolves.toBeUndefined()
    })
  })
  describe('SIG-B — seedJobRecruiterContacts', () => {
    const proof = { title: 'Ingénieur DevOps', url: 'https://careers.example/1', postedAt: '2026-10-08' }

    it('passe chaque recruteur prouvé par la porte contacts, source « job_posting », sans enrichissement', async () => {
      await service.seedJobRecruiterContacts('acc-1', 'user-1', {
        jobRecruiters: [
          {
            fullName: 'Claire Martin',
            role: 'Talent Acquisition Partner',
            linkedinUrl: 'https://www.linkedin.com/in/claire-martin',
            jobPosting: proof,
          },
          { fullName: 'Paul Durand', jobPosting: { title: 'Architecte', url: 'https://careers.example/2' } },
        ],
      })
      expect(contacts.bulkInsert).toHaveBeenCalledWith('acc-1', 'user-1', [
        {
          fullName: 'Claire Martin',
          title: 'Talent Acquisition Partner',
          linkedinUrl: 'https://www.linkedin.com/in/claire-martin',
          city: '',
          country: '',
          source: 'job_posting',
          jobPosting: proof,
        },
        {
          fullName: 'Paul Durand',
          title: '',
          linkedinUrl: '',
          city: '',
          country: '',
          source: 'job_posting',
          jobPosting: { title: 'Architecte', url: 'https://careers.example/2' },
        },
      ])
      // AUCUN crédit d'enrichissement déclenché automatiquement.
      expect(contacts.applyEnrichment).not.toHaveBeenCalled()
    })

    it('sans preuve vérifiable (pas d’URL d’offre) ou sans nom : rien n’est semé', async () => {
      await service.seedJobRecruiterContacts('acc-1', 'user-1', {
        jobRecruiters: [
          { fullName: 'Paul Durand', jobPosting: { title: 'Architecte', url: '' } },
          { fullName: '', jobPosting: proof },
          { fullName: 'Jean Autre' },
          'Claire Martin',
        ],
      })
      expect(contacts.bulkInsert).not.toHaveBeenCalled()
    })

    it('aucun recruteur : aucun appel', async () => {
      await service.seedJobRecruiterContacts('acc-1', 'user-1', {})
      await service.seedJobRecruiterContacts('acc-1', 'user-1', undefined)
      expect(contacts.bulkInsert).not.toHaveBeenCalled()
    })
  })
})

// #4142.6 — « déjà travaillées » : les SIREN du CRM de l'espace (client ou affaire gagnée).
describe('AnalysisPersistenceService.workedSirens (#4142.6)', () => {
  const build = (rows: Array<{ siren: string }>) => {
    const query = jest.fn().mockResolvedValue(rows)
    const service = new AnalysisPersistenceService(
      { query } as unknown as DataSource,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    )
    return { service, query }
  }

  it('lit les comptes clients et ceux qui portent une affaire gagnée, bornés à l’espace', async () => {
    const { service, query } = build([{ siren: '333333333' }])

    expect(await service.workedSirens('ws-1')).toEqual(new Set(['333333333']))
    expect(String(query.mock.calls[0]?.[0])).toContain("commercial_status = 'customer'")
    expect(String(query.mock.calls[0]?.[0])).toContain("project.stage = 'won'")
    // #4294.7 — une mission déjà livrée au compte compte aussi comme « déjà travaillé », sans statut CRM à coller.
    expect(String(query.mock.calls[0]?.[0])).toContain('FROM missions')
    expect(query.mock.calls[0]?.[1]).toEqual(['ws-1'])
  })

  it('sans espace résolu : aucune requête, rien n’est écarté', async () => {
    const { service, query } = build([])

    expect((await service.workedSirens(null)).size).toBe(0)
    expect(query).not.toHaveBeenCalled()
  })
})
