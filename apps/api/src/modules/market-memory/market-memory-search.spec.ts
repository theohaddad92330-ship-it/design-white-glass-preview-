import { BadRequestException } from '@nestjs/common'
import { MARKET_ESN_OBSERVED_MIN_PATHS, MARKET_MEMORY_MIN_PATHS } from '@bellum/contracts'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { getMetadataArgsStorage } from 'typeorm'
import { MarketCompanyAliasEntity } from '../../database/entities/market-company-alias.entity'
import { MarketCompanyResolutionOverrideEntity } from '../../database/entities/market-company-resolution-override.entity'
import { MarketCompanySignalEntity } from '../../database/entities/market-company-signal.entity'
import { MarketCompanyStackEntity } from '../../database/entities/market-company-stack.entity'
import { MarketEsnClientEntity } from '../../database/entities/market-esn-client.entity'
import { MarketExEsnAtClientEntity } from '../../database/entities/market-ex-esn-at-client.entity'
import { MarketMemoryService } from './market-memory.service'

/**
 * #1596.6-10 / #1628.1 — `searchByFilters` : la mémoire marché interrogée PAR
 * CRITÈRE, jamais par identité.
 *
 * Ce que cette suite tient, et qui n'est pas décoratif :
 *  1. une recherche SANS filtre est REFUSÉE avant d'exécuter la moindre
 *     requête — pas seulement découragée dans une description ;
 *  2. le seuil `MARKET_MEMORY_MIN_PATHS` s'applique DANS la méthode, même si
 *     la requête simulée ne le fait pas elle-même ;
 *  3. aucune identité de personne ne sort de la forme rendue ;
 *  4. une entreprise ne sort jamais deux fois de la même méthode.
 */

type Row = Record<string, unknown>

function signalRow(overrides: Row = {}): Row {
  return {
    companyKey: 'thales',
    companyName: 'Thales',
    matchKey: 'thales',
    websiteDomain: 'thalesgroup.com',
    pathsTotal: 41,
    roleFamilies: [{ family: 'Data', persons: 12 }],
    city: 'Paris',
    region: 'Île-de-France',
    country: 'France',
    ...overrides,
  }
}

/** Le même style de double que `market-memory-stacks.spec.ts` : un
 *  query-builder chainable dont `getMany` rend les lignes du test. */
function searchQueryBuilder(rows: Row[]) {
  const builder = {
    where: jest.fn(() => builder),
    andWhere: jest.fn(() => builder),
    orderBy: jest.fn(() => builder),
    limit: jest.fn(() => builder),
    getMany: jest.fn().mockResolvedValue(rows),
  }
  return builder
}

async function buildService(options: {
  searchRows?: Row[]
  esnRows?: Row[]
  stackRows?: Row[]
  exEsnRows?: Row[]
  /** #1961.21 — les lignes du corpus que le rapprochement du PORTEFEUILLE lit (`candidatesByRef`). */
  portfolioCandidateRows?: Row[]
  /** #1961.21 — une panne de cette lecture-là, et d'elle seule. */
  portfolioReadError?: Error
  /** #1617.4 — les décisions humaines de l'espace. */
  overrideRows?: Row[]
}) {
  const qb = searchQueryBuilder(options.searchRows ?? [])
  const createQueryBuilder = jest.fn(() => qb)
  const signalsRepo = {
    findOne: jest.fn().mockResolvedValue(null),
    find: options.portfolioReadError
      ? jest.fn().mockRejectedValue(options.portfolioReadError)
      : jest.fn().mockResolvedValue(options.portfolioCandidateRows ?? []),
    createQueryBuilder,
  }
  const esnFind = jest.fn().mockResolvedValue(options.esnRows ?? [])
  const stacksFind = jest.fn().mockResolvedValue(options.stackRows ?? [])
  const exEsnFind = jest.fn().mockResolvedValue(options.exEsnRows ?? [])

  const moduleRef = await Test.createTestingModule({
    providers: [
      MarketMemoryService,
      { provide: getRepositoryToken(MarketCompanySignalEntity), useValue: signalsRepo },
      { provide: getRepositoryToken(MarketEsnClientEntity), useValue: { find: esnFind } },
      { provide: getRepositoryToken(MarketCompanyStackEntity), useValue: { find: stacksFind } },
      { provide: getRepositoryToken(MarketExEsnAtClientEntity), useValue: { find: exEsnFind } },
      { provide: getRepositoryToken(MarketCompanyAliasEntity), useValue: { find: jest.fn().mockResolvedValue([]) } },
      // #1617.4 — vide par défaut : la table laisse le classement
      // byte-identique au chemin d'avant le lot.
      {
        provide: getRepositoryToken(MarketCompanyResolutionOverrideEntity),
        useValue: { find: jest.fn().mockResolvedValue(options.overrideRows ?? []) },
      },
    ],
  }).compile()

  return {
    service: moduleRef.get(MarketMemoryService),
    qb,
    createQueryBuilder,
    signalsFind: signalsRepo.find,
    esnFind,
    stacksFind,
    exEsnFind,
  }
}

