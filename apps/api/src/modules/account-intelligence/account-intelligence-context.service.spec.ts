import { accountIntelligenceRecommendationSchema, type MarketMemoryRead } from '@bellum/contracts'
import { AccountIntelligenceContextService } from './account-intelligence-context.service'
import type { AccountIntelligenceDataforgeStatus, ConflictedField } from '@bellum/contracts'

/** #1618 — l'espace du lecteur : `contextFor` FILTRE dessus, il ne le reçoit
 *  pas pour décorer. Un test qui l'omettrait ne prouverait plus le cloisonnement. */
const WORKSPACE = 'ws-1'

/**
 * #1618 — LA façade `AccountIntelligenceContext` : une seule lecture, la
 * hiérarchie de confiance codée, chaque valeur datée et sourcée.
 *
 * Chaque test ci-dessous prouve UN échelon de la hiérarchie
 * (correction humaine > donnée courante > DataForge > mémoire marché >
 * inférence) sur un CHAMP réel du compte, pas seulement sur la fonction pure
 * (`account-intelligence-context.test.ts`, côté contrats, la prouve déjà dans
 * l'abstrait).
 */
describe('AccountIntelligenceContextService', () => {
  const ACCOUNT_ID = '11111111-1111-1111-1111-111111111111'

  function dataforgeStatus(
    overrides: Partial<AccountIntelligenceDataforgeStatus> = {},
  ): AccountIntelligenceDataforgeStatus {
    return {
      companyName: 'DataForge SA',
      sector: 'Assurance',
      headquarters: 'Lyon',
      penetrabilite: null,
      priorityLevel: null,
      accountPotentialScore: null,
      dataConfidenceScore: null,
      recommendedEntryPoint: null,
      recommendedPersona: null,
      recommendedStrategy: null,
      nextAction: null,
      mainRisk: null,
      observedAt: '2026-08-20T00:00:00.000Z',
      ...overrides,
    }
  }

  const EMPTY_MARKET_MEMORY_READ: MarketMemoryRead = {
    status: 'ok',
    coverage: {
      covered: false,
      marketPaths: null,
      esnObserved: [],
      observedStack: [],
      roleFamilies: [],
      exEsnPresent: null,
      observedZone: null,
    },
  }

  function build(options: {
    account?: Record<string, unknown> | null
    humanFieldRows?: Array<{ field: string; observed_at: Date }>
    dataforge?: AccountIntelligenceDataforgeStatus | null
    marketMemory?: MarketMemoryRead
    conflicts?: readonly ConflictedField[]
  }) {
    // ⚠️ `'account' in options`, PAS `options.account ?? défaut` : l'appelant
    // qui passe explicitement `account: null` simule un compte INTROUVABLE, et
    // `??` confondrait ce `null` avec « non fourni, prends le défaut ».
    const account =
      'account' in options
        ? options.account
        : {
            id: ACCOUNT_ID,
            company_name: 'ACME',
            sector: 'Banque de détail',
            headquarters: 'Paris',
            website: 'https://acme.example',
            siren: '552100554',
            registry_country: 'FR',
            updated_at: new Date('2026-09-05T00:00:00.000Z'),
          }
    const accounts = { findOne: jest.fn().mockResolvedValue(account) }
    const fieldProvenanceRows = (options.humanFieldRows ?? []).map(row => ({
      entity_type: 'account',
      entity_id: ACCOUNT_ID,
      source: 'human',
      ...row,
    }))
    const fieldProvenance = { find: jest.fn().mockResolvedValue(fieldProvenanceRows) }
    const readDataforgeStatus = jest.fn().mockResolvedValue(options.dataforge ?? null)
    const readMarketMemoryCoverage = jest.fn().mockResolvedValue(options.marketMemory ?? EMPTY_MARKET_MEMORY_READ)
    const readFieldConflicts = jest.fn().mockResolvedValue(options.conflicts ?? [])
    const service = new AccountIntelligenceContextService(
      accounts as never,
      fieldProvenance as never,
      readDataforgeStatus,
      readMarketMemoryCoverage,
      readFieldConflicts,
    )
    return { service, accounts, fieldProvenance, readDataforgeStatus, readMarketMemoryCoverage, readFieldConflicts }
  }

  it('rend `null` — jamais une erreur — sur un compte inconnu', async () => {
    const { service } = build({ account: null })
    await expect(service.contextFor(ACCOUNT_ID, WORKSPACE)).resolves.toBeNull()
  })

  // #3235 — `dataforge_version` du versioning se lit ICI (seul chemin autorisé).
  describe('dataforgeVersionFor (#3235)', () => {
    it('rend le data_version de la ligne DataForge du compte, cloisonné par espace', async () => {
      const { service, accounts } = build({
        dataforge: dataforgeStatus({ dataVersion: 'ORION_V12' }),
      })
      await expect(service.dataforgeVersionFor(ACCOUNT_ID, WORKSPACE)).resolves.toBe('ORION_V12')
      expect(accounts.findOne).toHaveBeenCalledWith({ where: { id: ACCOUNT_ID, workspace_id: WORKSPACE } })
    })

    it('rend null sans SIREN, sans ligne DataForge ou sans version — jamais une valeur devinée', async () => {
      await expect(build({ dataforge: null }).service.dataforgeVersionFor(ACCOUNT_ID, WORKSPACE)).resolves.toBeNull()
      await expect(
        build({ dataforge: dataforgeStatus({ dataVersion: null }) }).service.dataforgeVersionFor(ACCOUNT_ID, WORKSPACE),
      ).resolves.toBeNull()
      await expect(build({ account: null }).service.dataforgeVersionFor(ACCOUNT_ID, WORKSPACE)).resolves.toBeNull()
      const noSiren = build({
        account: { id: ACCOUNT_ID, company_name: 'X', siren: null, updated_at: new Date() },
        dataforge: dataforgeStatus({ dataVersion: 'V' }),
      })
      await expect(noSiren.service.dataforgeVersionFor(ACCOUNT_ID, WORKSPACE)).resolves.toBeNull()
      expect(noSiren.readDataforgeStatus).not.toHaveBeenCalled()
    })
  })

  /*
   * ⚠️ LE CLOISONNEMENT, et il ne va pas de soi.
   *
   * La première version de cette façade lisait `findOne({ where: { id } })`,
   * sans filtre d'espace : un utilisateur authentifié aurait lu le contexte
   * d'un compte d'un AUTRE espace en devinant son identifiant. Les espaces
   * sont des ESN, donc des concurrents — c'est la fuite la plus chère que ce
   * dépôt puisse produire, et elle passait tous les tests d'alors.
   *
   * Ce test ne vérifie PAS que la fonction rend `null` : il vérifie que la
   * requête PORTE le `workspace_id`. Une façade qui filtrerait après coup, en
   * mémoire, aurait déjà lu la ligne.
   */
  it("#1618 — la requête porte l'espace, elle ne filtre pas après coup", async () => {
    const { service, accounts } = build({})
    await service.contextFor(ACCOUNT_ID, WORKSPACE)
    expect(accounts.findOne).toHaveBeenCalledWith({ where: { id: ACCOUNT_ID, workspace_id: WORKSPACE } })
  })

  it("#1618 — le compte d'un autre espace n'existe pas, même avec le bon identifiant", async () => {
    // Le dépôt rend `null` parce que la clause SQL ne matche pas — c'est la
    // base qui refuse, pas une comparaison applicative qu'on pourrait sauter.
    const { service, accounts } = build({ account: null })
    await expect(service.contextFor(ACCOUNT_ID, 'ws-d-un-concurrent')).resolves.toBeNull()
    expect(accounts.findOne).toHaveBeenCalledWith({
      where: { id: ACCOUNT_ID, workspace_id: 'ws-d-un-concurrent' },
    })
  })

  it('échelon DataForge : sans donnée courante ni correction humaine, DataForge gagne', async () => {
    const { service } = build({
      account: {
        id: ACCOUNT_ID,
        company_name: 'ACME',
        sector: null,
        headquarters: null,
        website: null,
        siren: '552100554',
        registry_country: 'FR',
        updated_at: new Date('2026-09-05T00:00:00.000Z'),
      },
      dataforge: dataforgeStatus({ sector: 'Assurance', headquarters: 'Lyon' }),
    })
    const context = await service.contextFor(ACCOUNT_ID, WORKSPACE)
    expect(context?.sector).toEqual({
      state: 'known',
      value: 'Assurance',
      provenance: { source: 'dataforge', observedAt: '2026-08-20T00:00:00.000Z' },
    })
    expect(context?.headquarters).toEqual({
      state: 'known',
      value: 'Lyon',
      provenance: { source: 'dataforge', observedAt: '2026-08-20T00:00:00.000Z' },
    })
  })

  it('échelon donnée courante : la valeur en base bat DataForge dès qu’elle existe', async () => {
    const { service } = build({
      dataforge: dataforgeStatus({ sector: 'Assurance' }),
    })
    const context = await service.contextFor(ACCOUNT_ID, WORKSPACE)
    expect(context?.sector).toEqual({
      state: 'known',
      value: 'Banque de détail',
      provenance: { source: 'current_data', observedAt: '2026-09-05T00:00:00.000Z' },
    })
  })

  it('échelon correction humaine : gagne TOUJOURS, même sur un champ que DataForge et la base contredisent', async () => {
    const { service } = build({
      account: {
        id: ACCOUNT_ID,
        company_name: 'ACME',
        sector: 'TF1 PUB', // la valeur en base EST la correction humaine (arbitrate() la protège déjà)
        headquarters: 'Paris',
        website: null,
        siren: '552100554',
        registry_country: 'FR',
        updated_at: new Date('2026-09-05T00:00:00.000Z'),
      },
      humanFieldRows: [{ field: 'sector', observed_at: new Date('2026-01-01T00:00:00.000Z') }],
      dataforge: dataforgeStatus({ sector: 'Assurance' }),
    })
    const context = await service.contextFor(ACCOUNT_ID, WORKSPACE)
    expect(context?.sector).toEqual({
      state: 'known',
      value: 'TF1 PUB',
      provenance: { source: 'human_correction', observedAt: '2026-01-01T00:00:00.000Z' },
    })
    // Le champ VOISIN, non corrigé, reste sur son échelon normal.
    expect(context?.headquarters).toEqual({
      state: 'known',
      value: 'Paris',
      provenance: { source: 'current_data', observedAt: '2026-09-05T00:00:00.000Z' },
    })
  })

  it('`unknown` — jamais une valeur inventée — quand aucune source ne dit rien', async () => {
    const { service } = build({
      account: {
        id: ACCOUNT_ID,
        company_name: 'ACME',
        sector: null,
        headquarters: null,
        website: null,
        siren: null,
        registry_country: null,
        updated_at: new Date('2026-09-05T00:00:00.000Z'),
      },
      dataforge: null,
    })
    const context = await service.contextFor(ACCOUNT_ID, WORKSPACE)
    expect(context?.sector).toEqual({ state: 'unknown' })
    expect(context?.headquarters).toEqual({ state: 'unknown' })
  })

  it('ne consulte PAS DataForge quand le compte n’a pas de SIREN — une source dégradable, pas une dépendance dure', async () => {
    const { service, readDataforgeStatus } = build({
      account: {
        id: ACCOUNT_ID,
        company_name: 'ACME',
        sector: 'Banque',
        headquarters: 'Paris',
        website: null,
        siren: null,
        registry_country: 'FR',
        updated_at: new Date('2026-09-05T00:00:00.000Z'),
      },
    })
    const context = await service.contextFor(ACCOUNT_ID, WORKSPACE)
    expect(readDataforgeStatus).not.toHaveBeenCalled()
    expect(context?.dataforge).toEqual({ provenance: null, status: null })
  })

  it('porte le bloc DataForge complet, avec sa provenance datée', async () => {
    const status = dataforgeStatus()
    const { service } = build({ dataforge: status })
    const context = await service.contextFor(ACCOUNT_ID, WORKSPACE)
    expect(context?.dataforge).toEqual({
      provenance: { source: 'dataforge', observedAt: '2026-08-20T00:00:00.000Z' },
      status,
    })
  })

  it('porte le bloc mémoire marché tel que le service le rend, avec une provenance SANS date (GA-259 : la mémoire marché ne date pas ses observations)', async () => {
    const read: MarketMemoryRead = { status: 'unavailable', reason: 'read_failed' }
    const { service, readMarketMemoryCoverage } = build({ marketMemory: read })
    const context = await service.contextFor(ACCOUNT_ID, WORKSPACE)
    expect(context?.marketMemory).toEqual({
      provenance: { source: 'market_memory', observedAt: null },
      read,
    })
    expect(readMarketMemoryCoverage).toHaveBeenCalledWith({
      ref: ACCOUNT_ID,
      name: 'ACME',
      website: 'https://acme.example',
      country: 'FR',
    })
  })

  // #3672 (recette prod 06/10, Société Générale) — « Historique observé · date
  // inconnue » : la ligne portait pourtant `period_end` (période COUVERTE par le
  // corpus), que la lecture ne remontait pas. La date rendue est la FIN DE LA
  // PÉRIODE documentée, jamais une date d'observation individuelle.
  it('#3672 — date la mémoire marché par la fin de la PÉRIODE couverte quand le corpus la porte', async () => {
    const read: MarketMemoryRead = {
      status: 'ok',
      coverage: {
        covered: true,
        marketPaths: 4,
        esnObserved: [],
        observedStack: [],
        roleFamilies: [{ family: 'sponsor', persons: 2 }],
        exEsnPresent: null,
        periodEnd: '2024-12-31',
      },
    }
    const { service } = build({ marketMemory: read })
    const context = await service.contextFor(ACCOUNT_ID, WORKSPACE)
    expect(context?.marketMemory.provenance).toEqual({ source: 'market_memory', observedAt: '2024-12-31' })
  })

  it('#3672 — sans période portée par le corpus, la date reste null (jamais devinée)', async () => {
    const read: MarketMemoryRead = {
      status: 'ok',
      coverage: {
        covered: true,
        marketPaths: 4,
        esnObserved: [],
        observedStack: [],
        roleFamilies: [],
        exEsnPresent: null,
      },
    }
    const { service } = build({ marketMemory: read })
    const context = await service.contextFor(ACCOUNT_ID, WORKSPACE)
    expect(context?.marketMemory.provenance.observedAt).toBeNull()
  })

  it('ne lit que les corrections HUMAINES du compte visé — jamais un autre compte, jamais une source non humaine', async () => {
    const { service, fieldProvenance } = build({})
    await service.contextFor(ACCOUNT_ID, WORKSPACE)
    expect(fieldProvenance.find).toHaveBeenCalledWith({
      where: { entity_type: 'account', entity_id: ACCOUNT_ID, source: 'human' },
    })
  })

  /**
   * #190.1/#190.8 (épopée #3219) — LE BRANCHEMENT SUR /CHAT.
   *
   * `FieldConflictService.openConflicts` existait déjà, testé, mais aucune
   * réponse `/chat` ne le lisait : une contradiction `unresolved` disparaissait
   * à la fin du tour où elle avait été vue. Cette façade est exactement ce que
   * `compile_account_preflight` (apps/ia) reçoit via le pont NestJS — la
   * prouver ICI prouve le branchement de bout en bout.
   */
  it("#190.1/#190.8 — les contradictions ouvertes voyagent sur la façade, avec l'espace ET le compte visés", async () => {
    const valueA = { value: 'Banque', source: 'pipeline', at: '2026-08-14T00:00:00.000Z', authority: 2 } as const
    const valueB = { value: 'Assurance', source: 'pipeline', at: '2026-08-18T00:00:00.000Z', authority: 2 } as const
    const conflict: ConflictedField = {
      field: 'sector',
      valueA,
      valueB,
      claims: [valueA, valueB],
      sourceTypes: ['pipeline'],
      conflictSince: '2026-08-18T00:00:00.000Z',
      resolvedBy: 'unresolved',
      freshnessGapDays: 4,
      nextCheck: '2026-09-01T00:00:00.000Z',
    }
    const { service, readFieldConflicts } = build({ conflicts: [conflict] })
    const context = await service.contextFor(ACCOUNT_ID, WORKSPACE)
    expect(context?.conflicts).toEqual([conflict])
    expect(readFieldConflicts).toHaveBeenCalledWith(ACCOUNT_ID, WORKSPACE)
  })

  it('#190.1 — `[]` est un FAIT (aucune contradiction ouverte), jamais une inconnue', async () => {
    const { service } = build({})
    const context = await service.contextFor(ACCOUNT_ID, WORKSPACE)
    expect(context?.conflicts).toEqual([])
  })

  it('ne consulte AUCUNE des deux sources cross-module quand le compte est introuvable', async () => {
    const { service, fieldProvenance, readDataforgeStatus, readMarketMemoryCoverage } = build({ account: null })
    await service.contextFor(ACCOUNT_ID, WORKSPACE)
    expect(fieldProvenance.find).not.toHaveBeenCalled()
    expect(readDataforgeStatus).not.toHaveBeenCalled()
    expect(readMarketMemoryCoverage).not.toHaveBeenCalled()
  })
  /* ═══════════════════════════════════════════════════════════════════════════
   * #2116.10-12 — LES TROIS FAITS QUI NE SE RECALCULENT PLUS À L'ÉCRAN
   * ═════════════════════════════════════════════════════════════════════════*/

  /** Un compte qui PORTE de la matière — c'est la forme réelle du JSONB
   *  (`raw_analysis`), pas une forme d'écran : la façade lit la base. */
  function analysedAccount(overrides: Record<string, unknown> = {}) {
    return {
      id: ACCOUNT_ID,
      company_name: 'ACME',
      sector: 'Banque de détail',
      headquarters: 'Paris',
      website: 'https://acme.example',
      siren: '552100554',
      registry_country: 'FR',
      updated_at: new Date('2026-09-05T00:00:00.000Z'),
      entities_refreshed_at: new Date('2026-09-01T00:00:00.000Z'),
      strategy_refreshed_at: new Date('2026-09-02T00:00:00.000Z'),
      raw_analysis: {
        competitors: [
          { name: 'Sopra Steria', contract_type: 'Maintenance applicative', strengths: 'Présence installée' },
          { name: '   ' },
          { name: 'Capgemini', weaknesses: 'Coût' },
        ],
        technology_stack: [
          { name: 'React', usage: 'portail client' },
          { name: '  ', usage: 'ignorée' },
          { name: 'Kafka', usage: null },
        ],
        comment_ouvrir_compte: {
          strategy: 'Entrer par la refonte du portail',
          entry_points: [
            { label: 'Direction du portail client', target_profile: 'CTO', justification: 'Refonte en cours' },
            { label: '', target_profile: null, justification: null },
          ],
        },
      },
      ...overrides,
    }
  }

  it('#2116.10 — rend l’ESN en place, sourcée et datée, sans les noms vides', async () => {
    const { service } = build({ account: analysedAccount() })
    const context = await service.contextFor(ACCOUNT_ID, WORKSPACE)
    expect(context?.incumbentEsn).toEqual({
      state: 'known',
      value: [
        {
          name: 'Sopra Steria',
          contractType: 'Maintenance applicative',
          strengths: 'Présence installée',
          weaknesses: null,
        },
        { name: 'Capgemini', contractType: null, strengths: null, weaknesses: 'Coût' },
      ],
      provenance: { source: 'public_sources', observedAt: '2026-09-01T00:00:00.000Z' },
    })
  })

  it('#2116.10 / #4149 — sait dire NON : aucune ESN nommée ⇒ `unknown` avec sa raison, jamais une liste vide', async () => {
    const { service } = build({ account: analysedAccount({ raw_analysis: { competitors: [{ name: ' ' }] } }) })
    const context = await service.contextFor(ACCOUNT_ID, WORKSPACE)
    // #4149 — la recherche A tourné (`entities_refreshed_at` posé par `analysedAccount`) :
    // « non mesuré » seul dirait « on n'a pas cherché », ce qui serait faux ici.
    expect(context?.incumbentEsn).toEqual({ state: 'unknown', reason: 'no_esn_named' })
  })

  it('#4149 — jamais analysé (aucune date d’entités) ⇒ `unknown` avec la raison « never_analyzed »', async () => {
    const { service } = build({
      account: analysedAccount({
        entities_refreshed_at: null,
        strategy_refreshed_at: null,
        strategy_collected_at: null,
        raw_analysis: {},
      }),
    })
    const context = await service.contextFor(ACCOUNT_ID, WORKSPACE)
    expect(context?.incumbentEsn).toEqual({ state: 'unknown', reason: 'never_analyzed' })
  })

  // #4149 (R12, Thales) — « Analyse : Terminé · 4 analyses » mais `entities_refreshed_at` jamais posé
  // (analyses antérieures à cette colonne) : la carte disait « pas encore analysé ». Un dossier qui
  // porte une analyse (plan daté ou `raw_analysis` non vide) a été analysé : la raison est « aucune ESN nommée ».
  it.each([
    ['un plan daté', { entities_refreshed_at: null, raw_analysis: {}, strategy_refreshed_at: new Date('2026-09-02') }],
    ['une analyse non vide', { entities_refreshed_at: null, raw_analysis: { company_summary: 'Thales' } }],
  ])(
    '#4149 — compte analysé sans date d’entités (%s) ⇒ « no_esn_named », jamais « never_analyzed »',
    async (_n, patch) => {
      const { service } = build({ account: analysedAccount(patch) })
      const context = await service.contextFor(ACCOUNT_ID, WORKSPACE)
      expect(context?.incumbentEsn).toEqual({ state: 'unknown', reason: 'no_esn_named' })
    },
  )

  it('#2116.11 — rend les technologies AVEC leur usage, `null` quand il manque', async () => {
    const { service } = build({ account: analysedAccount() })
    const context = await service.contextFor(ACCOUNT_ID, WORKSPACE)
    expect(context?.technologies).toEqual({
      state: 'known',
      value: [
        { name: 'React', usage: 'portail client' },
        { name: 'Kafka', usage: null },
      ],
      provenance: { source: 'public_sources', observedAt: '2026-09-01T00:00:00.000Z' },
    })
  })

  it('#2116.12 — un SEUL chemin d’accès, celui de l’analyse quand DataForge se tait', async () => {
    const { service } = build({ account: analysedAccount() })
    const context = await service.contextFor(ACCOUNT_ID, WORKSPACE)
    expect(context?.entryPaths).toEqual({
      state: 'known',
      value: [{ label: 'Direction du portail client', targetProfile: 'CTO', justification: 'Refonte en cours' }],
      provenance: { source: 'inference', observedAt: '2026-09-02T00:00:00.000Z' },
    })
  })

  it('#2116.12 — la porte de DataForge BAT l’inférence : un seul chemin rendu, jamais deux', async () => {
    const { service } = build({
      account: analysedAccount(),
      dataforge: dataforgeStatus({
        recommendedEntryPoint: 'Direction des paiements',
        recommendedPersona: 'Directeur des paiements',
        recommendedStrategy: 'Adosser à la migration SEPA',
      }),
    })
    const context = await service.contextFor(ACCOUNT_ID, WORKSPACE)
    expect(context?.entryPaths).toEqual({
      state: 'known',
      value: [
        {
          label: 'Direction des paiements',
          targetProfile: 'Directeur des paiements',
          justification: 'Adosser à la migration SEPA',
        },
      ],
      provenance: { source: 'dataforge', observedAt: '2026-08-20T00:00:00.000Z' },
    })
  })

  it('#2116.10-12 — une dimension JAMAIS rafraîchie rend une date INCONNUE, jamais `updated_at`', async () => {
    const { service } = build({
      account: analysedAccount({ entities_refreshed_at: null, strategy_refreshed_at: null }),
    })
    const context = await service.contextFor(ACCOUNT_ID, WORKSPACE)
    expect(context?.incumbentEsn).toMatchObject({ provenance: { observedAt: null } })
    expect(context?.entryPaths).toMatchObject({ provenance: { observedAt: null } })
  })

  /* ═══════════════════════════════════════════════════════════════════════════
   * #2116.17-24 — LES HUIT MÉTADONNÉES D'UNE RECOMMANDATION
   * ═════════════════════════════════════════════════════════════════════════*/

  it('#2116.17-24 — chaque recommandation porte les HUIT, aucune absente', async () => {
    const { service } = build({
      account: analysedAccount(),
      dataforge: dataforgeStatus({
        nextAction: 'Reprendre contact avant le renouvellement',
        mainRisk: 'Contrat cadre',
      }),
    })
    const context = await service.contextFor(ACCOUNT_ID, WORKSPACE)
    expect(context?.recommendations.length).toBeGreaterThan(0)
    for (const recommendation of context?.recommendations ?? []) {
      // Le CONTRAT dit non à l'amputation — ce test-ci prouve que le service
      // le respecte sur des données réelles, pas seulement dans l'abstrait.
      expect(accountIntelligenceRecommendationSchema.safeParse(recommendation).success).toBe(true)
    }
  })

  it('#2116.21 — la confiance est un NIVEAU justifié par un compte, jamais un pourcentage', async () => {
    const { service } = build({ account: analysedAccount() })
    const context = await service.contextFor(ACCOUNT_ID, WORKSPACE)
    const first = context?.recommendations[0]
    expect(first?.confidence.level).toBe('deduced')
    expect(first?.confidence.corroborationCount).toBe(1)
    expect(typeof first?.confidence.level).toBe('string')
  })

  it('#2116.19-20 — une recommandation SANS date la nomme : `null` + `undated`', async () => {
    const { service } = build({ account: analysedAccount({ strategy_refreshed_at: null }) })
    const context = await service.contextFor(ACCOUNT_ID, WORKSPACE)
    expect(context?.recommendations[0]).toMatchObject({
      provenance: { source: 'inference', observedAt: null },
      freshness: 'undated',
    })
  })

  // #3672 (recette prod 07/10, SG) — les comptes analysés AVANT `strategy_refreshed_at`
  // ne portent que `strategy_collected_at` (écrit par savePlan, Phase 4) : la
  // date de collecte du plan DATE l'hypothèse au lieu de l'écrire « date inconnue ».
  it('#3672 — sans strategy_refreshed_at, la date de collecte du plan date la recommandation', async () => {
    const { service } = build({
      account: analysedAccount({
        strategy_refreshed_at: null,
        strategy_collected_at: new Date('2026-10-02T08:00:00.000Z'),
      }),
    })
    const context = await service.contextFor(ACCOUNT_ID, WORKSPACE)
    expect(context?.recommendations[0]).toMatchObject({
      provenance: { source: 'inference', observedAt: '2026-10-02T08:00:00.000Z' },
    })
    expect(context?.recommendations[0]?.freshness).not.toBe('undated')
  })

  it('#2116.24 — toutes les actions proposées OUVRENT ou PRÉPARENT, aucune n’envoie', async () => {
    const { service } = build({
      account: analysedAccount(),
      dataforge: dataforgeStatus({ nextAction: 'Reprendre contact', mainRisk: 'Contrat cadre' }),
    })
    const context = await service.contextFor(ACCOUNT_ID, WORKSPACE)
    const actions = (context?.recommendations ?? []).map(recommendation => recommendation.action)
    expect(actions.length).toBeGreaterThanOrEqual(3)
    for (const action of actions) {
      expect(['open_contacts', 'open_plan', 'prepare_message', 'open_sources']).toContain(action)
    }
  })

  /*
   * #2116.17-24 — LA CAUSE RACINE VÉRIFIÉE EN PROD LE 14/09 : le pipeline
   * actuel écrit `comment_ouvrir_compte` comme une NARRATION (3-4 phrases,
   * `apps/ia/app/prompts/bellum_strategy.py:200`), pas comme l'objet
   * structuré — et c'était la forme sur 25/25 comptes de Louis, THALES
   * compris. `recommendations` restait `[]` : ce bloc prouve que le service
   * ne dépend plus de la forme objet pour produire au moins une recommandation.
   */
  it('#2116.17-24 — une stratégie NARRATIVE sans porte nommée n’est plus un tableau vide (cas THALES)', async () => {
    const { service } = build({
      account: analysedAccount({
        raw_analysis: {
          comment_ouvrir_compte:
            'Entrer par la DSI via un audit flash du socle Java historique, en citant la référence Thales Alenia Space. Premier contact LinkedIn auprès du directeur technique, puis multi-threader vers le RSSI. Livrable : plan de modernisation en 5 slides.',
        },
      }),
    })
    const context = await service.contextFor(ACCOUNT_ID, WORKSPACE)
    // Aucune porte NOMMÉE structurée : `entryPaths` reste honnêtement `unknown`.
    expect(context?.entryPaths).toEqual({ state: 'unknown' })
    expect(context?.recommendations.length).toBeGreaterThanOrEqual(1)
    const [recommendation] = context?.recommendations ?? []
    expect(recommendation).toMatchObject({
      id: 'opening-strategy',
      label:
        'Entrer par la DSI via un audit flash du socle Java historique, en citant la référence Thales Alenia Space. Premier contact LinkedIn auprès du directeur technique, puis multi-threader vers le RSSI. Livrable : plan de modernisation en 5 slides.',
      nature: 'inference',
      provenance: { source: 'inference', observedAt: '2026-09-02T00:00:00.000Z' },
      confidence: { level: 'deduced', corroborationCount: null },
    })
    expect(accountIntelligenceRecommendationSchema.safeParse(recommendation).success).toBe(true)
  })

  it('#2116.17 — la forme objet bien formée est INCHANGÉE : pas de recommandation narrative en plus', async () => {
    const { service } = build({ account: analysedAccount() })
    const context = await service.contextFor(ACCOUNT_ID, WORKSPACE)
    const ids = (context?.recommendations ?? []).map(recommendation => recommendation.id)
    expect(ids).not.toContain('opening-strategy')
  })

  it('#2116.17 — sait dire NON : une porte DataForge nommée n’ajoute pas la narration en double', async () => {
    const { service } = build({
      account: analysedAccount({
        raw_analysis: { comment_ouvrir_compte: 'Entrer par la DSI via un audit flash.' },
      }),
      dataforge: dataforgeStatus({
        recommendedEntryPoint: 'Direction des paiements',
        recommendedPersona: 'Directeur des paiements',
      }),
    })
    const context = await service.contextFor(ACCOUNT_ID, WORKSPACE)
    expect(context?.entryPaths.state).toBe('known')
    const ids = (context?.recommendations ?? []).map(recommendation => recommendation.id)
    expect(ids).toContain('entry-path-0')
    expect(ids).not.toContain('opening-strategy')
  })
})
