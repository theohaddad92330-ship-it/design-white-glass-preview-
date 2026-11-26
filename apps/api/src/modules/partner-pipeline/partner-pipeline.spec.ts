import { PartnerPipelineService } from './partner-pipeline.service'
import { marketMatchKey } from '../market-memory/market-company-key'

describe('le pipeline partenaire (tome 4, BEL-PART-001)', () => {
  const service = (
    rows: Record<string, unknown>[],
    rawAccountPartnerRows: Record<string, unknown>[] = [],
    options: {
      answers?: Record<string, unknown>
      byDepartment?: (department: string) => Record<string, unknown>[]
      // #2151.32 — `'ok'` par défaut, jamais `'unknown'` : les tests
      // pré-existants (qui ignorent la mémoire marché) attendent
      // `observedAtAccounts: 0, unresolvedAtAccounts: 0`, pas un compte
      // « inconnu » par défaut — voir `esn-on-accounts-merge.spec.ts` pour le
      // comportement tri-état, testé là où il compte vraiment.
      marketObservation?: (lookup: {
        ref: string
        name: string
      }) => { status: 'ok'; observedEsnKeys: string[] } | { status: 'unknown' }
    } = {},
  ) => {
    const repo = {
      find: jest.fn().mockResolvedValue(rows),
      findOne: jest.fn(async ({ where }: { where: { id: string } }) => rows.find(r => r['id'] === where.id) ?? null),
      create: jest.fn((row: Record<string, unknown>) => row),
      save: jest.fn(async (row: Record<string, unknown>) => ({ id: 'new', ...row })),
      manager: { query: jest.fn().mockResolvedValue(rawAccountPartnerRows) },
    }
    /*
     * #1798 / GA-07 — le service reçoit trois FONCTIONS, plus deux services.
     * Le cliquet des frontières de modules était au plafond : importer les
     * classes ici aurait fait monter le compteur sans rien découpler. Le
     * double garde la même FORME que l'appel réel, ce qui est tout ce dont ce
     * test a besoin.
     */
    const esnDirectory = {
      byDepartment: jest.fn(async (department: string, _limit?: number) => options.byDepartment?.(department) ?? []),
    }
    const esnProfile = {
      getAnswers: jest.fn().mockResolvedValue({ geo_zones: [], ...options.answers }),
    }
    const marketObservation = jest.fn(async (lookup: { ref: string; name: string }) => {
      const result = options.marketObservation?.(lookup) ?? { status: 'ok' as const, observedEsnKeys: [] }
      return result.status === 'unknown'
        ? { status: 'unknown' as const }
        : { status: 'ok' as const, observedEsnKeys: new Set(result.observedEsnKeys) }
    })
    return {
      svc: new PartnerPipelineService(
        repo as never,
        (department, limit) => esnDirectory.byDepartment(department, limit) as never,
        userId => esnProfile.getAnswers(userId),
        lookup => marketObservation(lookup) as never,
      ),
      repo,
      esnDirectory,
      esnProfile,
      marketObservation,
    }
  }

  const base = {
    id: 'p1',
    workspaceId: 'w1',
    siren: null,
    name: 'Astréa',
    stage: 'identifie',
    roles: [],
    contactName: null,
    notes: null,
    needsReceived90d: 0,
    needsGiven90d: 0,
    placementsActive: 0,
    placementsTotal: 0,
    lastActivityAt: null,
    nonSolicitation: null,
  }

  /** Une relation qui a DÉJÀ une histoire : sous trois placements, le score
   *  n'existe pas et les gardes dures ne sont même pas évaluées. */
  const withHistory = { ...base, placementsTotal: 6, placementsActive: 2, needsReceived90d: 8, needsGiven90d: 2 }

  it('n’invente aucun score sur une relation neuve', async () => {
    const { svc } = service([{ ...base }])
    const [relation] = await svc.list('w1')
    expect(relation?.score.score).toBeNull()
    expect(relation?.score.reason).toContain('historique')
  })

  it('calcule un score dès qu’il y a une histoire', async () => {
    const { svc } = service([
      { ...base, placementsTotal: 6, placementsActive: 2, needsReceived90d: 8, needsGiven90d: 2 },
    ])
    const [relation] = await svc.list('w1')
    expect(relation?.score.score).not.toBeNull()
    // La marge et l'accès ne sont pas enregistrés : ils SORTENT du
    // dénominateur au lieu de valoir zéro.
    expect(relation?.score.unmeasured).toEqual(['marge', 'acces'])
  })

  it('déplace une relation et horodate le geste', async () => {
    const { svc } = service([{ ...base }])
    const moved = await svc.setStage('w1', 'p1', 'flux_actif')
    expect(moved?.stage).toBe('flux_actif')
    expect(moved?.lastActivityAt).not.toBeNull()
  })

  it('ne déplace rien dans un autre espace', async () => {
    const { svc, repo } = service([])
    const moved = await svc.setStage('w2', 'p1', 'flux_actif')
    expect(moved).toBeNull()
    expect(repo.save).not.toHaveBeenCalled()
  })

  // #3757 (reste) — les SIREN déclarés partenaires par l'espace, pour Découvrir.
  describe('declaredSirens — le fait DÉCLARÉ que Découvrir ne devine pas', () => {
    it('ne rend que les SIREN connus, jamais une relation sans SIREN', async () => {
      const { svc } = service([
        { ...base, id: 'p1', siren: '326820065' },
        { ...base, id: 'p2', siren: null },
      ])
      expect(await svc.declaredSirens('w1')).toEqual(['326820065'])
    })

    it('exclut une relation RETIRÉE — la pierre tombale du pipeline', async () => {
      const { svc } = service([
        { ...base, id: 'p1', siren: '326820065' },
        { ...base, id: 'p2', siren: '552100554', stage: 'retire' },
      ])
      expect(await svc.declaredSirens('w1')).toEqual(['326820065'])
    })

    it('rend une liste vide sans relation — jamais une erreur pour un espace neuf', async () => {
      const { svc } = service([])
      expect(await svc.declaredSirens('w1')).toEqual([])
    })
  })

  /* ------------------------------------------------------------------ */
  /*  Les deux gardes dures : elles doivent s'ARMER, pas exister         */
  /* ------------------------------------------------------------------ */

  /**
   * Le défaut que ces tests attrapent : `partnerRelationScore` sait bloquer
   * « viser le rang 1 », c'est écrit et testé dans le contrat — et l'unique
   * appelant ne lui passait NI `isAlsoClient` NI `nonSolicitation`. Les deux
   * refus étaient donc structurellement muets : `rank1Blocked` valait `null`
   * sur toutes les relations de tous les espaces.
   *
   * Un test de contrat ne peut PAS voir ça : il appelle la fonction avec les
   * entrées qu'il choisit. Seul un test qui part d'une LIGNE de base le voit.
   */
  describe('les gardes dures s’arment depuis la ligne, pas depuis un drapeau de test', () => {
    it('« aussi notre client » se lit dans les rôles de la relation', async () => {
      const { svc } = service([{ ...withHistory, roles: ['client'] }])
      const [relation] = await svc.list('w1')
      expect(relation?.score.rank1Blocked).toContain('client')
    })

    it('SAIT DIRE NON — sans le rôle, la même ligne ne bloque rien', async () => {
      // La preuve que c'est bien le rôle qui arme, et non une constante posée
      // au passage : une garde qui bloque TOUJOURS ne garde rien non plus.
      const { svc } = service([{ ...withHistory, roles: ['fournisseur'] }])
      const [relation] = await svc.list('w1')
      expect(relation?.score.rank1Blocked).toBeNull()
    })

    it('la clause de non-sollicitation déclarée bloque, et passe AVANT « aussi client »', async () => {
      const { svc } = service([{ ...withHistory, roles: ['client'], nonSolicitation: true }])
      const [relation] = await svc.list('w1')
      expect(relation?.score.rank1Blocked).toContain('non-sollicitation')
    })

    it('« non déclarée » n’est pas « pas de clause » — et l’écran peut le dire', async () => {
      const { svc } = service([{ ...withHistory, roles: ['fournisseur'], nonSolicitation: null }])
      const [notDeclared] = await svc.list('w1')
      expect(notDeclared?.nonSolicitation).toBeNull()
      expect(notDeclared?.score.rank1Blocked).toBeNull()

      const { svc: declaredNone } = service([{ ...withHistory, roles: ['fournisseur'], nonSolicitation: false }])
      const [none] = await declaredNone.list('w1')
      expect(none?.nonSolicitation).toBe(false)
      expect(none?.score.rank1Blocked).toBeNull()
    })

    it('enregistre la déclaration, et seulement dans son espace', async () => {
      const { svc, repo } = service([{ ...withHistory }])
      const saved = await svc.setNonSolicitation('w1', 'p1', true)
      expect(saved?.nonSolicitation).toBe(true)
      expect(saved?.score.rank1Blocked).toContain('non-sollicitation')

      const { svc: other, repo: otherRepo } = service([])
      expect(await other.setNonSolicitation('w2', 'p1', true)).toBeNull()
      expect(otherRepo.save).not.toHaveBeenCalled()
      expect(repo.save).toHaveBeenCalled()
    })
  })

  /* ------------------------------------------------------------------ */
  /*  Marge et Accès : NON COLLECTÉS, et nommés comme tels               */
  /* ------------------------------------------------------------------ */

  describe('les deux axes muets sont NOMMÉS, pas passés en null muet', () => {
    it('dit lesquels, et pourquoi personne ne peut les renseigner', async () => {
      const { svc } = service([{ ...withHistory }])
      const [relation] = await svc.list('w1')
      expect(relation?.notCollected.map(item => item.axis)).toEqual(['marge', 'acces'])
      // Une raison, pas une étiquette : « à voir » ne dit pas s'il faut
      // attendre une collecte ou saisir quelque chose.
      for (const item of relation?.notCollected ?? []) expect(item.why.length).toBeGreaterThan(40)
    })

    it('ils sortent du dénominateur au lieu de valoir zéro', async () => {
      const { svc } = service([{ ...withHistory }])
      const [relation] = await svc.list('w1')
      expect(relation?.score.unmeasured).toEqual(['marge', 'acces'])
      // 25 (volume) + 20 (fiabilité) + 10 (réciprocité) — ni marge ni accès.
      expect(relation?.score.scoreMax).toBe(55)
    })

    it('« viser le rang 1 » est une règle DORMANTE — aucune ligne ne peut l’atteindre', async () => {
      /**
       * Le fait déplaisant, énoncé plutôt que supposé. Trois verrous, et un
       * seul suffirait :
       *
       *  · l'axe Accès n'a pas de source, donc il vaut `null`, et le contrat
       *    exige `(access ?? 0) >= 20` — 0 contre 20 ;
       *  · `hasProof` et `hasDirectDecisionMaker` ne sont stockés NULLE PART,
       *    et le contrat exige `=== true` pour les deux.
       *
       * La recommandation existe, elle est traduite en FR et en EN, elle est
       * couverte par les tests du contrat — et aucune donnée du produit ne
       * peut la produire. Ce test ne s'en réjouit pas : il empêche qu'elle
       * réapparaisse par accident, et il tombera le jour où l'Accès aura une
       * source. Ce jour-là, il faudra vérifier que les DEUX gardes dures
       * s'arment avant de le retirer.
       *
       * ⚠️ Re-vérifié le 30/08/2026 (D90 du 29/08 demandait de câbler marge
       * ET accès) : les deux restent NON collectés — voir
       * `UNCOLLECTED_ON_PARTNER_RELATIONS` dans `partner-pipeline.service.ts`
       * pour les deux chemins examinés et écartés ce jour-là (l'un réel mais
       * partiel et vide en pratique, l'autre confirmé faux par le jeu de
       * démo lui-même). Câbler l'un ou l'autre demande une colonne neuve —
       * hors du périmètre de ce lot.
       *
       * Ce qui, lui, A changé le 30/08/2026 : le contrat repliait la marge
       * sur `averageMarginPct ?? 100` et l'accès sur `access ?? 0` — deux
       * valeurs INVENTÉES (« non mesuré » n'est ni 100, ni 0, ni 25). Elles
       * échouaient déjà du bon côté (elles refusaient), donc ce test ne
       * changeait pas de résultat ; mais rien n'empêchait plus une future
       * modification de la constante de repli de faire passer un axe
       * inconnu pour excellent. `canRank1` compare maintenant `!== null`
       * avant toute comparaison numérique, sur les DEUX bornes — la garde ne
       * peut plus se tromper de sens, quelle que soit la valeur qu'on
       * choisirait de replier. Deux tests dédiés le tiennent dans
       * `partner-pipeline.test.ts`.
       */
      for (const roles of [[], ['fournisseur'], ['concurrent']]) {
        for (const placementsTotal of [3, 6, 40]) {
          const { svc } = service([
            { ...base, roles, placementsTotal, placementsActive: 0, needsReceived90d: 40, needsGiven90d: 40 },
          ])
          const [relation] = await svc.list('w1')
          expect(relation?.score.recommendation).not.toBe('viser_rang_1')
        }
      }
    })
  })

  /* ------------------------------------------------------------------ */
  /*  #1799.1 — « pourquoi y a deux fois Capgemini »                     */
  /* ------------------------------------------------------------------ */

  describe('onMyAccounts — une même ESN, vue depuis le chemin réel du service', () => {
    it('SAIT DIRE NON — la même ESN saisie sous deux casses ne rend qu’UNE ligne', async () => {
      // Reproduction du défaut réel : « Capgemini » (déclarée sur un compte)
      // et « CAPGEMINI » (détectée par l'analyse sur un autre) sont deux
      // lignes `account_partners` DISTINCTES, sur deux comptes distincts.
      const { svc } = service(
        [],
        [
          { name: 'Capgemini', account_id: 'acc-1', account_name: 'Orange', rank: 'unknown' },
          { name: 'CAPGEMINI', account_id: 'acc-2', account_name: 'SNCF', rank: 'rank1' },
        ],
      )

      const result = await svc.onMyAccounts('w1')

      expect(result).toHaveLength(1)
      // #2151.62 — la liste des comptes NOMMÉS, pas seulement leur nombre.
      expect(result[0]).toEqual({
        name: 'Capgemini',
        accounts: 2,
        rank1: 1,
        rank2: 0,
        knownRelationship: 0,
        observedAtAccounts: 0,
        unresolvedAtAccounts: 0,
        rank2Observations: { measured: false },
        certainty: null,
        accountsList: [
          { id: 'acc-1', name: 'Orange' },
          { id: 'acc-2', name: 'SNCF' },
        ],
      })
    })

    // #2298.8 — `detected_at` voyage désormais avec la ligne brute jusqu'au
    // bout du service, pas seulement dans `esn-on-accounts-merge.spec.ts`
    // (qui teste la fonction pure isolément).
    it('#2298.8 — une présence rang 2 datée ressort en observation « déjà sous-traitée »', async () => {
      const { svc } = service(
        [],
        [
          {
            name: 'Halden Numérique',
            account_id: 'acc-1',
            account_name: 'Nova Logistique',
            rank: 'rank2',
            detected_at: '2026-08-08T00:00:00.000Z',
          },
        ],
      )

      const result = await svc.onMyAccounts('w1')

      expect(result[0]?.rank2Observations).toEqual({
        measured: true,
        count: 1,
        mostRecentAt: '2026-08-08T00:00:00.000Z',
        kinds: ['already_subcontracted'],
      })
    })

    it('TÉMOIN — deux ESN réellement distinctes restent deux lignes', async () => {
      const { svc } = service(
        [],
        [
          { name: 'Novéris Digital', account_id: 'acc-1', rank: 'unknown' },
          { name: 'Kaerneo Systems', account_id: 'acc-2', rank: 'unknown' },
        ],
      )

      const result = await svc.onMyAccounts('w1')

      expect(result).toHaveLength(2)
      expect(result.map(r => r.name).sort()).toEqual(['Kaerneo Systems', 'Novéris Digital'])
    })

    it('interroge bien SON espace, et rien d’autre', async () => {
      const { svc, repo } = service([], [{ name: 'Capgemini', account_id: 'acc-1', rank: 'unknown' }])
      await svc.onMyAccounts('w1')
      expect(repo.manager.query).toHaveBeenCalledWith(expect.stringContaining('workspace_id'), ['w1'])
      expect(repo.manager.query).toHaveBeenCalledWith(expect.stringContaining('dismissed_at IS NULL'), ['w1'])
    })
  })

  describe('onMyAccounts — #2151.32 « clients observés », depuis la mémoire marché', () => {
    it('compte un compte OBSERVÉ, et interroge chaque compte UNE seule fois', async () => {
      const { svc, marketObservation } = service(
        [],
        [
          { name: 'Capgemini', account_id: 'acc-1', account_name: 'Orange', rank: 'unknown' },
          { name: 'Capgemini', account_id: 'acc-1', account_name: 'Orange', rank: 'rank1' },
        ],
        { marketObservation: () => ({ status: 'ok', observedEsnKeys: [marketMatchKey('Capgemini')] }) },
      )

      const result = await svc.onMyAccounts('w1')

      expect(result[0]).toMatchObject({ observedAtAccounts: 1, unresolvedAtAccounts: 0 })
      expect(marketObservation).toHaveBeenCalledTimes(1)
    })

    it('un compte NON RÉSOLU par la mémoire marché compte « inconnu », jamais « non observé »', async () => {
      const { svc } = service(
        [],
        [{ name: 'Capgemini', account_id: 'acc-1', account_name: 'Orange', rank: 'unknown' }],
        { marketObservation: () => ({ status: 'unknown' }) },
      )

      const result = await svc.onMyAccounts('w1')

      expect(result[0]).toMatchObject({ observedAtAccounts: 0, unresolvedAtAccounts: 1 })
    })

    it('une ligne SANS nom de compte (fenêtre de déploiement) n’interroge pas la mémoire marché', async () => {
      const { svc, marketObservation } = service([], [{ name: 'Capgemini', account_id: 'acc-1', rank: 'unknown' }])

      const result = await svc.onMyAccounts('w1')

      expect(marketObservation).not.toHaveBeenCalled()
      expect(result[0]).toMatchObject({ observedAtAccounts: 0, unresolvedAtAccounts: 0 })
    })
  })

  /* ------------------------------------------------------------------ */
  /*  #1798 — les ESN qui collent au profil                              */
  /* ------------------------------------------------------------------ */

  describe('profileMatches — le listing géographique, sans passer par le territoire', () => {
    const esnRow = (overrides: Record<string, unknown> = {}) => ({
      inputName: 'Klanik',
      legalName: null,
      siren: null,
      headquartersCity: 'Lyon',
      headquartersDepartment: '69',
      sizeClass: 'pme',
      openToSubcontracting: 'inconnu',
      ...overrides,
    })

    it('nomme la cause quand AUCUNE zone n’est déclarée — jamais une liste vide muette', async () => {
      const { svc } = service([], [], { answers: { geo_zones: [] } })
      const result = await svc.profileMatches('u1')
      expect(result).toEqual({ status: 'no_geo_signal', reason: 'unset', geoZones: [], matches: [] })
    })

    it('nomme la cause quand les zones ne désignent aucun territoire précis', async () => {
      const { svc } = service([], [], { answers: { geo_zones: ['International', 'National (toute la France)'] } })
      const result = await svc.profileMatches('u1')
      expect(result.status).toBe('no_geo_signal')
      expect(result.reason).toBe('unmappable')
      expect(result.matches).toEqual([])
    })

    it('interroge le référentiel sur le département-ANCRE de la zone déclarée', async () => {
      const byDepartment = jest.fn((department: string) => (department === '69' ? [esnRow()] : []))
      const { svc, esnDirectory } = service([], [], {
        answers: { geo_zones: ['Lyon & Auvergne-Rhône-Alpes'] },
        byDepartment,
      })
      const result = await svc.profileMatches('u1')

      expect(esnDirectory.byDepartment).toHaveBeenCalledWith('69', 50)
      expect(result.status).toBe('matched')
      expect(result.matches).toEqual([
        { name: 'Klanik', city: 'Lyon', department: '69', sizeClass: 'pme', openToSubcontracting: 'inconnu' },
      ])
    })

    it('interroge UN département par zone déclarée, dédoublonnés', async () => {
      const byDepartment = jest.fn(() => [])
      const { svc } = service([], [], {
        answers: { geo_zones: ['Paris & Île-de-France', 'Marseille & PACA', 'Paris & Île-de-France'] },
        byDepartment,
      })
      await svc.profileMatches('u1')
      expect(byDepartment).toHaveBeenCalledTimes(2)
    })

    it('RÉUTILISE le filtre de #1799 — une phrase de repli n’est pas un nom d’ESN', async () => {
      const { svc } = service([], [], {
        answers: { geo_zones: ['Lyon & Auvergne-Rhône-Alpes'] },
        byDepartment: () => [esnRow({ inputName: 'Aucun concurrent ESN identifié' })],
      })
      const result = await svc.profileMatches('u1')
      expect(result.matches).toEqual([])
    })

    it('RÉUTILISE stripCertaintyDecoration — la certitude ne vit pas dans le nom', async () => {
      const { svc } = service([], [], {
        answers: { geo_zones: ['Lyon & Auvergne-Rhône-Alpes'] },
        byDepartment: () => [esnRow({ inputName: 'Klanik — probable' })],
      })
      const result = await svc.profileMatches('u1')
      expect(result.matches[0]?.name).toBe('Klanik')
    })

    it('dédoublonne par SIREN quand deux départements rendent la même ESN', async () => {
      const { svc } = service([], [], {
        answers: { geo_zones: ['Paris & Île-de-France', 'Lyon & Auvergne-Rhône-Alpes'] },
        byDepartment: () => [esnRow({ siren: '123456789' })],
      })
      const result = await svc.profileMatches('u1')
      expect(result.matches).toHaveLength(1)
    })

    it('TÉMOIN — un vrai nom d’ESN avec un « & » n’est pas confondu avec une phrase de repli', async () => {
      const { svc } = service([], [], {
        answers: { geo_zones: ['Lyon & Auvergne-Rhône-Alpes'] },
        byDepartment: () => [esnRow({ inputName: 'Business & Decision' })],
      })
      const result = await svc.profileMatches('u1')
      expect(result.matches.map(m => m.name)).toEqual(['Business & Decision'])
    })
  })

  describe('#3270 (BEL-SC-241) — la gouvernance rang 2, sur la MÊME ligne', () => {
    it('une relation neuve rend le statut "observed" et un risque "blocking"', async () => {
      const { svc } = service([base])
      const [view] = await svc.list('w1')
      expect(view?.governanceStatus).toBe('observed')
      expect(view?.governanceReadiness.risk).toBe('blocking')
      expect(view?.governanceReadiness.missing).toContain('margin_floor')
    })

    it('updateGovernance pose les champs fournis et laisse les autres intacts (formulaire générique, c75)', async () => {
      const { svc, repo } = service([{ ...base, stage: 'contacte' }])
      const updated = await svc.updateGovernance('w1', 'p1', {
        marginFloorPercent: 12,
        accountsAccessible: ['Société Générale'],
      })
      expect(updated?.governance.marginFloorPercent).toBe(12)
      expect(updated?.governance.accountsAccessible).toEqual(['Société Générale'])
      expect(updated?.governance.entryDoorScope).toBeNull()
      expect(repo.save).toHaveBeenCalled()
    })

    it('poser un motif de pause arme pausedAt, et le statut devient "paused" avant toute autre lecture', async () => {
      const { svc } = service([{ ...base, stage: 'flux_actif' }])
      const updated = await svc.updateGovernance('w1', 'p1', { pausedReason: 'Le partenaire réorganise son équipe.' })
      expect(updated?.pausedAt).not.toBeNull()
      expect(updated?.governanceStatus).toBe('paused')
    })

    it('poser `pausedReason: null` lève la pause et efface la date avec elle', async () => {
      const { svc } = service([{ ...base, stage: 'flux_actif', pausedAt: new Date('2026-09-01'), pausedReason: 'x' }])
      const updated = await svc.updateGovernance('w1', 'p1', { pausedReason: null })
      expect(updated?.pausedAt).toBeNull()
      expect(updated?.pausedReason).toBeNull()
    })

    it('ne met à jour rien dans un autre espace', async () => {
      const { svc, repo } = service([])
      const updated = await svc.updateGovernance('autre-espace', 'p1', { marginFloorPercent: 5 })
      expect(updated).toBeNull()
      expect(repo.save).not.toHaveBeenCalled()
    })
  })
})