describe('searchByFilters — le refus SERVEUR sans filtre discriminant', () => {
  it('REFUSE un objet vide, SANS exécuter de requête', async () => {
    const { service, createQueryBuilder } = await buildService({})

    await expect(service.searchByFilters({})).rejects.toThrow(BadRequestException)
    expect(createQueryBuilder).not.toHaveBeenCalled()
  })

  it('`limit` seul ne compte pas comme un filtre discriminant', async () => {
    const { service, createQueryBuilder } = await buildService({})

    await expect(service.searchByFilters({ limit: 5 })).rejects.toThrow(BadRequestException)
    expect(createQueryBuilder).not.toHaveBeenCalled()
  })

  it('un filtre texte fait uniquement d’espaces ne compte pas non plus', async () => {
    const { service, createQueryBuilder } = await buildService({})

    await expect(service.searchByFilters({ technology: '   ' })).rejects.toThrow(BadRequestException)
    expect(createQueryBuilder).not.toHaveBeenCalled()
  })

  it('un seul filtre numérique suffit (`employeeMin`)', async () => {
    const { service, qb } = await buildService({ searchRows: [signalRow()] })

    const read = await service.searchByFilters({ employeeMin: 500 })

    expect(read.status).toBe('ok')
    expect(qb.andWhere).toHaveBeenCalledWith('signal.headcount_max >= :employeeMin', { employeeMin: 500 })
  })
})

describe('searchByFilters — le seuil, DANS la méthode', () => {
  it('exclut une entreprise sous MARKET_MEMORY_MIN_PATHS même si la requête simulée ne le fait pas', async () => {
    const rows = [
      signalRow({ companyKey: 'thales', companyName: 'Thales', pathsTotal: 41 }),
      // Une requête réelle ne devrait jamais rendre cette ligne (le SQL filtre
      // déjà `paths_total >= :minPaths`) — mais le test simule un `getMany`
      // qui la rend quand même, pour prouver que le SEUIL ne dépend pas
      // uniquement du SQL.
      signalRow({ companyKey: 'petit', companyName: 'Petit Corp', pathsTotal: MARKET_MEMORY_MIN_PATHS - 1 }),
    ]
    const { service, qb } = await buildService({ searchRows: rows })

    const read = await service.searchByFilters({ technology: 'java' })

    expect(read.status).toBe('ok')
    if (read.status !== 'ok') return
    expect(read.matches.map(match => match.companyName)).toEqual(['Thales'])
    // Le SQL applique aussi le seuil — la garde double, pas la garde seule.
    expect(qb.where).toHaveBeenCalledWith('signal.paths_total >= :minPaths', {
      minPaths: MARKET_MEMORY_MIN_PATHS,
    })
  })

  it('rend une liste VIDE, jamais `unavailable`, quand personne ne passe le seuil', async () => {
    const { service } = await buildService({
      searchRows: [signalRow({ pathsTotal: MARKET_MEMORY_MIN_PATHS - 1 })],
    })

    const read = await service.searchByFilters({ technology: 'java' })

    expect(read).toEqual({ status: 'ok', matches: [], truncated: false })
  })
})

/**
 * LOT 18 (GA-326) — le plafond dur (`MARKET_SEARCH_MAX_LIMIT`, 50) existait
 * déjà, mais `MarketMemorySearchRead` ne portait aucun `total` : impossible
 * de dire si la borne avait mordu. Même motif que `list_agenda`/
 * `find_free_slots` (GA-317, côté IA) : sur-lire d'UN de plus que la limite
 * demandée, couper à la limite, dire si le témoin surnuméraire est arrivé.
 */
describe('searchByFilters — le drapeau de troncature (LOT 18)', () => {
  it('sur-lit d’UN par rapport à la limite demandée', async () => {
    const { service, qb } = await buildService({ searchRows: [] })

    await service.searchByFilters({ technology: 'java', limit: 10 })

    expect(qb.limit).toHaveBeenCalledWith(11)
  })

  it('coupe à la limite affichée et porte `truncated: true` quand le témoin surnuméraire arrive', async () => {
    const rows = Array.from({ length: 3 }, (_v, i) => signalRow({ companyKey: `c${i}`, companyName: `C${i}` }))
    const { service } = await buildService({ searchRows: rows })

    const read = await service.searchByFilters({ technology: 'java', limit: 2 })

    expect(read.status).toBe('ok')
    if (read.status !== 'ok') return
    expect(read.matches).toHaveLength(2)
    expect(read.truncated).toBe(true)
  })

  it('ne prétend JAMAIS une troncature qui n’a pas eu lieu — exactement la limite, sans rien de plus', async () => {
    const rows = Array.from({ length: 2 }, (_v, i) => signalRow({ companyKey: `c${i}`, companyName: `C${i}` }))
    const { service } = await buildService({ searchRows: rows })

    const read = await service.searchByFilters({ technology: 'java', limit: 2 })

    expect(read.status).toBe('ok')
    if (read.status !== 'ok') return
    expect(read.matches).toHaveLength(2)
    expect(read.truncated).toBe(false)
  })
})

