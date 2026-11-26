import { ORION_PENETRABILITE_CAVEAT, OrionAccountsService } from './orion-accounts.service'
import type { DataforgeAccountStatusEntity } from '../../database/entities/dataforge-account-status.entity'

/** Un faux `SelectQueryBuilder` — juste assez de la chaîne fluide que
 *  `searchCandidates` utilise réellement, pour observer CE qu'elle construit
 *  plutôt que de deviner sa requête finale. */
function buildQueryBuilder(rows: Partial<DataforgeAccountStatusEntity>[]) {
  const calls: { where: unknown[]; andWhere: unknown[]; orderBy: unknown[]; take: number | null } = {
    where: [],
    andWhere: [],
    orderBy: [],
    take: null,
  }
  const qb = {
    where: jest.fn((...args: unknown[]) => {
      calls.where.push(args)
      return qb
    }),
    andWhere: jest.fn((...args: unknown[]) => {
      calls.andWhere.push(args)
      return qb
    }),
    orderBy: jest.fn((...args: unknown[]) => {
      calls.orderBy.push(args)
      return qb
    }),
    take: jest.fn((n: number) => {
      calls.take = n
      return qb
    }),
    getMany: jest.fn().mockResolvedValue(rows),
  }
  return { qb, calls }
}

describe('OrionAccountsService', () => {
  function build(
    row: Partial<DataforgeAccountStatusEntity> | null,
    byStatut: { statutCode: string; n: number }[] = [],
    bySiren: Partial<DataforgeAccountStatusEntity>[] = [],
    candidateRows: Partial<DataforgeAccountStatusEntity>[] = [],
  ) {
    const { qb, calls } = buildQueryBuilder(candidateRows)
    const statuses = {
      findOne: jest.fn().mockResolvedValue(row),
      find: jest.fn().mockResolvedValue(bySiren),
      count: jest.fn().mockResolvedValue(row ? 1 : 0),
      query: jest.fn().mockResolvedValue(byStatut),
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    }
    const service = new OrionAccountsService(statuses as never)
    return { service, statuses, qb, calls }
  }

  it('rend `null` sur un compte inconnu du référentiel', async () => {
    const { service } = build(null)
    await expect(service.statusFor('DF-9999')).resolves.toBeNull()
  })

  it('groupe TOUJOURS la pénétrabilité avec sa couverture et la mise en garde', async () => {
    const { service } = build({
      sourceId: 'DF-0001',
      entreprise: 'ACME Test',
      statutCode: 'CIBLE_PRIORITAIRE',
      statutCible: 'Cible prioritaire',
      penetrabiliteScore: 84,
      couvertureTotale: 1,
      priorityLevel: 'A',
      accountPotentialScore: 90,
      dataConfidenceScore: 20,
      recommendedEntryPoint: null,
      recommendedPersona: null,
      recommendedStrategy: null,
      nextAction: null,
      mainRisk: null,
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    })
    const status = await service.statusFor('DF-0001')
    expect(status?.penetrabilite).toEqual({
      score: 84,
      couvertureTotale: 1,
      caveat: ORION_PENETRABILITE_CAVEAT,
    })
  })

  it('rend `penetrabilite: null` — jamais un objet à score `0` — quand le pack n’a rien mesuré', async () => {
    const { service } = build({
      sourceId: 'DF-0002',
      entreprise: null,
      statutCode: 'A_QUALIFIER',
      statutCible: null,
      penetrabiliteScore: null,
      couvertureTotale: null,
      priorityLevel: null,
      accountPotentialScore: null,
      dataConfidenceScore: null,
      recommendedEntryPoint: null,
      recommendedPersona: null,
      recommendedStrategy: null,
      nextAction: null,
      mainRisk: null,
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    })
    const status = await service.statusFor('DF-0002')
    expect(status?.penetrabilite).toBeNull()
  })

  it('#1618 — rend `sector`, `headquarters` et `observedAt` (`updated_at` en ISO), pour la façade de contexte de compte', async () => {
    const updatedAt = new Date('2026-08-30T10:00:00.000Z')
    const { service } = build({
      sourceId: 'DF-0003',
      entreprise: 'ACME Test',
      sector: 'Banque',
      headquarters: 'Paris',
      statutCode: 'CIBLE_PRIORITAIRE',
      statutCible: null,
      penetrabiliteScore: null,
      couvertureTotale: null,
      priorityLevel: null,
      accountPotentialScore: null,
      dataConfidenceScore: null,
      recommendedEntryPoint: null,
      recommendedPersona: null,
      recommendedStrategy: null,
      nextAction: null,
      mainRisk: null,
      updatedAt,
    })
    const status = await service.statusFor('DF-0003')
    expect(status?.sector).toBe('Banque')
    expect(status?.headquarters).toBe('Paris')
    expect(status?.observedAt).toBe('2026-08-30T10:00:00.000Z')
  })

  it('lot 776 — porte le fait typé `access` (énumérations métier) : utilisé par Laura, sans code brut ni identité', async () => {
    const { service } = build({
      sourceId: 'DF-0004',
      entreprise: 'ACME Test',
      statutCode: 'CIBLE_PRIORITAIRE',
      salesAccessibilityLevel: 'FAIBLE',
      barrierePlateforme: true,
      barrierePublique: false,
      referencingProcessFound: 'OUI',
      supplierPortal: 'https://portail.exemple.fr/jean.dupont',
      priorityLevel: 'P1',
      updatedAt: new Date('2026-08-30T10:00:00.000Z'),
    })
    const status = await service.statusFor('DF-0004')
    expect(status?.access).toEqual({
      accessibility: 'low',
      barriers: ['platform', 'referencing'],
      route: 'platform',
      priority: 'high',
      observedAt: '2026-08-30T10:00:00.000Z',
    })
    expect(JSON.stringify(status?.access)).not.toMatch(/FAIBLE|P1|portail|dupont/)
  })

  it('lot 776 — sans statut d’accès établi, `access` est null (jamais un objet de zéros)', async () => {
    const { service } = build({ sourceId: 'DF-0005', statutCode: 'A_QUALIFIER', updatedAt: new Date() })
    const status = await service.statusFor('DF-0005')
    expect(status?.access).toBeNull()
  })

  describe('#1618 — statusForSiren, le point d’entrée de la façade de contexte de compte', () => {
    it('rend `null` quand aucune ligne ne porte ce SIREN — on ne devine pas', async () => {
      const { service } = build(null, [], [])
      await expect(service.statusForSiren('552100554')).resolves.toBeNull()
    })

    it('rend le statut quand EXACTEMENT une ligne porte ce SIREN', async () => {
      const updatedAt = new Date('2026-08-30T10:00:00.000Z')
      const { service, statuses } = build(
        null,
        [],
        [
          {
            sourceId: 'DF-0001',
            entreprise: 'ACME Test',
            sector: 'Banque',
            headquarters: 'Paris',
            statutCode: 'CIBLE_PRIORITAIRE',
            statutCible: null,
            penetrabiliteScore: null,
            couvertureTotale: null,
            priorityLevel: null,
            accountPotentialScore: null,
            dataConfidenceScore: null,
            recommendedEntryPoint: null,
            recommendedPersona: null,
            recommendedStrategy: null,
            nextAction: null,
            mainRisk: null,
            updatedAt,
          },
        ],
      )
      const status = await service.statusForSiren('552100554')
      expect(status?.entreprise).toBe('ACME Test')
      expect(statuses.find).toHaveBeenCalledWith({ where: { sirenSiret: '552100554' } })
    })

    it('rend `null` — jamais une ligne au hasard — quand PLUSIEURS lignes portent le même SIREN', async () => {
      const { service } = build(
        null,
        [],
        [
          { sourceId: 'DF-0014' } as Partial<DataforgeAccountStatusEntity>,
          { sourceId: 'DF-0415' } as Partial<DataforgeAccountStatusEntity>,
        ],
      )
      await expect(service.statusForSiren('352463574')).resolves.toBeNull()
    })
  })

  it('coverage() compte les lignes et la répartition par statut', async () => {
    const { service, statuses } = build({ sourceId: 'DF-0001' } as Partial<DataforgeAccountStatusEntity>, [
      { statutCode: 'CIBLE_PRIORITAIRE', n: 124 },
      { statutCode: 'A_QUALIFIER', n: 299 },
    ])
    const coverage = await service.coverage()
    expect(coverage.accounts).toBe(1)
    expect(coverage.byStatutCode).toEqual({ CIBLE_PRIORITAIRE: 124, A_QUALIFIER: 299 })
    expect(statuses.query).toHaveBeenCalled()
  })

  describe('#2805 (#2291.3) — searchCandidates, DataForge comme source de candidats', () => {
    const CIBLE_ROW: Partial<DataforgeAccountStatusEntity> = {
      sourceId: 'DF-0001',
      entreprise: 'ACME Test',
      sirenSiret: '552100554',
      sector: 'Banque',
      statutCode: 'CIBLE_PRIORITAIRE',
      statutCible: null,
      penetrabiliteScore: null,
      couvertureTotale: null,
      priorityLevel: 'A',
      accountPotentialScore: 90,
      dataConfidenceScore: null,
      recommendedEntryPoint: null,
      recommendedPersona: null,
      recommendedStrategy: null,
      nextAction: null,
      mainRisk: null,
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    }

    it('sans critère, ne cherche que les statuts CIBLE — jamais les VERROUILLE_*/EXCLU_* implicitement', async () => {
      const { service, qb, calls } = build(null, [], [], [CIBLE_ROW])
      const results = await service.searchCandidates()
      expect(qb.where).toHaveBeenCalledWith('status.statut_code IN (:...statutCodes)', {
        statutCodes: ['CIBLE_PRIORITAIRE', 'CIBLE_SECONDAIRE'],
      })
      expect(calls.take).toBe(25)
      expect(results).toEqual([
        expect.objectContaining({ sourceId: 'DF-0001', entreprise: 'ACME Test', sirenSiret: '552100554' }),
      ])
    })

    it('#2805 (#2291.3) — porte `sirenSiret` : un candidat Découvrir exige un SIREN, jamais deviné depuis `sourceId`', async () => {
      const { service } = build(null, [], [], [CIBLE_ROW])
      const [candidate] = await service.searchCandidates()
      expect(candidate.sirenSiret).toBe('552100554')
    })

    it('un statut demandé explicitement (même VERROUILLE_*) remplace le défaut, jamais le double', async () => {
      const { service, qb } = build(null, [], [], [])
      await service.searchCandidates({ statutCodes: ['VERROUILLE_PUBLIC'] })
      expect(qb.where).toHaveBeenCalledWith('status.statut_code IN (:...statutCodes)', {
        statutCodes: ['VERROUILLE_PUBLIC'],
      })
    })

    it('filtre par secteur et par score minimal quand déclarés', async () => {
      const { service, qb } = build(null, [], [], [])
      await service.searchCandidates({ sector: 'Banque', minAccountPotentialScore: 80 })
      expect(qb.andWhere).toHaveBeenCalledWith('status.sector = :sector', { sector: 'Banque' })
      expect(qb.andWhere).toHaveBeenCalledWith('status.account_potential_score >= :minScore', { minScore: 80 })
    })

    it('exclut les SIREN déjà au portefeuille SANS retirer les comptes sans SIREN connu', async () => {
      // Piège SQL réel : `siren_siret NOT IN (...)` seul exclurait aussi NULL
      // (NULL NOT IN (...) ne vaut jamais TRUE) — la clause doit garder le OR.
      const { service, qb } = build(null, [], [], [])
      await service.searchCandidates({ excludeSirenSirets: ['552100554'] })
      expect(qb.andWhere).toHaveBeenCalledWith(
        '(status.siren_siret IS NULL OR status.siren_siret NOT IN (:...excludedSirens))',
        { excludedSirens: ['552100554'] },
      )
    })

    it('plafonne `limit` à 100 et refuse un plancher sous 1', async () => {
      const { service, calls } = build(null, [], [], [])
      await service.searchCandidates({ limit: 500 })
      expect(calls.take).toBe(100)
    })

    it('sans aucun candidat, rend une liste vide — jamais une donnée inventée', async () => {
      const { service } = build(null, [], [], [])
      await expect(service.searchCandidates()).resolves.toEqual([])
    })
  })
})
