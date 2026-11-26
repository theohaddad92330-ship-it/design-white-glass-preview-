import { DataforgeService } from './dataforge.service'
import type { DataforgeAccountEntity } from '../../database/entities/dataforge-account.entity'
import type { DataforgeAccountDomainEntity } from '../../database/entities/dataforge-account-domain.entity'

/**
 * Le service, testé sur ses DEUX règles de fond :
 *  - une panne de registre ne marque jamais « non résolu » (le compte redevient
 *    `pending`) ;
 *  - un Tier D ne sort JAMAIS dans `evidence` — il ne vit que dans `priors`.
 */
describe('DataforgeService', () => {
  function build(overrides: {
    claimed?: unknown
    entries?: unknown[]
    account?: Partial<DataforgeAccountEntity> | null
    /** Plusieurs comptes pour un même SIREN : l'index `siren` n'est PAS unique. */
    sirenMatches?: Partial<DataforgeAccountEntity>[]
    domains?: Partial<DataforgeAccountDomainEntity>[]
  }) {
    const accountUpdates: [unknown, unknown][] = []
    const matches = overrides.sirenMatches ?? (overrides.account ? [overrides.account] : [])
    const accounts = {
      query: jest.fn().mockResolvedValue(overrides.claimed ?? [[], 0]),
      update: jest.fn().mockImplementation((id: unknown, patch: unknown) => {
        accountUpdates.push([id, patch])
        return Promise.resolve()
      }),
      find: jest.fn().mockResolvedValue(matches),
      count: jest.fn().mockResolvedValue(0),
    }
    const domains = {
      find: jest.fn().mockResolvedValue(overrides.domains ?? []),
      count: jest.fn().mockResolvedValue(0),
      query: jest.fn().mockResolvedValue([]),
    }
    const ia = { esnResolve: jest.fn().mockResolvedValue({ entries: overrides.entries ?? [] }) }
    const service = new DataforgeService(accounts as never, domains as never, ia as never)
    return { service, accounts, domains, ia, accountUpdates }
  }

  it('résout un lot : le SIREN du registre est écrit, la panne redevient pending', async () => {
    const { service, ia, accountUpdates } = build({
      // ⚠️ Forme UPDATE…RETURNING de TypeORM : [lignes, nombre].
      claimed: [
        [
          { id: 'id-veolia', name: 'Veolia' },
          { id: 'id-inconnu', name: 'Société Fantôme' },
        ],
        2,
      ],
      entries: [
        { inputName: 'Veolia', status: 'resolved', siren: '403210032', legalName: 'VEOLIA ENVIRONNEMENT' },
        // « Société Fantôme » absente de la réponse = panne/pas de réponse.
      ],
    })
    const result = await service.resolvePending(25)
    expect(result).toEqual({ attempted: 2, resolved: 1 })
    expect(ia.esnResolve).toHaveBeenCalledWith({ names: ['Veolia', 'Société Fantôme'] })
    expect(accountUpdates).toContainEqual([
      'id-veolia',
      expect.objectContaining({ resolutionStatus: 'resolved', siren: '403210032' }),
    ])
    // La panne ne conclut RIEN : le compte redevient disponible.
    expect(accountUpdates).toContainEqual(['id-inconnu', { resolutionStatus: 'pending' }])
  })

  it('un registre qui répond « unresolved » l’écrit avec sa raison, sans SIREN', async () => {
    const { service, accountUpdates } = build({
      claimed: [[{ id: 'id-x', name: 'X' }], 1],
      entries: [{ inputName: 'X', status: 'unresolved', reason: 'aucun candidat au registre' }],
    })
    const result = await service.resolvePending(25)
    expect(result).toEqual({ attempted: 1, resolved: 0 })
    expect(accountUpdates).toContainEqual([
      'id-x',
      expect.objectContaining({ resolutionStatus: 'unresolved', resolutionReason: 'aucun candidat au registre' }),
    ])
  })

  it('priorsForSiren : SIREN inconnu du pack rend null — jamais un objet vide', async () => {
    const { service } = build({ account: null })
    expect(await service.priorsForSiren('123456789')).toBeNull()
  })

  it('priorsForSiren : le Tier D reste dans priors, jamais dans evidence', async () => {
    const { service } = build({
      account: {
        sourceId: 'DF-1',
        name: 'Veolia',
        marketRole: 'buyer',
        procurementRoute: 'Panel groupe',
        procurementPolicy: 'RESEARCH_SEED_ONLY__DO_NOT_PRESENT_ROUTE_AS_DOMAIN_VERIFIED_UNTIL_EVIDENCED',
        researchTier: 'T1',
      } as DataforgeAccountEntity,
      domains: [
        {
          domainCode: 'CYBER_IAM_GRC',
          evidenceTier: 'D',
          sectorPriorDemandScore: 3,
          externalizableDemandScore: null,
          commercialOpportunityScore: null,
          userClaimPolicy: 'SECTOR_PRIOR_ONLY__NEVER_PRESENT_AS_FACT_OR_OPPORTUNITY',
          evidenceSummary: null,
          evidenceSources: null,
        },
        {
          domainCode: 'FINANCE_FPNA',
          evidenceTier: 'A',
          sectorPriorDemandScore: 4,
          externalizableDemandScore: 5,
          commercialOpportunityScore: 4,
          userClaimPolicy: 'CAN_SUPPORT_USER_CLAIM_IF_SOURCE_SHOWN_AND_SCOPE_FRESH__STILL_VERIFY_FOR_ACTION',
          evidenceSummary: 'Mission FP&A externalisée 2025',
          evidenceSources: 'https://exemple.example/source',
        },
      ],
    })
    const priors = await service.priorsForSiren('403210032')
    if (priors?.kind !== 'priors') throw new Error('priors attendus')
    expect(priors.evidence.map(row => row.domainCode)).toEqual(['FINANCE_FPNA'])
    expect(priors.priors).toHaveLength(2)
    // Les tiers forts d'abord : A avant D.
    expect(priors.priors[0]?.tier).toBe('A')
    expect(priors.account.procurementRouteSeed).toBe('Panel groupe')
  })

  /**
   * L'index `dataforge_accounts_siren_idx` n'est PAS unique, et il ne peut pas
   * l'être : le pack V10 livre DF-0014 et DF-0415 — deux fiches du même Groupe
   * Martin Belaysoud, même SIREN `352463574`, même grappe. Un `findOne` y
   * rendait une ligne arbitraire : demander les priors de l'un pouvait rendre
   * ceux de l'autre. 40 grappes, 85 comptes : le cas est généralisable.
   *
   * La sortie n'est pas de fusionner (on PROPOSE une fusion, on ne fusionne
   * jamais) ni de rendre l'index unique (l'ingestion refuserait une donnée
   * vraie). C'est de LIRE `is_cluster_primary`, écrite par le pack et jusqu'ici
   * jamais lue — et de refuser de deviner quand elle ne tranche pas.
   */
  const belaysoud = [
    {
      sourceId: 'DF-0014',
      name: 'GROUPE MARTIN BELAYSOUD',
      clusterId: 'AC-9312108973A6',
      isClusterPrimary: true,
      marketRole: 'buyer',
      procurementRoute: 'Panel groupe',
      procurementPolicy: null,
      researchTier: 'T2',
    },
    {
      sourceId: 'DF-0415',
      name: 'Groupe Martin Belaysoud',
      clusterId: 'AC-9312108973A6',
      isClusterPrimary: false,
      marketRole: null,
      procurementRoute: null,
      procurementPolicy: null,
      researchTier: null,
    },
  ] as DataforgeAccountEntity[]

  it('deux comptes d’une MÊME grappe pour un SIREN : le primaire tranche, jamais le hasard', async () => {
    const { service, domains } = build({ sirenMatches: [...belaysoud].reverse(), domains: [] })
    const priors = await service.priorsForSiren('352463574')
    if (priors?.kind !== 'priors') throw new Error('priors attendus')
    expect(priors.account.sourceId).toBe('DF-0014')
    // La variante n'est ni effacée ni fusionnée : elle est NOMMÉE.
    expect(priors.account.variantSourceIds).toEqual(['DF-0415'])
    expect(priors.account.clusterId).toBe('AC-9312108973A6')
    // Et les domaines lus sont ceux du primaire, pas ceux d'une ligne au hasard.
    expect(domains.find).toHaveBeenCalledWith({ where: { sourceId: 'DF-0014' } })
  })

  it('deux comptes de grappes DIFFÉRENTES : on ne devine pas, on le dit', async () => {
    const { service, domains } = build({
      sirenMatches: [
        { ...belaysoud[0], clusterId: 'AC-1111' },
        { ...belaysoud[1], clusterId: 'AC-2222', isClusterPrimary: true },
      ] as DataforgeAccountEntity[],
    })
    const result = await service.priorsForSiren('352463574')
    expect(result).toEqual({
      kind: 'ambiguous',
      siren: '352463574',
      sourceIds: ['DF-0014', 'DF-0415'],
      reason: expect.stringContaining('grappes'),
    })
    // Une ambiguïté ne lit RIEN : lire l'un des deux serait déjà avoir choisi.
    expect(domains.find).not.toHaveBeenCalled()
  })

  it('une grappe sans primaire désigné est une ambiguïté, pas un tirage au sort', async () => {
    const { service } = build({
      sirenMatches: belaysoud.map(account => ({ ...account, isClusterPrimary: false })) as DataforgeAccountEntity[],
    })
    const result = await service.priorsForSiren('352463574')
    expect(result).toMatchObject({ kind: 'ambiguous', reason: expect.stringContaining('primaire') })
  })

  it('couverture : les collisions de SIREN et les priors de domaine sont COMPTÉS', async () => {
    const { service, accounts, domains } = build({})
    accounts.query.mockImplementation((sql: string) => {
      if (sql.includes('resolution_status')) return Promise.resolve([{ status: 'resolved', n: 4 }])
      return Promise.resolve([{ n: 1 }])
    })
    domains.query.mockImplementation((sql: string) => {
      if (sql.includes('evidence_tier')) return Promise.resolve([{ tier: 'D', n: 76871 }])
      return Promise.resolve([{ n: 78870 }])
    })
    const coverage = await service.coverage()
    expect(coverage.sirenCollisions).toBe(1)
    expect(coverage.domainPriorRows).toBe(78870)
    // Le back-office lit AUSSI ce qu'on a écarté : « on ne l'a pas ingéré »
    // n'est utile que quand on peut voir pourquoi.
    expect(coverage.discardedColumns).toHaveLength(5)
    expect(coverage.discardedColumns.every(entry => entry.reason.length > 40)).toBe(true)
  })

  it('le kill-switch coupe le cron sans toucher la base', async () => {
    const { service, accounts } = build({})
    process.env['DATAFORGE_RESOLUTION_DISABLED'] = 'true'
    try {
      await service.refreshResolution()
      expect(accounts.query).not.toHaveBeenCalled()
    } finally {
      delete process.env['DATAFORGE_RESOLUTION_DISABLED']
    }
  })
})