describe('searchByFilters — aucune identité de personne ne sort', () => {
  it('la forme rendue ne porte que des comptages et des libellés d’entreprise', async () => {
    const { service } = await buildService({
      searchRows: [signalRow({ datasetVersion: '2026.09.1' })],
      esnRows: [{ clientKey: 'thales', esnName: 'Capgemini', persons: 5 }],
      stackRows: [{ companyKey: 'thales', techno: 'java', persons: 12 }],
      exEsnRows: [{ clientKey: 'thales', persons: 3 }],
    })

    const read = await service.searchByFilters({ technology: 'java' })

    expect(read.status).toBe('ok')
    if (read.status !== 'ok') return
    const [match] = read.matches
    expect(match).toBeDefined()

    // La forme EXACTE — un champ ajouté sans y être inscrit ici fait tomber ce
    // test, et c'est le but : c'est comme ça qu'une identité se glisserait.
    // `datasetVersion` (#3212.3, reste épopée #3235) : la révision du CORPUS,
    // jamais une identité de personne — safe à ajouter ici.
    expect(Object.keys(match).sort()).toEqual(['companyName', 'coverage'])
    expect(Object.keys(match.coverage).sort()).toEqual(
      [
        'covered',
        'datasetVersion',
        'esnObserved',
        'exEsnPresent',
        'marketPaths',
        'observedStack',
        'observedZone',
        'roleFamilies',
      ].sort(),
    )
    expect(match.coverage.datasetVersion).toBe('2026.09.1')

    // Ni adresse e-mail, ni lien de réseau social, ni numéro de téléphone —
    // même en cherchant dans le JSON complet, pas seulement les clés connues.
    const serialised = JSON.stringify(match)
    for (const forbidden of ['@', 'linkedin', 'phone', 'téléphone', 'fullName', 'full_name']) {
      expect(serialised.toLowerCase().includes(forbidden.toLowerCase())).toBe(false)
    }
  })

  it('une ESN vue par une seule personne compte comme observée (#4016 L10 — même plancher que `coverageFor`)', async () => {
    const { service } = await buildService({
      searchRows: [signalRow()],
      esnRows: [{ clientKey: 'thales', esnName: 'Capgemini', persons: 1 }],
    })

    const read = await service.searchByFilters({ technology: 'java' })

    expect(read.status).toBe('ok')
    if (read.status !== 'ok') return
    expect(read.matches[0]?.coverage.esnObserved).toEqual([{ esnName: 'Capgemini', persons: 1, certainty: 'faible' }])
  })
})

/**
 * #1961.21 — LE LIEN VERS LA SURFACE PROPRIÉTAIRE.
 *
 * Quand une entreprise trouvée est AUSSI un compte du portefeuille de l'espace
 * appelant, le résultat porte la route de sa fiche. La règle qui tient tout le
 * reste : **par domaine, ou par une décision humaine — jamais par nom seul**.
 * Deux référentiels ne se joignent pas par le nom (« SG SOCIETE GENERALE » ne
 * rencontre pas « SOCIETE GENERALE »), et un mauvais lien envoie le commercial
 * sur la fiche d'une autre entreprise — pire que pas de lien.
 *
 * Le service ne connaît pas l'espace : il reçoit un portefeuille DÉJÀ scopé par
 * son appelant (même contrat que `portfolioFor`). Le cloisonnement se prouve
 * donc au bord, dans `copilot-bridge.controller.spec.ts`.
 */
describe('searchByFilters — #1961.21 : le lien vers la fiche du compte, par DOMAINE, jamais par nom seul', () => {
  const ACCOUNT = '3f1f4a6e-1f8b-4a2e-9d4c-2b7c9e0a1d55'
  const OTHER = '9b2d7c1e-4a3f-4e8b-8c6d-1f2e3a4b5c6d'
  const WORKSPACE = 'w-1'

  it('porte la route de la fiche quand un compte du portefeuille partage le domaine de l’entreprise', async () => {
    const { service } = await buildService({ searchRows: [signalRow()], portfolioCandidateRows: [signalRow()] })

    const read = await service.searchByFilters(
      { technology: 'java' },
      // Le sous-domaine et le chemin ne séparent pas deux sites : le domaine RACINE tranche.
      {
        portfolio: [{ ref: ACCOUNT, name: 'Thales SA', website: 'https://www.thalesgroup.com/fr' }],
        workspaceId: WORKSPACE,
      },
    )

    if (read.status !== 'ok') throw new Error('lecture attendue')
    expect(read.matches[0]?.accountRoute).toBe(`/accounts/${ACCOUNT}`)
  })

  it('SAIT DIRE NON — un compte qui ne partage que le NOM ne porte aucun lien', async () => {
    const { service } = await buildService({ searchRows: [signalRow()], portfolioCandidateRows: [signalRow()] })

    const read = await service.searchByFilters(
      { technology: 'java' },
      { portfolio: [{ ref: ACCOUNT, name: 'Thales', website: null }], workspaceId: WORKSPACE },
    )

    if (read.status !== 'ok') throw new Error('lecture attendue')
    expect(read.matches[0]).not.toHaveProperty('accountRoute')
  })

  it('SAIT DIRE NON — quand l’arbitre retient le NOM parce que le domaine hésite, aucun lien', async () => {
    // Deux entreprises du corpus portent le même domaine (une filiale et sa
    // maison mère) : le domaine ne départage pas, le nom tranche — et un
    // rapprochement par nom ne donne pas de lien, même si le domaine y était.
    const parent = signalRow()
    const filiale = signalRow({
      companyKey: 'thales-services',
      companyName: 'Thales Services',
      matchKey: 'thales services',
      pathsTotal: 9,
    })
    const { service } = await buildService({ searchRows: [parent], portfolioCandidateRows: [parent, filiale] })

    const read = await service.searchByFilters(
      { technology: 'java' },
      { portfolio: [{ ref: ACCOUNT, name: 'Thales', website: 'https://thalesgroup.com' }], workspaceId: WORKSPACE },
    )

    if (read.status !== 'ok') throw new Error('lecture attendue')
    expect(read.matches[0]).not.toHaveProperty('accountRoute')
  })

  it('ne lie rien quand DEUX comptes du portefeuille désignent la même entreprise — une ambiguïté ne se tranche pas au hasard', async () => {
    const { service } = await buildService({ searchRows: [signalRow()], portfolioCandidateRows: [signalRow()] })

    const read = await service.searchByFilters(
      { technology: 'java' },
      {
        portfolio: [
          { ref: ACCOUNT, name: 'Thales SA', website: 'https://thalesgroup.com' },
          { ref: OTHER, name: 'Thales France', website: 'https://www.thalesgroup.com' },
        ],
        workspaceId: WORKSPACE,
      },
    )

    if (read.status !== 'ok') throw new Error('lecture attendue')
    expect(read.matches[0]).not.toHaveProperty('accountRoute')
  })

  it('« ce n’est pas exact » retire le lien — une correction humaine gagne toujours', async () => {
    const { service } = await buildService({
      searchRows: [signalRow()],
      portfolioCandidateRows: [signalRow()],
      overrideRows: [
        {
          accountId: ACCOUNT,
          workspaceId: WORKSPACE,
          decision: 'dismissed',
          marketCompanyKey: null,
          reviewedAt: new Date('2026-09-10T10:00:00.000Z'),
          reviewedBy: 'reviewer',
        },
      ],
    })

    const read = await service.searchByFilters(
      { technology: 'java' },
      { portfolio: [{ ref: ACCOUNT, name: 'Thales SA', website: 'https://thalesgroup.com' }], workspaceId: WORKSPACE },
    )

    if (read.status !== 'ok') throw new Error('lecture attendue')
    expect(read.matches[0]).not.toHaveProperty('accountRoute')
  })

  it('« c’est bien cette entreprise » porte le lien, même sans domaine commun — la décision n’est pas un nom', async () => {
    const { service } = await buildService({
      searchRows: [signalRow()],
      portfolioCandidateRows: [signalRow()],
      overrideRows: [
        {
          accountId: ACCOUNT,
          workspaceId: WORKSPACE,
          decision: 'confirmed',
          marketCompanyKey: 'thales',
          reviewedAt: new Date('2026-09-10T10:00:00.000Z'),
          reviewedBy: 'reviewer',
        },
      ],
    })

    const read = await service.searchByFilters(
      { technology: 'java' },
      { portfolio: [{ ref: ACCOUNT, name: 'Groupe T', website: null }], workspaceId: WORKSPACE },
    )

    if (read.status !== 'ok') throw new Error('lecture attendue')
    expect(read.matches[0]?.accountRoute).toBe(`/accounts/${ACCOUNT}`)
  })

  it('sans portefeuille, la forme est celle d’avant ce lot et AUCUNE lecture de plus ne part', async () => {
    const { service, signalsFind } = await buildService({ searchRows: [signalRow()] })

    const read = await service.searchByFilters({ technology: 'java' })

    if (read.status !== 'ok') throw new Error('lecture attendue')
    expect(Object.keys(read.matches[0] ?? {}).sort()).toEqual(['companyName', 'coverage'])
    expect(signalsFind).not.toHaveBeenCalled()
  })

  it('ne relit que les comptes qui PEUVENT porter un lien — un compte sans domaine commun ni décision ne coûte aucune requête', async () => {
    const { service, signalsFind } = await buildService({
      searchRows: [signalRow()],
      portfolioCandidateRows: [signalRow()],
    })

    await service.searchByFilters(
      { technology: 'java' },
      { portfolio: [{ ref: ACCOUNT, name: 'Thales', website: 'https://autre-site.example' }], workspaceId: WORKSPACE },
    )

    expect(signalsFind).not.toHaveBeenCalled()
  })

  it('une panne du rapprochement ne fait pas tomber la recherche — les entreprises sortent, sans lien', async () => {
    const { service } = await buildService({
      searchRows: [signalRow()],
      portfolioReadError: new Error('connexion perdue'),
    })
    const warn = jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined)

    const read = await service.searchByFilters(
      { technology: 'java' },
      { portfolio: [{ ref: ACCOUNT, name: 'Thales SA', website: 'https://thalesgroup.com' }], workspaceId: WORKSPACE },
    )

    expect(read.status).toBe('ok')
    if (read.status !== 'ok') return
    expect(read.matches.map(match => match.companyName)).toEqual(['Thales'])
    expect(read.matches[0]).not.toHaveProperty('accountRoute')
    expect(warn).toHaveBeenCalled()
  })
})

describe('searchByFilters — panne de lecture', () => {
  it('rend `unavailable`, jamais une liste vide, quand la requête jette', async () => {
    const qb = searchQueryBuilder([])
    qb.getMany.mockRejectedValue(new Error('connexion perdue'))
    const createQueryBuilder = jest.fn(() => qb)
    const moduleRef = await Test.createTestingModule({
      providers: [
        MarketMemoryService,
        {
          provide: getRepositoryToken(MarketCompanySignalEntity),
          useValue: { findOne: jest.fn(), find: jest.fn(), createQueryBuilder },
        },
        { provide: getRepositoryToken(MarketEsnClientEntity), useValue: { find: jest.fn() } },
        { provide: getRepositoryToken(MarketCompanyStackEntity), useValue: { find: jest.fn() } },
        { provide: getRepositoryToken(MarketExEsnAtClientEntity), useValue: { find: jest.fn() } },
        { provide: getRepositoryToken(MarketCompanyAliasEntity), useValue: { find: jest.fn() } },
        // #1617.4 — aucune correction humaine ici : vide, la table laisse le
        // classement byte-identique au chemin d'avant le lot.
        {
          provide: getRepositoryToken(MarketCompanyResolutionOverrideEntity),
          useValue: { find: jest.fn().mockResolvedValue([]) },
        },
      ],
    }).compile()
    const service = moduleRef.get(MarketMemoryService)
    jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined)

    const read = await service.searchByFilters({ technology: 'java' })

    expect(read).toEqual({ status: 'unavailable', reason: 'read_failed' })
  })
})

describe('searchByFilters — la limite', () => {
  it('borne une limite excessive au plafond', async () => {
    const { service, qb } = await buildService({ searchRows: [] })

    await service.searchByFilters({ technology: 'java', limit: 9999 })

    // LOT 18 (GA-326) — sur-lecture d'UN par rapport au plafond (51), pour
    // savoir si le corpus réel le dépasse.
    expect(qb.limit).toHaveBeenCalledWith(51)
  })

  it('applique le défaut sans `limit`', async () => {
    const { service, qb } = await buildService({ searchRows: [] })

    await service.searchByFilters({ technology: 'java' })

    // LOT 18 (GA-326) — même sur-lecture d'UN par rapport au défaut (21).
    expect(qb.limit).toHaveBeenCalledWith(21)
  })

  // ── La localisation observée plie les ACCENTS ────────────────────────────
  //
  // ⚠️⚠️ Mesuré en production le 11/09/2026 : `location=Île-de-France` rendait
  // ZÉRO résultat quand `location=Ile-de-France` en rendait trois. `ILIKE` est
  // insensible à la casse, pas aux accents — et le corpus stocke la forme nue
  // pendant que les fiches (comme les gens qui tapent) portent l'accent. Une
  // capacité entière s'affichait vide à cause de ce seul caractère.

  it('plie les DEUX côtés — la colonne et le terme cherché', async () => {
    const { service, qb } = await buildService({})
    await service.searchByFilters({ location: 'Île-de-France' })

    const call = (qb.andWhere as jest.Mock).mock.calls.find(([sql]) => String(sql).includes('signal.city'))
    expect(call).toBeDefined()
    const [sql, params] = call as [string, Record<string, unknown>]

    // La colonne est pliée en SQL…
    expect(sql).toContain('translate(lower(signal.city)')
    expect(sql).toContain('translate(lower(signal.region)')
    expect(sql).toContain('translate(lower(signal.country)')
    // …et `ILIKE` n'a plus de raison d'être : `lower()` fait déjà la casse.
    expect(sql).not.toContain('ILIKE')
    // …le terme aussi, sinon rien ne se rencontre.
    expect(params['location']).toBe('%ile-de-france%')
  })

  it('SAIT DIRE NON — un terme non plié ne rencontrerait pas la colonne pliée', async () => {
    const { service, qb } = await buildService({})
    await service.searchByFilters({ location: 'Île-de-France' })
    const call = (qb.andWhere as jest.Mock).mock.calls.find(([sql]) => String(sql).includes('signal.city'))
    const params = (call as [string, Record<string, unknown>])[1]
    // Le témoin du défaut : c'est EXACTEMENT cette valeur qui était envoyée
    // avant, et qui ne pouvait rencontrer aucune ligne du corpus.
    expect(params['location']).not.toBe('%Île-de-France%')
  })

  it("n'attrape pas ce qu'elle ne vise pas — un terme sans accent est inchangé", async () => {
    const { service, qb } = await buildService({})
    await service.searchByFilters({ location: 'Paris' })
    const call = (qb.andWhere as jest.Mock).mock.calls.find(([sql]) => String(sql).includes('signal.city'))
    expect((call as [string, Record<string, unknown>])[1]['location']).toBe('%paris%')
  })
})

/**
 * #1961.5 — VILLE et RÉGION, séparées de `location`.
 *
 * `location` reste le repli large (ville OU région OU pays, une seule
 * question) : il n'est pas retiré, il ne suffisait pas. `city`/`region`
 * ciblent CHACUN une seule colonne — département reste absent : le corpus
 * (`MarketCompanySignalEntity`) ne porte que `city`/`region`/`country`,
 * aucune donnée départementale n'existe à filtrer sans l'inventer.
 */
describe('searchByFilters — #1961.5 : ville et région, chacune SA colonne', () => {
  it('un `city` seul est un discriminant valide — pas de refus serveur', async () => {
    const { service } = await buildService({})
    await expect(service.searchByFilters({ city: 'Lyon' })).resolves.toMatchObject({ status: 'ok' })
  })

  it('un `region` seul est un discriminant valide — pas de refus serveur', async () => {
    const { service } = await buildService({})
    await expect(service.searchByFilters({ region: 'Bretagne' })).resolves.toMatchObject({ status: 'ok' })
  })

  it('`city` filtre SEULEMENT `signal.city` — jamais région ni pays', async () => {
    const { service, qb } = await buildService({})
    await service.searchByFilters({ city: 'Lyon' })
    const call = (qb.andWhere as jest.Mock).mock.calls.find(
      ([sql]) => String(sql).includes(':city') && !String(sql).includes(':location'),
    )
    expect(call).toBeDefined()
    const [sql, params] = call as [string, Record<string, unknown>]
    expect(sql).toContain('signal.city')
    expect(sql).not.toContain('signal.region')
    expect(sql).not.toContain('signal.country')
    // Même pliage accents/casse que `location` — « Lyon » comme « lyon ».
    expect(sql).toContain('translate(lower(signal.city)')
    expect(params['city']).toBe('%lyon%')
  })

  it('`region` filtre SEULEMENT `signal.region` — jamais ville ni pays', async () => {
    const { service, qb } = await buildService({})
    await service.searchByFilters({ region: 'Île-de-France' })
    const call = (qb.andWhere as jest.Mock).mock.calls.find(
      ([sql]) => String(sql).includes(':region') && !String(sql).includes(':location'),
    )
    expect(call).toBeDefined()
    const [sql, params] = call as [string, Record<string, unknown>]
    expect(sql).toContain('signal.region')
    expect(sql).not.toContain('signal.city')
    expect(sql).not.toContain('signal.country')
    expect(params['region']).toBe('%ile-de-france%')
  })

  it('`city` ET `region` se combinent — deux critères, deux `andWhere` distincts', async () => {
    const { service, qb } = await buildService({})
    await service.searchByFilters({ city: 'Lyon', region: 'Bretagne' })
    const cityCall = (qb.andWhere as jest.Mock).mock.calls.find(([sql]) => String(sql).includes(':city'))
    const regionCall = (qb.andWhere as jest.Mock).mock.calls.find(([sql]) => String(sql).includes(':region'))
    expect(cityCall).toBeDefined()
    expect(regionCall).toBeDefined()
  })
})

/**
 * #2991 (#2287.15) — LA TAILLE, distincte de `employeeMin`/`employeeMax`.
 *
 * `headcountBracket` est une donnée RÉELLE du corpus (`tranche_effectif` à
 * l'ingestion, ex. « 51-200 ») — jamais dérivée des bornes chiffrées, qui
 * restent un filtre séparé. Égalité pliée (accents/casse), pas une
 * sous-chaîne : une tranche est une valeur FERMÉE du corpus, jamais un
 * fragment à chercher dedans.
 */
describe('searchByFilters — #2991 (#2287.15) : la taille, sa propre colonne', () => {
  it('un `size` seul est un discriminant valide — pas de refus serveur', async () => {
    const { service } = await buildService({})
    await expect(service.searchByFilters({ size: '51-200' })).resolves.toMatchObject({ status: 'ok' })
  })

  it('filtre sur `signal.headcount_bracket`, en ÉGALITÉ pliée — jamais employeeMin/Max', async () => {
    const { service, qb } = await buildService({})
    await service.searchByFilters({ size: 'Île-de-France 51-200' })
    const call = (qb.andWhere as jest.Mock).mock.calls.find(([sql]) => String(sql).includes(':size'))
    expect(call).toBeDefined()
    const [sql, params] = call as [string, Record<string, unknown>]
    expect(sql).toContain('signal.headcount_bracket')
    expect(sql).toContain('translate(lower(signal.headcount_bracket)')
    expect(sql).not.toContain('LIKE')
    expect(params['size']).toBe('ile-de-france 51-200')
  })
})

/**
 * #2991 (#2287.17) — LE RECOURS EXTERNE OBSERVÉ, GÉNÉRIQUE : distinct de `esn`
 * (une société de services NOMMÉE). Même nom et même doctrine que le filtre
 * jumeau du registre Découvrir (`externalRecourseObserved`,
 * `discover-market-memory.service.ts`, #2165.28/.30, GA-259) : un seul mot
 * pour le même concept, jamais deux vocabulaires pour la même chose.
 *
 * ⚠️ Doctrine c65/GA-259 : ne filtre QUE sur `true`. `false` n'affirme jamais
 * qu'une entreprise « n'externalise pas » — ce serait le vocabulaire interdit
 * (#1961.20) appliqué à un filtre plutôt qu'à une phrase.
 */
describe('searchByFilters — #2991 (#2287.17) : recours externe observé, générique', () => {
  it('`externalRecourseObserved: true` est un discriminant valide', async () => {
    const { service } = await buildService({})
    await expect(service.searchByFilters({ externalRecourseObserved: true })).resolves.toMatchObject({
      status: 'ok',
    })
  })

  it('ajoute une clause EXISTS sur `market_esn_client`, avec le plancher, SANS restriction de nom', async () => {
    const { service, qb } = await buildService({})
    await service.searchByFilters({ externalRecourseObserved: true })
    const call = (qb.andWhere as jest.Mock).mock.calls.find(([sql]) => String(sql).includes('market_esn_client'))
    expect(call).toBeDefined()
    const [sql, params] = call as [string, Record<string, unknown>]
    expect(sql).not.toContain('esn_name ILIKE')
    expect(params['minEsnPersons']).toBe(MARKET_ESN_OBSERVED_MIN_PATHS)
  })

  it('SAIT DIRE NON — `externalRecourseObserved: false` ne compte pas comme discriminant', async () => {
    const { service, createQueryBuilder } = await buildService({})
    await expect(service.searchByFilters({ externalRecourseObserved: false })).rejects.toThrow(BadRequestException)
    expect(createQueryBuilder).not.toHaveBeenCalled()
  })
})

/**
 * #2991 (#2287.14) — LE TYPE D'ENTREPRISE : `signal.is_service_company`
 * (`est_esn` à l'ingestion), une colonne RÉELLE, jamais lue nulle part avant ce
 * lot (`git grep` : zéro appelant hors entité/import). C'est la SEULE
 * classification que porte le corpus — filtrée sous son propre nom
 * (`isServiceCompany`), jamais sous « type d'entreprise » qui promettrait une
 * taxonomie plus large que ce qui est réellement mesuré.
 *
 * ⚠️ Même doctrine que {@link externalRecourseObserved} (c65/GA-259) : ne
 * filtre QUE sur `true`. `false` n'affirme jamais qu'une entreprise « n'est
 * pas une société de services » — la colonne défaut à `false` à l'ingestion
 * quand la cellule est vide (voir l'entité), donc `false` mélange « mesuré
 * non-ESN » et « non mesuré ».
 */
describe('searchByFilters — #2991 (#2287.14) : type d’entreprise (société de services)', () => {
  it('`isServiceCompany: true` est un discriminant valide', async () => {
    const { service } = await buildService({})
    await expect(service.searchByFilters({ isServiceCompany: true })).resolves.toMatchObject({ status: 'ok' })
  })

  it('filtre sur `signal.is_service_company = true`', async () => {
    const { service, qb } = await buildService({})
    await service.searchByFilters({ isServiceCompany: true })
    const call = (qb.andWhere as jest.Mock).mock.calls.find(([sql]) => String(sql).includes('is_service_company'))
    expect(call).toBeDefined()
    const [sql] = call as [string]
    expect(sql).toContain('signal.is_service_company = true')
  })

  it('SAIT DIRE NON — `isServiceCompany: false` ne compte pas comme discriminant', async () => {
    const { service, createQueryBuilder } = await buildService({})
    await expect(service.searchByFilters({ isServiceCompany: false })).rejects.toThrow(BadRequestException)
    expect(createQueryBuilder).not.toHaveBeenCalled()
  })
})

/**
 * #2991 (#2287.4/.7/.11) — la garde de la DOCTRINE écrite sur
 * `MarketCompanySignalEntity` (voir son docblock, section « CE QUE LA TABLE
 * NE PORTE PAS, EXPRÈS ») : secteur/NAF, département et « famille de
 * compétences » (distincte de `role_families`) n'ont AUCUNE colonne source
 * dans le corpus partagé — cinq vérifications indépendantes (25/09, 26/09
 * ×2, 27/09) l'ont confirmé, la dernière l'a écrit et datée.
 *
 * Cette garde LIT les colonnes réelles de l'entité plutôt que de répéter la
 * conclusion : si une colonne `sector`/`naf`/`department`/`skillFamily`
 * apparaît un jour (nouvelle ingestion), CETTE ligne échoue — le signal que
 * la doctrine doit être relue et, si l'ingestion change vraiment, réécrite.
 * Une garde qui ne lirait que sa propre conclusion ne saurait jamais dire NON.
 */
describe('MarketCompanySignalEntity — #2991 : la doctrine sur les 3 axes absents se lit, elle ne se répète pas', () => {
  it('ne déclare aucune colonne secteur/NAF, département, ou famille de compétences distincte de role_families', () => {
    const columns = getMetadataArgsStorage().columns.filter(column => column.target === MarketCompanySignalEntity)
    // Corpus non vide : si l'entité perdait ses colonnes, la boucle ci-dessous
    // ne vérifierait plus rien en restant verte.
    expect(columns.length).toBeGreaterThan(0)
    const names = columns.map(column => String(column.options.name ?? column.propertyName).toLowerCase())
    for (const forbidden of ['sector', 'naf', 'department', 'departement', 'skillfamily', 'competencefamily']) {
      expect(names.some(name => name.includes(forbidden))).toBe(false)
    }
  })

  /**
   * 28/09/2026 — Décision Louis : « l'ingestion part des données DÉJÀ
   * collectées en base ; aucun nouveau fournisseur, aucun nouvel appel
   * réseau. » `accounts.sector`/`accounts.naf_code` (Registry NAF/APE, Phase
   * 1) ET `esn_directory.naf_code`/`.headquarters_department` sont bien DÉJÀ
   * en base — vérifié ce tour. Rejoindre l'un ou l'autre sur
   * `market_company_signal` a été écarté, PAS parce que la donnée manque,
   * mais parce que la jointure violerait une règle déjà écrite plus haut dans
   * ce docblock : « Aucun `account_id`[…] l'invariant du dépôt est qu'aucun
   * account n'est créé ni fusionné par un import de marché » — écrire un
   * secteur SCOPÉ ESPACE (`accounts.sector`) sur une table PARTAGÉE entre
   * tous les espaces romprait exactement l'invariant voisin, cité juste
   * au-dessus : « Une correction d'espace PRIME sur l'observation partagée,
   * et ne la réécrit jamais : on ne modifie pas une mémoire commune depuis un
   * seul espace. » `esn_directory` est bien PARTAGÉ (pas de conflit d'espace),
   * mais ne couvre que les entreprises qui SONT des ESN (`is_service_company`)
   * — une fraction du corpus, pas la dimension générale demandée par
   * #2287.4/.7 — et sa clé de rapprochement (nom normalisé / domaine curés à
   * la main) n'est pas celle, déjà documentée fragile, de
   * `market-company-resolution.ts`. Cette garde prouve la PRÉMISSE de ce
   * refus, pas la conclusion entière (qu'une relecture seule peut trancher) :
   * la table n'a et n'aura jamais de colonne scopée espace.
   */
  it('ne porte, et ne pourra jamais porter, de colonne SCOPÉE ESPACE (workspace_id/account_id) — la raison du refus de joindre `accounts`', () => {
    const columns = getMetadataArgsStorage().columns.filter(column => column.target === MarketCompanySignalEntity)
    expect(columns.length).toBeGreaterThan(0)
    const names = columns.map(column => String(column.options.name ?? column.propertyName).toLowerCase())
    for (const scoped of ['workspace_id', 'workspaceid', 'account_id', 'accountid']) {
      expect(names.some(name => name.includes(scoped))).toBe(false)
    }
  })
})
