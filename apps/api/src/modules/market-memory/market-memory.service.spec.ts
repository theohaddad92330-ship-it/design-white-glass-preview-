import { MARKET_REVIEW_QUEUE_MAX, marketMemorySearchReadSchema } from '@bellum/contracts'
import { Logger } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { MarketCompanyAliasEntity } from '../../database/entities/market-company-alias.entity'
import { MarketCompanyResolutionOverrideEntity } from '../../database/entities/market-company-resolution-override.entity'
import { MarketCompanySignalEntity } from '../../database/entities/market-company-signal.entity'
import { MarketCompanyStackEntity } from '../../database/entities/market-company-stack.entity'
import { MarketEsnClientEntity } from '../../database/entities/market-esn-client.entity'
import { MarketExEsnAtClientEntity } from '../../database/entities/market-ex-esn-at-client.entity'
import { MarketMemoryService } from './market-memory.service'

type Row = Record<string, unknown>

function signalRow(overrides: Row = {}): Row {
  return {
    companyKey: 'thales',
    companyName: 'Thales',
    matchKey: 'thales',
    websiteDomain: 'thalesgroup.com',
    pathsTotal: 41,
    roleFamilies: [{ family: 'Data', persons: 12 }],
    datasetVersion: '2026.09.1',
    ...overrides,
  }
}

async function buildService(repos: {
  signals?: Partial<Record<'findOne' | 'find', jest.Mock>>
  esnClients?: Partial<Record<'find', jest.Mock>>
  stacks?: Partial<Record<'find', jest.Mock>>
  exEsn?: Partial<Record<'find', jest.Mock>>
  /**
   * #1756 — la table d'alias, VIDE par défaut.
   *
   * ⚠️ Elle doit être fournie même quand le test ne parle pas d'alias : le
   * service l'injecte désormais, et une dépendance manquante fait échouer la
   * construction du module de test — pas l'assertion. Le défaut par défaut est
   * la table vide, c'est-à-dire l'état de production aujourd'hui, ce qui
   * garantit que tous les tests d'avant ce lot mesurent bien le chemin d'avant.
   */
  aliases?: Partial<Record<'find', jest.Mock>>
  /**
   * #1617.4 — les corrections humaines de rapprochement.
   *
   * Absent ⇒ table vide, et le classement est byte-identique à celui d'avant
   * le lot : c'est l'état nominal tant que personne n'a corrigé quoi que ce
   * soit, et c'est ce que la grande majorité des cas de cette suite décrit.
   */
  resolutionOverrides?: Partial<Record<'find' | 'upsert', jest.Mock>>
}) {
  const moduleRef = await Test.createTestingModule({
    providers: [
      MarketMemoryService,
      {
        provide: getRepositoryToken(MarketCompanySignalEntity),
        useValue: {
          findOne: jest.fn().mockResolvedValue(null),
          find: jest.fn().mockResolvedValue([]),
          ...repos.signals,
        },
      },
      {
        provide: getRepositoryToken(MarketEsnClientEntity),
        useValue: { find: jest.fn().mockResolvedValue([]), ...repos.esnClients },
      },
      {
        provide: getRepositoryToken(MarketCompanyStackEntity),
        useValue: { find: jest.fn().mockResolvedValue([]), ...repos.stacks },
      },
      {
        provide: getRepositoryToken(MarketExEsnAtClientEntity),
        useValue: { find: jest.fn().mockResolvedValue([]), ...repos.exEsn },
      },
      {
        provide: getRepositoryToken(MarketCompanyAliasEntity),
        useValue: { find: jest.fn().mockResolvedValue([]), ...repos.aliases },
      },
      // #1617.4 — aucune correction humaine ici : vide, la table laisse le
      // classement byte-identique au chemin d'avant le lot.
      {
        provide: getRepositoryToken(MarketCompanyResolutionOverrideEntity),
        useValue: {
          find: jest.fn().mockResolvedValue([]),
          upsert: jest.fn().mockResolvedValue({ identifiers: [] }),
          ...repos.resolutionOverrides,
        },
      },
    ],
  }).compile()

  return moduleRef.get(MarketMemoryService)
}

describe('resolve — le domaine avant le nom', () => {
  it('rapproche par domaine et le dit', async () => {
    const find = jest.fn().mockResolvedValue([signalRow()])
    const service = await buildService({ signals: { find } })

    const match = await service.resolve({ ref: 'a1', name: 'Thales', website: 'https://www.thalesgroup.com' })

    expect(match).toEqual({ companyKey: 'thales', strength: 'domain' })
    expect(find).toHaveBeenCalledWith({ where: { websiteDomain: 'thalesgroup.com' } })
  })

  it('retombe sur le nom quand il n’y a pas de site, et marque le rapprochement FAIBLE', async () => {
    const find = jest.fn().mockResolvedValue([signalRow()])
    const service = await buildService({ signals: { find } })

    const match = await service.resolve({ ref: 'a1', name: 'Groupe Thales', website: null })

    expect(match).toEqual({ companyKey: 'thales', strength: 'inferred' })
    expect(find).toHaveBeenCalledWith({ where: { matchKey: 'thales' } })
  })

  /**
   * #1617 — LE DÉFAUT QUE CE LOT CORRIGE, VU DEPUIS LE SERVICE.
   *
   * Deux entreprises homonymes dans le corpus. Avant, `findOne` en rendait une
   * — la première que la base voulait bien donner, sans `ORDER BY`. Le compte
   * héritait donc de la mémoire d'une entreprise choisie au hasard.
   */
  it('ne rapproche RIEN quand deux entreprises portent la même clé de nom', async () => {
    const find = jest.fn(async (query: { where: Record<string, unknown> }) =>
      'websiteDomain' in query.where
        ? []
        : [
            signalRow({ companyKey: 'orange telecom', pathsTotal: 150 }),
            signalRow({ companyKey: 'orange bank', pathsTotal: 12 }),
          ],
    )
    const service = await buildService({ signals: { find } })

    expect(await service.resolve({ ref: 'a1', name: 'Orange', website: null })).toBeNull()
    // Et la raison est DISPONIBLE, elle n'est pas perdue avec le `null`.
    expect(await service.resolveDetailed({ ref: 'a1', name: 'Orange', website: null })).toEqual({
      status: 'ambiguous',
      ambiguity: { on: 'name', candidates: 2 },
    })
  })

  it('départage deux homonymes par le PAYS quand l’appelant le connaît', async () => {
    const find = jest.fn(async (query: { where: Record<string, unknown> }) =>
      'websiteDomain' in query.where
        ? []
        : [
            signalRow({ companyKey: 'cgi france', country: 'FR', pathsTotal: 80 }),
            signalRow({ companyKey: 'cgi canada', country: 'CA', pathsTotal: 400 }),
          ],
    )
    const service = await buildService({ signals: { find } })

    const match = await service.resolve({ ref: 'a1', name: 'CGI', website: null, country: 'fr' })
    expect(match).toEqual({ companyKey: 'cgi france', strength: 'inferred' })
  })

  describe('quand le domaine et le nom DÉSIGNENT deux entreprises différentes', () => {
    /** Le cas réel : le domaine du GROUPE porté par une filiale du corpus.
     *
     *  ⚠️ #1617 — les candidats se rendent par `find`, pas par `findOne` :
     *  `match_key` et `website_domain` ne sont pas uniques, et `findOne` rendait
     *  la première ligne venue. Le mock rend donc des LISTES, comme la base. */
    function twoCandidates(domainRow: Row | null, nameRow: Row | null) {
      return jest.fn(async (query: { where: Record<string, unknown> }) =>
        'websiteDomain' in query.where ? (domainRow ? [domainRow] : []) : nameRow ? [nameRow] : [],
      )
    }

    it('préfère le NOM quand le candidat du domaine est sous le seuil — mesuré en production', async () => {
      // `group.bnpparibas` appartient, dans le corpus, à « BNP Paribas Personal
      // Investors » : 1 parcours. La maison mère, elle, en a 282.
      const service = await buildService({
        signals: {
          find: twoCandidates(
            signalRow({ companyKey: 'bnp paribas personal investors', pathsTotal: 1 }),
            signalRow({ companyKey: 'bnp paribas', matchKey: 'bnp paribas', pathsTotal: 282 }),
          ),
        },
      })

      const match = await service.resolve({ ref: 'a1', name: 'BNP Paribas', website: 'group.bnpparibas' })

      expect(match).toEqual({ companyKey: 'bnp paribas', strength: 'inferred' })
    })

    it('garde le DOMAINE quand les deux sont couverts — deux organisations distinctes, le domaine est l’identité', async () => {
      const service = await buildService({
        signals: {
          find: twoCandidates(
            signalRow({ companyKey: 'orange', pathsTotal: 40 }),
            signalRow({ companyKey: 'orange bank', matchKey: 'orange', pathsTotal: 12 }),
          ),
        },
      })

      const match = await service.resolve({ ref: 'a1', name: 'Orange', website: 'https://orange.com' })

      expect(match).toEqual({ companyKey: 'orange', strength: 'domain' })
    })

    it('garde le DOMAINE quand aucun des deux n’est couvert — il reste le plus sûr', async () => {
      const service = await buildService({
        signals: {
          find: twoCandidates(
            signalRow({ companyKey: 'filiale', pathsTotal: 1 }),
            signalRow({ companyKey: 'homonyme', matchKey: 'x', pathsTotal: 2 }),
          ),
        },
      })

      const match = await service.resolve({ ref: 'a1', name: 'X', website: 'https://filiale.fr' })

      expect(match?.companyKey).toBe('filiale')
    })
  })

  it('ne cherche RIEN sur un nom vide — une clé vide rapprocherait tout de tout', async () => {
    const find = jest.fn().mockResolvedValue([signalRow()])
    const service = await buildService({ signals: { find } })

    expect(await service.resolve({ ref: 'a1', name: '   ', website: null })).toBeNull()
    expect(find).not.toHaveBeenCalled()
  })
})

describe('coverageForMany — une lecture par table, pas par compte', () => {
  it('lit signaux, ESN, piles et ex-ESN UNE fois pour N comptes, et répartit par clé', async () => {
    const thales = signalRow()
    const airbus = signalRow({
      companyKey: 'airbus',
      companyName: 'Airbus',
      matchKey: 'airbus',
      websiteDomain: 'airbus.com',
    })
    const signals = {
      find: jest.fn(async (q: { where: Record<string, { value?: unknown[] } | unknown> }) => {
        if ('companyKey' in q.where) return [thales, airbus]
        const names = (q.where.matchKey as { value: unknown[] } | undefined)?.value ?? []
        return [thales, airbus].filter(row => names.includes(row.matchKey))
      }),
    }
    const esnClients = { find: jest.fn().mockResolvedValue([{ clientKey: 'thales', esnName: 'ALTEN', persons: 9 }]) }
    const stacks = { find: jest.fn().mockResolvedValue([{ companyKey: 'airbus', techno: 'java', persons: 39 }]) }
    const exEsn = { find: jest.fn().mockResolvedValue([{ clientKey: 'thales', persons: 4 }]) }
    const service = await buildService({ signals, esnClients, stacks, exEsn })

    const reads = await service.coverageForMany([
      { ref: 'a1', name: 'Thales' },
      { ref: 'a2', name: 'Airbus' },
    ])

    expect(esnClients.find).toHaveBeenCalledTimes(1)
    expect(stacks.find).toHaveBeenCalledTimes(1)
    expect(exEsn.find).toHaveBeenCalledTimes(1)
    const a1 = reads.get('a1')
    const a2 = reads.get('a2')
    if (a1?.status !== 'ok' || a2?.status !== 'ok') throw new Error('lecture attendue ok')
    expect(a1.coverage.esnObserved.map(e => e.esnName)).toEqual(['ALTEN'])
    expect(a1.coverage.exEsnPresent).toBe(4)
    expect(a1.coverage.observedStack).toEqual([])
    expect(a2.coverage.esnObserved).toEqual([])
    expect(a2.coverage.exEsnPresent).toBeNull()
    expect(a2.coverage.observedStack.map(s => s.techno)).toEqual(['java'])
  })

  it('une panne de lecture se nomme `unavailable`, jamais une couverture vide', async () => {
    const service = await buildService({
      signals: { find: jest.fn().mockResolvedValue([signalRow()]) },
      esnClients: { find: jest.fn().mockRejectedValue(new Error('db')) },
    })
    const reads = await service.coverageForMany([{ ref: 'a1', name: 'Thales' }])
    expect(reads.get('a1')).toEqual({ status: 'unavailable', reason: 'read_failed' })
  })
})

describe('coverageForMany — le rapprochement aussi est groupé (BELLUM-API-J)', () => {
  it('rapproche N comptes en UNE lecture par clé (nom, domaine), pas deux par compte', async () => {
    const thales = signalRow()
    const airbus = signalRow({
      companyKey: 'airbus',
      companyName: 'Airbus',
      matchKey: 'airbus',
      websiteDomain: 'airbus.com',
    })
    const all = [thales, airbus]
    const valuesOf = (operator: unknown): unknown[] => (operator as { value: unknown[] }).value
    const signals = {
      find: jest.fn(async (q: { where: Record<string, unknown> }) => {
        if ('companyKey' in q.where) return all
        if ('matchKey' in q.where) return all.filter(row => valuesOf(q.where.matchKey).includes(row.matchKey))
        return all.filter(row => valuesOf(q.where.websiteDomain).includes(row.websiteDomain))
      }),
    }
    const service = await buildService({
      signals,
      esnClients: { find: jest.fn().mockResolvedValue([]) },
      stacks: { find: jest.fn().mockResolvedValue([]) },
      exEsn: { find: jest.fn().mockResolvedValue([]) },
    })

    const reads = await service.coverageForMany([
      { ref: 'a1', name: 'Thales', website: 'https://thalesgroup.com' },
      { ref: 'a2', name: 'Airbus', website: 'https://airbus.com' },
      { ref: 'a3', name: 'Inconnue SA' },
    ])

    // domaine + nom + lecture finale par clé : 3 lectures, quel que soit N
    expect(signals.find).toHaveBeenCalledTimes(3)
    const a1 = reads.get('a1')
    const a2 = reads.get('a2')
    if (a1?.status !== 'ok' || a2?.status !== 'ok') throw new Error('lecture attendue ok')
    expect(a1.coverage.marketPaths).toBe(thales.pathsTotal)
    expect(a2.coverage.marketPaths).toBe(airbus.pathsTotal)
    // absent reste absent : une couverture vide, jamais inventée
    expect(reads.get('a3')).toEqual({ status: 'ok', coverage: expect.objectContaining({ covered: false }) })
  })
})

describe('coverageFor — le seuil, et rien que le seuil', () => {
  it('rend la couverture complète au-dessus du seuil, avec la certitude DÉRIVÉE', async () => {
    const service = await buildService({
      signals: { find: jest.fn().mockResolvedValue([signalRow()]), findOne: jest.fn().mockResolvedValue(signalRow()) },
      esnClients: {
        find: jest.fn().mockResolvedValue([
          { esnName: 'ALTEN', persons: 9 },
          { esnName: 'Groupe SII', persons: 3 },
          { esnName: 'Devoteam', persons: 1 },
        ]),
      },
      stacks: { find: jest.fn().mockResolvedValue([{ techno: 'java', persons: 39 }]) },
      exEsn: { find: jest.fn().mockResolvedValue([{ persons: 20 }, { persons: 3 }]) },
    })

    const read = await service.coverageFor({ ref: 'a1', name: 'Thales', website: 'https://thalesgroup.com' })

    expect(read.status).toBe('ok')
    if (read.status !== 'ok') return
    expect(read.coverage.covered).toBe(true)
    expect(read.coverage.marketPaths).toBe(41)
    // #4016 L10 (11/10/2026) — Devoteam, à UN seul parcours, ENTRE désormais
    // (renversement de GA-285) ; l'écran n'en dit que la fourchette « 1-2 ».
    expect(read.coverage.esnObserved).toEqual([
      { esnName: 'ALTEN', persons: 9, certainty: 'forte' },
      { esnName: 'Groupe SII', persons: 3, certainty: 'moyenne' },
      { esnName: 'Devoteam', persons: 1, certainty: 'faible' },
    ])
    expect(read.coverage.exEsnPresent).toBe(23)
    // #3212.3 (reste, épopée #3235) — la révision du corpus, relue TELLE
    // QUELLE depuis `market_company_signal.dataset_version`.
    expect(read.coverage.datasetVersion).toBe('2026.09.1')
  })

  it('garde les sociétés à 1 ou 2 parcours — le plancher par ligne est `MARKET_ESN_OBSERVED_MIN_PATHS` (1), pas 3', async () => {
    // #1624 (lot 14) — mesuré en production le 10/09/2026 sur BNP Paribas :
    // Keyrus à 2 parcours ressortait quand même (« 2 parcours observés relient
    // Keyrus à cet environnement »), parce que ce filtre comparait à
    // `MARKET_OBSERVATION_MIN_PERSONS` (2, pensé pour la pile technique) et non
    // au seuil transverse de toute la mémoire marché. Louis 11/10/2026 (#4016
    // L10) : Keyrus ENTRE de nouveau, mais l'écran dit « 1-2 », jamais « 2 ».
    const service = await buildService({
      signals: { find: jest.fn().mockResolvedValue([signalRow()]), findOne: jest.fn().mockResolvedValue(signalRow()) },
      esnClients: {
        find: jest.fn().mockResolvedValue([
          { esnName: 'Aubay', persons: 3 },
          { esnName: 'Keyrus', persons: 2 },
          { esnName: 'HN Services', persons: 1 },
          { esnName: 'GVX Conseil', persons: 1 },
        ]),
      },
    })

    const read = await service.coverageFor({ ref: 'a1', name: 'Thales' })

    expect(read.status).toBe('ok')
    if (read.status !== 'ok') return
    expect(read.coverage.esnObserved.map(e => e.esnName)).toEqual(['Aubay', 'Keyrus', 'HN Services', 'GVX Conseil'])
  })

  it('rend une couverture VIDE sous le seuil — pas « 2 parcours »', async () => {
    const service = await buildService({
      signals: {
        find: jest.fn().mockResolvedValue([signalRow({ pathsTotal: 2 })]),
        findOne: jest.fn().mockResolvedValue(signalRow({ pathsTotal: 2 })),
      },
    })

    const read = await service.coverageFor({ ref: 'a1', name: 'Thales' })

    expect(read.status).toBe('ok')
    if (read.status !== 'ok') return
    expect(read.coverage.covered).toBe(false)
    expect(read.coverage.marketPaths).toBeNull()
    expect(read.coverage.esnObserved).toEqual([])
  })

  it('rend une couverture VIDE quand l’entreprise n’est pas résolue', async () => {
    const service = await buildService({ signals: { findOne: jest.fn().mockResolvedValue(null) } })

    const read = await service.coverageFor({ ref: 'a1', name: 'Inconnue SARL' })

    expect(read.status).toBe('ok')
    if (read.status !== 'ok') return
    expect(read.coverage.covered).toBe(false)
  })

  it('ne rend PAS `exEsnPresent: 0` — « aucun ancien mesuré » n’est pas « aucun ancien »', async () => {
    const service = await buildService({
      signals: { find: jest.fn().mockResolvedValue([signalRow()]), findOne: jest.fn().mockResolvedValue(signalRow()) },
      exEsn: { find: jest.fn().mockResolvedValue([]) },
    })

    const read = await service.coverageFor({ ref: 'a1', name: 'Thales' })

    expect(read.status).toBe('ok')
    if (read.status !== 'ok') return
    expect(read.coverage.exEsnPresent).toBeNull()
  })

  /**
   * #1608 / #1630.10 — `city` / `region` / `country` sont ingérées depuis le
   * 06/09 (`market-memory-import.ts:254-256`) et n'étaient recopiées par
   * AUCUNE méthode de ce service : le défaut n°1 documenté du dépôt, « du code
   * juste, calculé, testé, que personne n'appelle » — sauf qu'ici c'était
   * même pas calculé, juste jamais LU. Ces trois tests couvrent la lecture.
   */
  it('#1608 — porte l’empreinte de zone quand le corpus la connaît', async () => {
    const service = await buildService({
      signals: {
        find: jest.fn().mockResolvedValue([signalRow()]),
        findOne: jest
          .fn()
          .mockResolvedValue(signalRow({ city: 'Lyon', region: 'Auvergne-Rhône-Alpes', country: 'France' })),
      },
    })

    const read = await service.coverageFor({ ref: 'a1', name: 'Thales' })

    expect(read.status).toBe('ok')
    if (read.status !== 'ok') return
    expect(read.coverage.observedZone).toEqual({ city: 'Lyon', region: 'Auvergne-Rhône-Alpes', country: 'France' })
  })

  it('#1608 — rend `observedZone: null` quand les trois valeurs sont absentes — jamais un objet à trois `null`', async () => {
    const service = await buildService({
      signals: {
        find: jest.fn().mockResolvedValue([signalRow()]),
        findOne: jest.fn().mockResolvedValue(signalRow({ city: null, region: null, country: null })),
      },
    })

    const read = await service.coverageFor({ ref: 'a1', name: 'Thales' })

    expect(read.status).toBe('ok')
    if (read.status !== 'ok') return
    expect(read.coverage.observedZone).toBeNull()
  })

  it('#1608 — une zone PARTIELLE (ville connue, région/pays absents) reste un objet, pas `null`', async () => {
    const service = await buildService({
      signals: {
        find: jest.fn().mockResolvedValue([signalRow()]),
        findOne: jest.fn().mockResolvedValue(signalRow({ city: 'Lyon', region: null, country: null })),
      },
    })

    const read = await service.coverageFor({ ref: 'a1', name: 'Thales' })

    expect(read.status).toBe('ok')
    if (read.status !== 'ok') return
    expect(read.coverage.observedZone).toEqual({ city: 'Lyon', region: null, country: null })
  })

  it('#1608 — `observedZone` est `null` sous le seuil, comme le reste de la couverture VIDE', async () => {
    const service = await buildService({
      signals: {
        find: jest.fn().mockResolvedValue([signalRow()]),
        findOne: jest
          .fn()
          .mockResolvedValue(signalRow({ pathsTotal: 2, city: 'Lyon', region: null, country: 'France' })),
      },
    })

    const read = await service.coverageFor({ ref: 'a1', name: 'Thales' })

    expect(read.status).toBe('ok')
    if (read.status !== 'ok') return
    expect(read.coverage.covered).toBe(false)
    expect(read.coverage.observedZone).toBeNull()
  })

  it('ne rend NI date NI étiquette de corpus, même quand la ligne en porte une', async () => {
    const service = await buildService({
      signals: {
        findOne: jest.fn().mockResolvedValue(signalRow({ corpusLabel: 'corpus-interne', createdAt: new Date() })),
      },
      esnClients: {
        find: jest.fn().mockResolvedValue([{ esnName: 'ALTEN', persons: 9, corpusLabel: 'corpus-interne' }]),
      },
    })

    const read = await service.coverageFor({ ref: 'a1', name: 'Thales' })

    expect(read.status).toBe('ok')
    if (read.status !== 'ok') return
    const serialized = JSON.stringify(read.coverage)
    expect(serialized).not.toContain('corpus')
    expect(serialized).not.toContain('createdAt')
    expect(serialized).not.toContain('observedAt')
  })

  it('NE JETTE PAS quand la lecture échoue — elle rend `unavailable`, pas une couverture vide', async () => {
    const service = await buildService({
      signals: {
        find: jest.fn().mockResolvedValue([signalRow()]),
        findOne: jest.fn().mockRejectedValue(new Error('connexion perdue')),
      },
    })

    const read = await service.coverageFor({ ref: 'a1', name: 'Thales' })

    expect(read.status).toBe('unavailable')
    if (read.status !== 'unavailable') return
    expect(read.reason).toBe('read_failed')
  })

  /**
   * ⚠️ #1617 — LA MÊME GARANTIE SUR L'AUTRE PORTE.
   *
   * Le rapprochement est devenu une méthode publique (`resolveDetailed`) qui
   * avale sa propre panne pour ne jamais jeter. Sans la ligne qui la RELAIE dans
   * `coverageFor`, une base injoignable ressortirait en couverture VIDE — donc
   * « le marché ne connaît pas ce compte », une affirmation, alors qu'on n'a rien
   * lu. Ce test est la seule chose qui empêche cette régression silencieuse.
   */
  it('rend `unavailable` quand c’est le RAPPROCHEMENT qui échoue, pas seulement la relecture', async () => {
    const service = await buildService({
      signals: { find: jest.fn().mockRejectedValue(new Error('connexion perdue')) },
    })

    const read = await service.coverageFor({ ref: 'a1', name: 'Thales', website: 'https://thalesgroup.com' })

    expect(read.status).toBe('unavailable')
    if (read.status !== 'unavailable') return
    expect(read.reason).toBe('read_failed')
  })

  it('`resolveDetailed` ne jette JAMAIS non plus — elle dit `unavailable`, pas `unresolved`', async () => {
    const service = await buildService({
      signals: { find: jest.fn().mockRejectedValue(new Error('connexion perdue')) },
    })

    await expect(service.resolveDetailed({ ref: 'a1', name: 'Thales' })).resolves.toEqual({
      status: 'unavailable',
      reason: 'read_failed',
    })
  })
})

describe('coverageForGroup — #3177.2 / épopée #3225, la mémoire marché d’un groupe', () => {
  function groupSignals(rows: Record<string, Row>) {
    const find = jest.fn(async ({ where }: { where?: Record<string, unknown> }) => {
      const domain = where?.websiteDomain
      const hit = Object.values(rows).find(row => row.websiteDomain === domain)
      return hit ? [hit] : []
    })
    const findOne = jest.fn(async ({ where }: { where?: Record<string, unknown> }) => {
      const key = where?.companyKey
      return (typeof key === 'string' && rows[key]) || null
    })
    return { find, findOne }
  }

  it('rend une ligne par entité COUVERTE, jamais une somme, et la route de la racine SEULE', async () => {
    const root = signalRow({
      companyKey: 'root',
      companyName: 'Groupe Racine',
      matchKey: 'grouperacine',
      websiteDomain: 'root.example',
      pathsTotal: 40,
    })
    const subsidiary = signalRow({
      companyKey: 'filiale',
      companyName: 'Filiale One',
      matchKey: 'filialeone',
      websiteDomain: 'filiale.example',
      pathsTotal: 12,
    })
    const service = await buildService({ signals: groupSignals({ root, filiale: subsidiary }) })

    const read = await service.coverageForGroup(
      [
        { ref: 'acc-1', name: 'Groupe Racine', website: 'https://root.example' },
        { ref: 'acc-1-sub-0', name: 'Filiale One', website: 'https://filiale.example' },
      ],
      { rootAccountRoute: '/accounts/acc-1' },
    )

    expect(read.status).toBe('ok')
    if (read.status !== 'ok') return
    expect(read.matches).toHaveLength(2)
    expect(read.matches[0]).toMatchObject({ companyName: 'Groupe Racine', accountRoute: '/accounts/acc-1' })
    // La filiale n'est pas un compte du portefeuille en tant que tel : pas de
    // route sur sa ligne — jamais devinée depuis celle de la racine.
    expect(read.matches[1]).toMatchObject({ companyName: 'Filiale One' })
    expect(read.matches[1].accountRoute).toBeUndefined()
    expect(read.truncated).toBe(false)
  })

  it('une filiale SOUS le seuil (ou inconnue) ne fait AUCUNE ligne — jamais un total qui mélange deux personnes morales', async () => {
    const root = signalRow({
      companyKey: 'root',
      companyName: 'Groupe Racine',
      matchKey: 'grouperacine',
      websiteDomain: 'root.example',
      pathsTotal: 40,
    })
    const service = await buildService({ signals: groupSignals({ root }) })

    const read = await service.coverageForGroup([
      { ref: 'acc-1', name: 'Groupe Racine', website: 'https://root.example' },
      { ref: 'acc-1-sub-0', name: 'Filiale Inconnue', website: 'https://inconnue.example' },
    ])

    expect(read.status).toBe('ok')
    if (read.status !== 'ok') return
    expect(read.matches.map(match => match.companyName)).toEqual(['Groupe Racine'])
  })

  /**
   * #3225 (recette prod 01/10, U 48fc44cfd0) — « la lecture de la mémoire marché
   * pour LA POSTE a échoué dans ce tour ». Cause : `coverageFor` rendait TOUTES
   * les lignes de pile (une techno citée par UNE personne comprise), alors que le
   * contrat de sortie (`observedStackSchema`) exige deux personnes au moins. Sur
   * un gros groupe, une seule ligne à 1 faisait échouer le `safeParse` du pont
   * (`contract_mismatch`) : le GROUPE ENTIER sortait `unavailable`, pour une
   * donnée qui n'avait rien d'une panne.
   */
  it('#3225 — une techno citée par UNE personne ne fait pas échouer le contrat du groupe', async () => {
    const root = signalRow({
      companyKey: 'root',
      companyName: 'La Poste',
      matchKey: 'laposte',
      websiteDomain: 'laposte.example',
      pathsTotal: 400,
      city: 'Paris',
      region: '',
      country: null,
    })
    const service = await buildService({
      signals: groupSignals({ root }),
      stacks: {
        find: jest.fn().mockResolvedValue([
          { companyKey: 'root', techno: 'Java', persons: 9 },
          { companyKey: 'root', techno: 'Cobol', persons: 1 },
        ]),
      },
    })

    const read = await service.coverageForGroup(
      [{ ref: 'acc-1', name: 'La Poste', website: 'https://laposte.example' }],
      { rootAccountRoute: '/accounts/00000000-0000-4000-8000-000000000001' },
    )

    const parsed = marketMemorySearchReadSchema.safeParse(read)
    expect(parsed.success ? [] : parsed.error.issues).toEqual([])
    if (!parsed.success || parsed.data.status !== 'ok') return
    expect(parsed.data.matches[0].coverage.observedStack).toEqual([{ techno: 'Java', persons: 9 }])
  })

  it('une racine introuvable rend le GROUPE entier `unavailable` — la question porte sur CE groupe', async () => {
    const service = await buildService({
      signals: { find: jest.fn().mockRejectedValue(new Error('connexion perdue')) },
    })

    const read = await service.coverageForGroup([{ ref: 'acc-1', name: 'Groupe Racine' }])

    expect(read).toEqual({ status: 'unavailable', reason: 'read_failed' })
  })

  it('borne à MARKET_MEMORY_GROUP_MAX_ENTITIES et le dit (`truncated`)', async () => {
    const root = signalRow({
      companyKey: 'root',
      companyName: 'Groupe Racine',
      matchKey: 'grouperacine',
      websiteDomain: 'root.example',
      pathsTotal: 40,
    })
    const service = await buildService({ signals: groupSignals({ root }) })

    const lookups = [
      { ref: 'acc-1', name: 'Groupe Racine', website: 'https://root.example' },
      ...Array.from({ length: 8 }, (_, index) => ({ ref: `acc-1-sub-${index}`, name: `Filiale ${index}` })),
    ]
    const read = await service.coverageForGroup(lookups)

    expect(read.status).toBe('ok')
    if (read.status !== 'ok') return
    expect(read.truncated).toBe(true)
  })

  it('refuse un scope de groupe vide', async () => {
    const service = await buildService({})

    await expect(service.coverageForGroup([])).rejects.toThrow(
      'Un scope de groupe demande au moins une entité résolue.',
    )
  })
})

/**
 * #1631.3/.4, #1606.2 (lot 14) — l'axe CHEMIN, dans la forme qu'attend
 * `_path_axis` côté IA : un total agrégé et l'ESN la plus observée pour le
 * NOMMER. Avant ce lot, AUCUN appelant ne transmettait ce compte — l'axe
 * restait non mesuré en production quelle que soit la couverture réelle.
 */
describe('pathAxisFor — le compte de parcours et l’ESN dominante, ou `null`', () => {
  it('rend le total ET la première ESN — `esnObserved` est déjà trié par `persons` DESC', async () => {
    const service = await buildService({
      signals: { find: jest.fn().mockResolvedValue([signalRow()]), findOne: jest.fn().mockResolvedValue(signalRow()) },
      esnClients: {
        find: jest.fn().mockResolvedValue([
          { esnName: 'ALTEN', persons: 9 },
          { esnName: 'Groupe SII', persons: 3 },
        ]),
      },
    })

    await expect(service.pathAxisFor({ ref: 'a1', name: 'Thales' })).resolves.toEqual({
      paths: 41,
      topEsn: 'ALTEN',
    })
  })

  it('rend `topEsn: null` quand la couverture existe sans aucune ESN au-dessus du plancher', async () => {
    const service = await buildService({
      signals: { find: jest.fn().mockResolvedValue([signalRow()]), findOne: jest.fn().mockResolvedValue(signalRow()) },
      esnClients: { find: jest.fn().mockResolvedValue([{ esnName: 'Devoteam', persons: 1 }]) },
    })

    await expect(service.pathAxisFor({ ref: 'a1', name: 'Thales' })).resolves.toEqual({ paths: 41, topEsn: null })
  })

  it('rend `null` sous le seuil transverse — jamais un total ni une ESN sur une couverture VIDE', async () => {
    const service = await buildService({
      signals: {
        find: jest.fn().mockResolvedValue([signalRow({ pathsTotal: 2 })]),
        findOne: jest.fn().mockResolvedValue(signalRow({ pathsTotal: 2 })),
      },
    })

    await expect(service.pathAxisFor({ ref: 'a1', name: 'Thales' })).resolves.toBeNull()
  })

  it('rend `null` quand l’entreprise n’est pas résolue — jamais un `0` déguisé', async () => {
    const service = await buildService({ signals: { findOne: jest.fn().mockResolvedValue(null) } })

    await expect(service.pathAxisFor({ ref: 'a1', name: 'Inconnue SARL' })).resolves.toBeNull()
  })

  it('rend `null` sur une lecture en PANNE — jamais confondu avec « pas de parcours »', async () => {
    const service = await buildService({
      signals: { findOne: jest.fn().mockRejectedValue(new Error('connexion perdue')) },
    })

    await expect(service.pathAxisFor({ ref: 'a1', name: 'Thales' })).resolves.toBeNull()
  })
})

describe('pathsFor — la lecture des listes et des compteurs', () => {
  it('applique la MÊME règle que `resolve` — les deux chemins ne doivent pas diverger', async () => {
    // Le défaut corrigé : le tableau de bord affichait 282 parcours sur un
    // compte dont l'onglet Partenaires ne montrait aucune société observée.
    const service = await buildService({
      signals: {
        find: jest.fn().mockResolvedValue([
          signalRow({
            companyKey: 'bnp paribas personal investors',
            matchKey: 'zzz',
            websiteDomain: 'group.bnpparibas',
            pathsTotal: 1,
          }),
          signalRow({
            companyKey: 'bnp paribas',
            matchKey: 'bnp paribas',
            websiteDomain: 'bnpp.lk',
            pathsTotal: 282,
          }),
        ]),
      },
    })

    const read = await service.pathsFor([{ ref: 'a1', name: 'BNP Paribas', website: 'group.bnpparibas' }])

    expect(read.status).toBe('ok')
    if (read.status !== 'ok') return
    expect(read.paths.get('a1')).toBe(282)
  })

  it('rend une entrée par référence d’appelant, `null` pour ce qui n’est pas couvert', async () => {
    const service = await buildService({
      signals: { find: jest.fn().mockResolvedValue([signalRow()]) },
    })

    const read = await service.pathsFor([
      { ref: 'a1', name: 'Thales', website: 'https://thalesgroup.com' },
      { ref: 'a2', name: 'Inconnue' },
    ])

    expect(read.status).toBe('ok')
    if (read.status !== 'ok') return
    expect(read.paths.get('a1')).toBe(41)
    expect(read.paths.get('a2')).toBeNull()
  })

  it('laisse `null` — et jamais 0 — une entreprise sous le seuil', async () => {
    const service = await buildService({
      signals: { find: jest.fn().mockResolvedValue([signalRow({ pathsTotal: 2 })]) },
    })

    const read = await service.pathsFor([{ ref: 'a1', name: 'Thales', website: 'https://thalesgroup.com' }])

    expect(read.status).toBe('ok')
    if (read.status !== 'ok') return
    expect(read.paths.get('a1')).toBeNull()
  })

  it('rend `unavailable` sur une panne — l’appelant n’affichera pas « 0 »', async () => {
    const service = await buildService({
      signals: { find: jest.fn().mockRejectedValue(new Error('timeout')) },
    })

    const read = await service.pathsFor([{ ref: 'a1', name: 'Thales' }])

    expect(read.status).toBe('unavailable')
  })

  it('ne va pas en base pour une liste vide', async () => {
    const find = jest.fn()
    const service = await buildService({ signals: { find } })

    const read = await service.pathsFor([])

    expect(read.status).toBe('ok')
    expect(find).not.toHaveBeenCalled()
  })
})

/**
 * #1617 — L'AMBIGUÏTÉ A UN LECTEUR AUJOURD'HUI.
 *
 * Sans ces tests, `ambiguity` et `ambiguityDropped` seraient des champs calculés
 * que personne ne consulte — le défaut n°1 de ce dépôt, réintroduit dans le lot
 * qui le corrige. L'écran « Résolutions à revoir » viendra avec le câblage des
 * dossiers de compte ; en attendant, le journal d'exploitation EST le lecteur, et
 * ces tests sont ce qui garantit qu'il l'est vraiment.
 */
describe('#1617 — une résolution douteuse se SIGNALE', () => {
  function twoHomonyms() {
    return jest.fn(async (query: { where: Record<string, unknown> }) =>
      'websiteDomain' in query.where
        ? []
        : [signalRow({ companyKey: 'orange telecom' }), signalRow({ companyKey: 'orange bank' })],
    )
  }

  it('journalise une ambiguïté, avec l’entreprise et le nombre de candidats', async () => {
    const service = await buildService({ signals: { find: twoHomonyms() } })
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)

    await service.resolveDetailed({ ref: 'a1', name: 'Orange', website: null })

    expect(warn).toHaveBeenCalledWith(
      'résolution de mémoire marché à revoir',
      expect.objectContaining({ company: 'Orange', outcome: 'ambiguous', on: 'name', candidates: 2 }),
    )
    warn.mockRestore()
  })

  it('journalise AUSSI l’ambiguïté écartée quand l’autre côté a tranché', async () => {
    // Domaine ambigu (filiale + groupe), nom unique : on tranche par le nom,
    // mais le domaine reste douteux et mérite le même œil.
    const find = jest.fn(async (query: { where: Record<string, unknown> }) =>
      'websiteDomain' in query.where
        ? [signalRow({ companyKey: 'bnp' }), signalRow({ companyKey: 'bnp pi' })]
        : [signalRow({ companyKey: 'bnp', matchKey: 'bnp paribas' })],
    )
    const service = await buildService({ signals: { find } })
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)

    await service.resolveDetailed({ ref: 'a1', name: 'BNP Paribas', website: 'group.bnpparibas' })

    expect(warn).toHaveBeenCalledWith(
      'résolution de mémoire marché à revoir',
      expect.objectContaining({ outcome: 'resolved', on: 'domain', candidates: 2 }),
    )
    warn.mockRestore()
  })

  it('ne dit RIEN quand le rapprochement est net — un journal qui parle toujours ne se lit plus', async () => {
    const service = await buildService({ signals: { find: jest.fn().mockResolvedValue([signalRow()]) } })
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)

    await service.resolveDetailed({ ref: 'a1', name: 'Thales', website: 'https://thalesgroup.com' })

    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('la lecture GROUPÉE signale les mêmes ambiguïtés que la lecture une par une', async () => {
    const service = await buildService({
      signals: {
        // ⚠️ `matchKey` doit valoir la clé du NOM cherché : la lecture groupée
        // range les lignes par `matchKey`, et une ligne dont la clé ne
        // correspond à aucun `lookup` n'est candidate de personne. Sans ça, le
        // test passait pour la mauvaise raison — `null` par « rien trouvé » et
        // non par « ambigu ».
        find: jest
          .fn()
          .mockResolvedValue([
            signalRow({ companyKey: 'orange telecom', matchKey: 'orange' }),
            signalRow({ companyKey: 'orange bank', matchKey: 'orange' }),
          ]),
      },
    })
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)

    const read = await service.pathsFor([{ ref: 'a1', name: 'Orange', website: null }])

    expect(read.status).toBe('ok')
    if (read.status !== 'ok') return
    // Ambigu ⇒ AUCUN compteur. Ni un chiffre pris au hasard, ni « 0 ».
    expect(read.paths.get('a1')).toBeNull()
    expect(warn).toHaveBeenCalledWith('résolution de mémoire marché à revoir', expect.objectContaining({ on: 'name' }))
    warn.mockRestore()
  })
})

/**
 * #1756 — LE SILENCE EST DEVENU MESURABLE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CES TESTS FIXENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Des trois issues du rapprochement, une seule ne laissait AUCUNE trace : zéro
 * candidat des deux côtés. C'est-à-dire le cas de « SG SOCIETE GENERALE »,
 * mesuré en production le 08/09/2026, et le plus silencieux des trois — plus
 * encore que l'ambiguïté que #1617 avait corrigée. « Combien de comptes ne se
 * résolvent pas, et lesquels ? » n'avait pas de réponse.
 *
 * ⚠️ La distinction que ces tests tiennent : « je n'ai pas résolu cette
 * entité » n'est PAS « ce compte n'a pas de parcours ». Les deux se rendent
 * pareil à l'écran, et une seule est vraie à la fois.
 */
describe('#1756 — une jointure qui ne résout pas le DIT', () => {
  /** Le corpus répond à côté : ni le domaine ni la clé de nom ne trouvent rien. */
  function silence() {
    return jest.fn().mockResolvedValue([])
  }

  it('journalise l’entité non résolue, avec la clé de nom qui n’a rien trouvé', async () => {
    const service = await buildService({ signals: { find: silence() } })
    const info = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)

    const resolution = await service.resolveDetailed({ ref: 'a1', name: 'SG SOCIETE GENERALE', website: null })

    expect(resolution).toEqual({ status: 'unresolved' })
    expect(info).toHaveBeenCalledWith(
      'mémoire marché : entités NON RÉSOLUES',
      expect.objectContaining({
        event: 'market_memory_unresolved',
        looked_up: 1,
        unresolved: 1,
        companies: [
          {
            ref: 'a1',
            name: 'SG SOCIETE GENERALE',
            // LE renseignement actionnable : c'est cette clé-là qu'une ligne
            // d'alias aurait à rapprocher de `societe generale`.
            match_key: 'sg societe generale',
            domain: null,
            alias_candidates: 0,
          },
        ],
      }),
    )
    info.mockRestore()
  })

  it('ne dit RIEN quand le rapprochement aboutit — le journal ne parle que du silence', async () => {
    const service = await buildService({ signals: { find: jest.fn().mockResolvedValue([signalRow()]) } })
    const info = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)

    await service.resolveDetailed({ ref: 'a1', name: 'Thales', website: 'https://thalesgroup.com' })

    expect(info).not.toHaveBeenCalled()
    info.mockRestore()
  })

  it('compte les non résolus d’un PORTEFEUILLE en UNE ligne, et les NOMME tous', async () => {
    // Trois comptes, dont deux que le corpus ne connaît pas. Une ligne par
    // compte rendrait le journal illisible sur un vrai portefeuille : c'est le
    // compte qui doit être exact, et la liste complète.
    const service = await buildService({
      signals: { find: jest.fn().mockResolvedValue([signalRow({ matchKey: 'thales' })]) },
    })
    const info = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)

    await service.pathsFor([
      { ref: 'a1', name: 'Thales', website: null },
      { ref: 'a2', name: 'SG SOCIETE GENERALE', website: null },
      { ref: 'a3', name: 'SOCIETE NATIONALE SNCF', website: null },
    ])

    const lignes = info.mock.calls.filter(([message]) => message === 'mémoire marché : entités NON RÉSOLUES')
    expect(lignes).toHaveLength(1)
    const meta = lignes[0]?.[1] as { looked_up: number; unresolved: number; companies: { ref: string }[] }
    expect(meta.looked_up).toBe(3)
    expect(meta.unresolved).toBe(2)
    expect(meta.companies.map(entry => entry.ref)).toEqual(['a2', 'a3'])
    info.mockRestore()
  })

  it('la couverture d’une entité non résolue reste VIDE — jamais « 0 parcours »', async () => {
    const service = await buildService({ signals: { find: silence() } })

    const read = await service.coverageFor({ ref: 'a1', name: 'SG SOCIETE GENERALE', website: null })

    expect(read.status).toBe('ok')
    if (read.status !== 'ok') return
    // ⚠️ `null`, pas `0` : « non mesuré » n'est pas « mesuré à zéro ».
    expect(read.coverage.marketPaths).toBeNull()
    expect(read.coverage.covered).toBe(false)
  })
})

/**
 * #1756 — LA TABLE D'ALIAS : le troisième candidat, vu depuis le service.
 *
 * ⚠️ Le premier test de cette suite est le plus important du lot : **table vide
 * ⇒ rien ne change**. QUI remplit `market_company_alias` est une décision
 * produit en attente ; ce lot construit le réceptacle et le chemin, pas la
 * donnée. Un réceptacle vide qui modifierait le comportement serait pire que
 * pas de réceptacle du tout.
 */
describe('#1756 — le rapprochement par alias', () => {
  const SG = signalRow({ companyKey: 'societe generale', matchKey: 'societe generale', pathsTotal: 267 })

  /** Le corpus ne répond ni au domaine ni au nom, mais répond à la clé visée. */
  function corpusReachableOnlyByAlias() {
    return jest.fn(async (query: { where: Record<string, unknown> }) => ('companyKey' in query.where ? [SG] : []))
  }

  it('TABLE VIDE : aucune requête sur les entreprises, et le résultat est celui d’avant', async () => {
    const signalsFind = jest.fn().mockResolvedValue([])
    const aliasFind = jest.fn().mockResolvedValue([])
    const service = await buildService({ signals: { find: signalsFind }, aliases: { find: aliasFind } })

    const resolution = await service.resolveDetailed({ ref: 'a1', name: 'SG SOCIETE GENERALE', website: null })

    expect(resolution).toEqual({ status: 'unresolved' })
    // Deux lectures du corpus : le domaine (ici sauté, faute de site) et le nom.
    // Aucune TROISIÈME requête n'est partie — la table d'alias a répondu vide.
    expect(signalsFind).toHaveBeenCalledTimes(1)
    expect(signalsFind).toHaveBeenCalledWith({ where: { matchKey: 'sg societe generale' } })
    expect(aliasFind).toHaveBeenCalledTimes(1)
  })

  it('rapproche « SG SOCIETE GENERALE » de ses 267 parcours quand l’alias existe', async () => {
    const service = await buildService({
      signals: { find: corpusReachableOnlyByAlias(), findOne: jest.fn().mockResolvedValue(SG) },
      aliases: {
        find: jest
          .fn()
          .mockResolvedValue([{ aliasKey: 'sg societe generale', companyKey: 'societe generale', source: 'operator' }]),
      },
    })

    const resolution = await service.resolveDetailed({ ref: 'a1', name: 'SG SOCIETE GENERALE', website: null })

    expect(resolution).toMatchObject({
      status: 'resolved',
      companyKey: 'societe generale',
      matchedOn: 'alias',
      // FAIBLE : une équivalence déclarée n'est pas un domaine racine partagé.
      strength: 'inferred',
      pathsTotal: 267,
    })
  })

  it('journalise une résolution par alias À PART — une approximation se compte', async () => {
    const service = await buildService({
      signals: { find: corpusReachableOnlyByAlias() },
      aliases: {
        find: jest
          .fn()
          .mockResolvedValue([{ aliasKey: 'sg societe generale', companyKey: 'societe generale', source: 'operator' }]),
      },
    })
    const info = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)

    await service.resolveDetailed({ ref: 'a1', name: 'SG SOCIETE GENERALE', website: null })

    expect(info).toHaveBeenCalledWith(
      'mémoire marché : entités résolues par ALIAS',
      expect.objectContaining({
        event: 'market_memory_resolved_by_alias',
        resolved_by_alias: 1,
        companies: [
          { ref: 'a1', name: 'SG SOCIETE GENERALE', match_key: 'sg societe generale', company_key: 'societe generale' },
        ],
      }),
    )
    info.mockRestore()
  })

  it('un alias qui vise DEUX entreprises ne tranche rien, et le journal le dit', async () => {
    const service = await buildService({
      signals: {
        find: jest.fn(async (query: { where: Record<string, unknown> }) =>
          'companyKey' in query.where
            ? [SG, signalRow({ companyKey: 'sg finance', matchKey: 'sg finance', pathsTotal: 12 })]
            : [],
        ),
      },
      aliases: {
        find: jest.fn().mockResolvedValue([
          { aliasKey: 'sg', companyKey: 'societe generale', source: 'pack' },
          { aliasKey: 'sg', companyKey: 'sg finance', source: 'pack' },
        ]),
      },
    })
    const info = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)

    const resolution = await service.resolveDetailed({ ref: 'a1', name: 'SG', website: null })

    expect(resolution).toEqual({ status: 'unresolved' })
    // `alias_candidates: 2` dit à l'opérateur que la table d'alias est à
    // CORRIGER, et non à compléter — deux renseignements très différents.
    expect(info).toHaveBeenCalledWith(
      'mémoire marché : entités NON RÉSOLUES',
      expect.objectContaining({ companies: [expect.objectContaining({ alias_candidates: 2 })] }),
    )
    info.mockRestore()
  })

  it('un alias qui vise une entreprise ABSENTE du corpus ne désigne rien — sans panne', async () => {
    const service = await buildService({
      signals: { find: jest.fn().mockResolvedValue([]) },
      aliases: {
        find: jest
          .fn()
          .mockResolvedValue([{ aliasKey: 'sg societe generale', companyKey: 'disparue', source: 'pack' }]),
      },
    })

    const resolution = await service.resolveDetailed({ ref: 'a1', name: 'SG SOCIETE GENERALE', website: null })

    expect(resolution).toEqual({ status: 'unresolved' })
  })

  it('la lecture GROUPÉE rapproche par alias À L’IDENTIQUE — sinon deux écrans se contredisent', async () => {
    const service = await buildService({
      signals: {
        find: jest.fn(async (query: { where: Record<string, unknown> }) => ('companyKey' in query.where ? [SG] : [])),
      },
      aliases: {
        find: jest
          .fn()
          .mockResolvedValue([{ aliasKey: 'sg societe generale', companyKey: 'societe generale', source: 'operator' }]),
      },
    })

    const read = await service.pathsFor([{ ref: 'a1', name: 'SG SOCIETE GENERALE', website: null }])

    expect(read.status).toBe('ok')
    if (read.status !== 'ok') return
    expect(read.paths.get('a1')).toBe(267)
  })

  it('ne cherche AUCUN alias quand le corpus a déjà répondu — l’alias arrive en dernier', async () => {
    const aliasFind = jest.fn().mockResolvedValue([])
    const service = await buildService({
      signals: { find: jest.fn().mockResolvedValue([signalRow()]) },
      aliases: { find: aliasFind },
    })

    await service.resolveDetailed({ ref: 'a1', name: 'Thales', website: 'https://thalesgroup.com' })

    expect(aliasFind).not.toHaveBeenCalled()
  })
})

/* ─────────────────────────────────────────────────────────────────────────────
 * #2284.26 (#2978, lot SRC2 28/09/2026) — `aliasProvenDomain` : le domaine
 * que l'entity resolver peut rattacher, seulement quand l'alias a PROUVÉ un
 * rapprochement (`matchedOn: 'alias'`).
 * ───────────────────────────────────────────────────────────────────────────*/

describe('aliasProvenDomain — le domaine, seulement quand l’alias a PROUVÉ le rapprochement', () => {
  it('rend le domaine du corpus quand la résolution est prouvée par alias', async () => {
    const SG = signalRow({
      companyKey: 'societe generale',
      matchKey: 'societe generale',
      websiteDomain: 'societegenerale.com',
    })
    const service = await buildService({
      signals: {
        find: jest.fn(async (query: { where: Record<string, unknown> }) => ('companyKey' in query.where ? [SG] : [])),
        findOne: jest.fn().mockResolvedValue(SG),
      },
      aliases: {
        find: jest
          .fn()
          .mockResolvedValue([{ aliasKey: 'sg societe generale', companyKey: 'societe generale', source: 'operator' }]),
      },
    })

    const domain = await service.aliasProvenDomain({ ref: 'a1', name: 'SG SOCIETE GENERALE', website: null })

    expect(domain).toBe('societegenerale.com')
  })

  it('rend null quand le corpus ne connaît aucun domaine pour l’entreprise visée', async () => {
    const SG_NO_DOMAIN = signalRow({
      companyKey: 'societe generale',
      matchKey: 'societe generale',
      websiteDomain: null,
    })
    const service = await buildService({
      signals: {
        find: jest.fn(async (query: { where: Record<string, unknown> }) =>
          'companyKey' in query.where ? [SG_NO_DOMAIN] : [],
        ),
        findOne: jest.fn().mockResolvedValue(SG_NO_DOMAIN),
      },
      aliases: {
        find: jest
          .fn()
          .mockResolvedValue([{ aliasKey: 'sg societe generale', companyKey: 'societe generale', source: 'operator' }]),
      },
    })

    expect(await service.aliasProvenDomain({ ref: 'a1', name: 'SG SOCIETE GENERALE', website: null })).toBeNull()
  })

  it('rend null quand le rapprochement est par DOMAINE — l’entity resolver a déjà cette source', async () => {
    const service = await buildService({ signals: { find: jest.fn().mockResolvedValue([signalRow()]) } })

    expect(
      await service.aliasProvenDomain({ ref: 'a1', name: 'Thales', website: 'https://thalesgroup.com' }),
    ).toBeNull()
  })

  it('rend null quand rien n’est résolu', async () => {
    const service = await buildService({
      signals: { find: jest.fn().mockResolvedValue([]) },
      aliases: { find: jest.fn().mockResolvedValue([]) },
    })

    expect(await service.aliasProvenDomain({ ref: 'a1', name: 'Inconnue SARL', website: null })).toBeNull()
  })

  it('ne jette jamais — une panne de lecture rend null', async () => {
    const service = await buildService({
      signals: { find: jest.fn().mockRejectedValue(new Error('boom')) },
    })

    expect(await service.aliasProvenDomain({ ref: 'a1', name: 'Thales', website: null })).toBeNull()
  })
})

/* ─────────────────────────────────────────────────────────────────────────────
 * #1633 / #1635 — `portfolioFor` : la couverture d'un PORTEFEUILLE
 * ───────────────────────────────────────────────────────────────────────────*/

describe('portfolioFor — les quatre seaux, et ils s’additionnent', () => {
  it('classe chaque compte dans exactement un seau, et le total boucle', async () => {
    // Quatre comptes, un par issue possible du rapprochement.
    const find = jest.fn().mockResolvedValue([
      // couvert : rapproché par domaine, 41 parcours
      signalRow({ companyKey: 'thales', matchKey: 'thales', websiteDomain: 'thalesgroup.com', pathsTotal: 41 }),
      // résolu mais SOUS le seuil : 2 parcours
      signalRow({ companyKey: 'petite', matchKey: 'petite', websiteDomain: 'petite.fr', pathsTotal: 2 }),
      // deux homonymes : ni l'un ni l'autre ne tranche
      signalRow({ companyKey: 'roche-a', matchKey: 'roche', websiteDomain: null, pathsTotal: 12 }),
      signalRow({ companyKey: 'roche-b', matchKey: 'roche', websiteDomain: null, pathsTotal: 9 }),
    ])
    const service = await buildService({ signals: { find } })

    const read = await service.portfolioFor(
      [
        { ref: 'a1', name: 'Thales', website: 'https://thalesgroup.com' },
        { ref: 'a2', name: 'Petite', website: 'https://petite.fr' },
        { ref: 'a3', name: 'Roche', website: null },
        { ref: 'a4', name: 'Entreprise Inconnue Du Corpus', website: null },
      ],
      { expertises: [] },
    )

    expect(read.status).toBe('ok')
    if (read.status !== 'ok') return
    expect(read.coverage).toEqual({
      accounts: 4,
      covered: 1,
      insufficientObservations: 1,
      ambiguous: 1,
      unresolved: 1,
      homonyms: 1,
    })
    // La propriété qui rend l'agrégat lisible : le total EST la somme.
    const { accounts, covered, insufficientObservations, ambiguous, unresolved } = read.coverage
    expect(covered + insufficientObservations + ambiguous + unresolved).toBe(accounts)
  })

  it('sépare « résolu sous le seuil » de « non résolu » — le corpus connaît l’un et pas l’autre', async () => {
    const find = jest
      .fn()
      .mockResolvedValue([signalRow({ companyKey: 'petite', matchKey: 'petite', websiteDomain: null, pathsTotal: 2 })])
    const service = await buildService({ signals: { find } })

    const read = await service.portfolioFor(
      [
        { ref: 'a1', name: 'Petite', website: null },
        { ref: 'a2', name: 'Absente', website: null },
      ],
      { expertises: [] },
    )

    if (read.status !== 'ok') throw new Error('lecture attendue en succès')
    expect(read.coverage.insufficientObservations).toBe(1)
    expect(read.coverage.unresolved).toBe(1)
    expect(read.coverage.covered).toBe(0)
  })

  it('ne fait AUCUNE requête de signaux sur un portefeuille vide, et rend des zéros qui sont vrais', async () => {
    const find = jest.fn().mockResolvedValue([])
    const service = await buildService({ signals: { find } })

    const read = await service.portfolioFor([], { expertises: [] })

    if (read.status !== 'ok') throw new Error('lecture attendue en succès')
    expect(read.coverage.accounts).toBe(0)
    expect(find).not.toHaveBeenCalled()
  })

  it('rend `unavailable` sur une panne — jamais un portefeuille à zéro', async () => {
    const find = jest.fn().mockRejectedValue(new Error('base injoignable'))
    const service = await buildService({ signals: { find } })
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)

    const read = await service.portfolioFor([{ ref: 'a1', name: 'Thales', website: null }], { expertises: [] })

    expect(read).toEqual({ status: 'unavailable', reason: 'read_failed' })
  })

  it('lit les signaux en UNE requête, quel que soit le nombre de comptes', async () => {
    const find = jest.fn().mockResolvedValue([])
    const service = await buildService({ signals: { find } })

    await service.portfolioFor(
      Array.from({ length: 50 }, (_unused, index) => ({ ref: `a${index}`, name: `Compte ${index}`, website: null })),
      { expertises: [] },
    )

    expect(find).toHaveBeenCalledTimes(1)
  })

  it('rapproche exactement comme `pathsFor` — deux lectures groupées ne divergent pas', async () => {
    const rows = [
      signalRow({ companyKey: 'roche-a', matchKey: 'roche', websiteDomain: null, pathsTotal: 12 }),
      signalRow({ companyKey: 'roche-b', matchKey: 'roche', websiteDomain: null, pathsTotal: 9 }),
    ]
    const service = await buildService({ signals: { find: jest.fn().mockResolvedValue(rows) } })
    const lookups = [{ ref: 'a1', name: 'Roche', website: null }]

    const paths = await service.pathsFor(lookups)
    const portfolio = await service.portfolioFor(lookups, { expertises: [] })

    if (paths.status !== 'ok' || portfolio.status !== 'ok') throw new Error('lectures attendues en succès')
    // `pathsFor` rend `null` (ambigu ⇒ pas de mémoire à montrer) et
    // `portfolioFor` le compte en `ambiguous` : c'est le MÊME verdict, dit à
    // deux échelles. Si l'un des deux changeait d'arbitre, ce test tomberait.
    expect(paths.paths.get('a1')).toBeNull()
    expect(portfolio.coverage.ambiguous).toBe(1)
    expect(portfolio.coverage.unresolved).toBe(0)
  })
})

describe('portfolioFor — la correction humaine (#1617.4)', () => {
  const AMBIGU = [
    signalRow({ companyKey: 'roche-a', matchKey: 'roche', websiteDomain: null, pathsTotal: 12 }),
    signalRow({ companyKey: 'roche-b', matchKey: 'roche', websiteDomain: null, pathsTotal: 9 }),
  ]
  const LOOKUP = [{ ref: 'a1', name: 'Roche', website: null }]

  it('sans espace, ne lit AUCUNE correction — le chemin d’avant le lot', async () => {
    const findOverrides = jest.fn().mockResolvedValue([])
    const service = await buildService({
      signals: { find: jest.fn().mockResolvedValue(AMBIGU) },
      resolutionOverrides: { find: findOverrides },
    })

    const read = await service.portfolioFor(LOOKUP, { expertises: [] })

    expect(findOverrides).not.toHaveBeenCalled()
    if (read.status !== 'ok') throw new Error('lecture attendue en succès')
    expect(read.coverage.ambiguous).toBe(1)
  })

  it('une correction POSITIVE sort le compte de l’ambiguïté et le rend couvert', async () => {
    const service = await buildService({
      signals: { find: jest.fn().mockResolvedValue(AMBIGU) },
      resolutionOverrides: {
        find: jest.fn().mockResolvedValue([
          {
            accountId: 'a1',
            decision: 'confirmed',
            marketCompanyKey: 'roche-a',
            reviewedAt: new Date('2026-09-11T08:00:00.000Z'),
            reviewedBy: '11111111-1111-4111-8111-111111111111',
          },
        ]),
      },
    })

    const read = await service.portfolioFor(LOOKUP, { expertises: [], workspaceId: 'w1' })

    if (read.status !== 'ok') throw new Error('lecture attendue en succès')
    // L'humain a tranché : le compte n'a plus rien à arbitrer, et il porte le
    // comptage de l'entreprise qu'il a désignée (12, pas 9).
    expect(read.coverage.ambiguous).toBe(0)
    expect(read.coverage.covered).toBe(1)
    expect(read.review).toEqual([])
  })

  it('une correction NÉGATIVE écarte le rapprochement sans le compter « couvert »', async () => {
    const service = await buildService({
      signals: { find: jest.fn().mockResolvedValue(AMBIGU) },
      resolutionOverrides: {
        find: jest.fn().mockResolvedValue([
          {
            accountId: 'a1',
            decision: 'dismissed',
            marketCompanyKey: null,
            reviewedAt: new Date('2026-09-11T08:00:00.000Z'),
            reviewedBy: '11111111-1111-4111-8111-111111111111',
          },
        ]),
      },
    })

    const read = await service.portfolioFor(LOOKUP, { expertises: [], workspaceId: 'w1' })

    if (read.status !== 'ok') throw new Error('lecture attendue en succès')
    expect(read.coverage.covered).toBe(0)
    expect(read.coverage.ambiguous).toBe(0)
    expect(read.coverage.unresolved).toBe(1)
  })

  it('⚠️ une panne de la table des corrections n’emporte PAS la lecture du corpus', async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    const service = await buildService({
      signals: { find: jest.fn().mockResolvedValue(AMBIGU) },
      resolutionOverrides: { find: jest.fn().mockRejectedValue(new Error('table injoignable')) },
    })

    const read = await service.portfolioFor(LOOKUP, { expertises: [], workspaceId: 'w1' })

    // On retombe sur le calcul seul, qui est le comportement d'avant le lot —
    // jamais sur `unavailable` : le corpus, lui, a été lu.
    if (read.status !== 'ok') throw new Error('lecture attendue en succès')
    expect(read.coverage.ambiguous).toBe(1)
  })

  it('une correction ne s’applique QU’À son compte', async () => {
    const service = await buildService({
      signals: { find: jest.fn().mockResolvedValue(AMBIGU) },
      resolutionOverrides: {
        find: jest.fn().mockResolvedValue([
          {
            accountId: 'a2',
            decision: 'confirmed',
            marketCompanyKey: 'roche-a',
            reviewedAt: new Date('2026-09-11T08:00:00.000Z'),
            reviewedBy: '11111111-1111-4111-8111-111111111111',
          },
        ]),
      },
    })

    const read = await service.portfolioFor(LOOKUP, { expertises: [], workspaceId: 'w1' })

    if (read.status !== 'ok') throw new Error('lecture attendue en succès')
    expect(read.coverage.ambiguous).toBe(1)
  })
})

/**
 * #1617.4 — LE CHEMIN D'ÉCRITURE, celui qui manquait.
 *
 * La première moitié du lot a posé la table, la règle pure et les deux chemins
 * de lecture. Rien ne pouvait REMPLIR la table : c'était « une lecture sans
 * chemin d'écriture », le défaut que ce dépôt a déjà payé plusieurs fois.
 */
describe('recordResolutionDecision — la décision d’un humain s’enregistre (#1617.4)', () => {
  const WORKSPACE = '0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f'
  const ACCOUNT = '11111111-1111-4111-8111-111111111111'
  const USER = '22222222-2222-4222-8222-222222222222'

  it('écrit un ACCORD avec la clé désignée, et l’auteur du geste', async () => {
    const upsert = jest.fn().mockResolvedValue({ identifiers: [] })
    const service = await buildService({ resolutionOverrides: { upsert } })

    const record = await service.recordResolutionDecision({
      workspaceId: WORKSPACE,
      accountId: ACCOUNT,
      reviewedBy: USER,
      decision: { decision: 'confirmed', marketCompanyKey: 'roche-a' },
    })

    expect(upsert).toHaveBeenCalledTimes(1)
    const [row, conflict] = upsert.mock.calls[0] as [Record<string, unknown>, string[]]
    expect(row).toMatchObject({
      workspaceId: WORKSPACE,
      accountId: ACCOUNT,
      decision: 'confirmed',
      marketCompanyKey: 'roche-a',
      note: null,
      reviewedBy: USER,
    })
    expect(row.reviewedAt).toBeInstanceOf(Date)
    // L'IDEMPOTENCE est ici, et elle est le point : « une correction humaine
    // gagne toujours, quelle que soit sa date » — donc la dernière REMPLACE,
    // elle ne s'empile pas. Sans ces deux colonnes en conflit, un second clic
    // créerait une seconde ligne et la lecture en choisirait une au hasard.
    expect(conflict).toEqual(['workspaceId', 'accountId'])
    expect(record).toEqual({
      accountId: ACCOUNT,
      decision: 'confirmed',
      marketCompanyKey: 'roche-a',
      note: null,
    })
  })

  it('écrit un REJET sans clé — écarter une lecture est une réponse complète', async () => {
    const upsert = jest.fn().mockResolvedValue({ identifiers: [] })
    const service = await buildService({ resolutionOverrides: { upsert } })

    const record = await service.recordResolutionDecision({
      workspaceId: WORKSPACE,
      accountId: ACCOUNT,
      reviewedBy: USER,
      decision: { decision: 'dismissed' },
    })

    const [row] = upsert.mock.calls[0] as [Record<string, unknown>]
    // `null` et pas `undefined` : la colonne doit être ÉCRASÉE quand un accord
    // devient un rejet, sinon l'ancienne clé survivrait à la nouvelle décision
    // et le CHECK croisé de la table rejetterait la ligne.
    expect(row.marketCompanyKey).toBeNull()
    expect(record.marketCompanyKey).toBeNull()
  })

  it('garde la raison quand il y en a une, et n’en invente pas quand il n’y en a pas', async () => {
    const upsert = jest.fn().mockResolvedValue({ identifiers: [] })
    const service = await buildService({ resolutionOverrides: { upsert } })

    await service.recordResolutionDecision({
      workspaceId: WORKSPACE,
      accountId: ACCOUNT,
      reviewedBy: USER,
      decision: { decision: 'dismissed', note: '  c’est la filiale suisse  ' },
    })

    const [row] = upsert.mock.calls[0] as [Record<string, unknown>]
    expect(row.note).toBe('c’est la filiale suisse')
  })

  it('une raison VIDE reste `null` — une chaîne blanche n’est pas une raison', async () => {
    const upsert = jest.fn().mockResolvedValue({ identifiers: [] })
    const service = await buildService({ resolutionOverrides: { upsert } })

    await service.recordResolutionDecision({
      workspaceId: WORKSPACE,
      accountId: ACCOUNT,
      reviewedBy: USER,
      decision: { decision: 'dismissed', note: '   ' },
    })

    const [row] = upsert.mock.calls[0] as [Record<string, unknown>]
    expect(row.note).toBeNull()
  })

  it('⚠️ ce qui vient d’être écrit se RELIT — la lecture et l’écriture se répondent', async () => {
    const service = await buildService({
      signals: {
        find: jest
          .fn()
          .mockResolvedValue([
            signalRow({ companyKey: 'roche-a', matchKey: 'roche', websiteDomain: null, pathsTotal: 12 }),
            signalRow({ companyKey: 'roche-b', matchKey: 'roche', websiteDomain: null, pathsTotal: 9 }),
          ]),
      },
      resolutionOverrides: {
        // Ce que `recordResolutionDecision` vient d'écrire, relu tel quel : le
        // test ci-dessus prouve la FORME de la ligne, celui-ci prouve qu'elle
        // sort bien le compte de la file.
        find: jest.fn().mockResolvedValue([
          {
            accountId: ACCOUNT,
            decision: 'confirmed',
            marketCompanyKey: 'roche-a',
            reviewedAt: new Date('2026-09-11T08:00:00.000Z'),
            reviewedBy: USER,
          },
        ]),
      },
    })

    const read = await service.portfolioFor([{ ref: ACCOUNT, name: 'Roche', website: null }], {
      expertises: [],
      workspaceId: WORKSPACE,
    })

    if (read.status !== 'ok') throw new Error('lecture attendue en succès')
    expect(read.review).toEqual([])
  })
})

describe('portfolioFor — la file de revue', () => {
  /**
   * #1617.4 — SANS CETTE LISTE, LA FILE DIT QU'IL Y A TROIS CANDIDATES ET NE
   * PERMET JAMAIS D'EN DÉSIGNER UNE.
   *
   * « C'est bien cette entreprise » demande une CLÉ du corpus, et personne
   * côté navigateur ne l'avait : le geste était servi par une route que rien
   * n'atteignait.
   */
  it('NOMME les entreprises entre lesquelles trancher, avec leur clé', async () => {
    const find = jest.fn().mockResolvedValue([
      signalRow({
        companyKey: 'roche-holding',
        companyName: 'Roche Holding',
        matchKey: 'roche',
        websiteDomain: 'roche.com',
        country: 'Suisse',
        pathsTotal: 12,
      }),
      signalRow({
        companyKey: 'roche-bobois',
        companyName: 'Roche Bobois',
        matchKey: 'roche',
        websiteDomain: null,
        country: null,
        pathsTotal: 9,
      }),
    ])
    const service = await buildService({ signals: { find } })

    const read = await service.portfolioFor([{ ref: 'a1', name: 'Roche', website: null }], { expertises: [] })

    if (read.status !== 'ok') throw new Error('lecture attendue en succès')
    expect(read.review[0]?.companies).toEqual([
      { companyKey: 'roche-holding', companyName: 'Roche Holding', websiteDomain: 'roche.com', country: 'Suisse' },
      { companyKey: 'roche-bobois', companyName: 'Roche Bobois', websiteDomain: null, country: null },
    ])
    // Le COMPTE et la LISTE disent le même nombre : une liste tronquée ferait
    // disparaître la bonne réponse sans le dire.
    expect(read.review[0]?.companies).toHaveLength(read.review[0]?.candidates ?? 0)
  })

  it('nomme les candidates du côté qui a ÉCHOUÉ, jamais de l’autre', async () => {
    const find = jest.fn().mockResolvedValue([
      signalRow({
        companyKey: 'orange-a',
        companyName: 'Orange A',
        matchKey: 'orange',
        websiteDomain: 'orange.com',
        pathsTotal: 30,
      }),
      signalRow({
        companyKey: 'orange-b',
        companyName: 'Orange B',
        matchKey: 'orange',
        websiteDomain: 'orange.com',
        pathsTotal: 20,
      }),
    ])
    const service = await buildService({ signals: { find } })

    // Le compte porte un site : les deux lignes répondent PAR LE DOMAINE, donc
    // l'ambiguïté est sur le domaine — et c'est le NOM qui départage à l'écran.
    const read = await service.portfolioFor([{ ref: 'a1', name: 'Orange', website: 'https://orange.com' }], {
      expertises: [],
    })

    if (read.status !== 'ok') throw new Error('lecture attendue en succès')
    expect(read.review[0]?.reason).toBe('ambiguous_domain')
    expect(read.review[0]?.companies?.map(row => row.companyName)).toEqual(['Orange A', 'Orange B'])
  })

  it('ne porte QUE des ambiguïtés, jamais un compte non résolu', async () => {
    const find = jest
      .fn()
      .mockResolvedValue([
        signalRow({ companyKey: 'roche-a', matchKey: 'roche', websiteDomain: null, pathsTotal: 12 }),
        signalRow({ companyKey: 'roche-b', matchKey: 'roche', websiteDomain: null, pathsTotal: 9 }),
      ])
    const service = await buildService({ signals: { find } })

    const read = await service.portfolioFor(
      [
        { ref: 'a1', name: 'Roche', website: null },
        { ref: 'a2', name: 'Jamais Vue', website: null },
      ],
      { expertises: [] },
    )

    if (read.status !== 'ok') throw new Error('lecture attendue en succès')
    expect(read.review).toEqual([
      {
        accountId: 'a1',
        accountName: 'Roche',
        reason: 'ambiguous_name',
        candidates: 2,
        // #1617.4 — les candidates NOMMÉES : c'est ce qui rend le geste
        // possible. Leur absence laissait l'écran annoncer un arbitrage
        // qu'aucun clic ne pouvait rendre.
        companies: [
          { companyKey: 'roche-a', companyName: 'Thales', websiteDomain: null, country: null },
          { companyKey: 'roche-b', companyName: 'Thales', websiteDomain: null, country: null },
        ],
      },
    ])
  })

  it('range les plus gros arbitrages d’abord, et le nom départage à égalité', async () => {
    const find = jest
      .fn()
      .mockResolvedValue([
        signalRow({ companyKey: 'k1', matchKey: 'zeta', websiteDomain: null, pathsTotal: 9 }),
        signalRow({ companyKey: 'k2', matchKey: 'zeta', websiteDomain: null, pathsTotal: 8 }),
        signalRow({ companyKey: 'k3', matchKey: 'alpha', websiteDomain: null, pathsTotal: 7 }),
        signalRow({ companyKey: 'k4', matchKey: 'alpha', websiteDomain: null, pathsTotal: 6 }),
        signalRow({ companyKey: 'k5', matchKey: 'alpha', websiteDomain: null, pathsTotal: 5 }),
      ])
    const service = await buildService({ signals: { find } })

    const read = await service.portfolioFor(
      [
        { ref: 'a1', name: 'Zeta', website: null },
        { ref: 'a2', name: 'Alpha', website: null },
      ],
      { expertises: [] },
    )

    if (read.status !== 'ok') throw new Error('lecture attendue en succès')
    expect(read.review.map(item => [item.accountName, item.candidates])).toEqual([
      ['Alpha', 3],
      ['Zeta', 2],
    ])
  })

  it('ne dépasse jamais le plafond de la file', async () => {
    const rows = Array.from({ length: 2 }, (_unused, index) =>
      signalRow({ companyKey: `k${index}`, matchKey: 'commun', websiteDomain: null, pathsTotal: 9 - index }),
    )
    const service = await buildService({ signals: { find: jest.fn().mockResolvedValue(rows) } })

    const read = await service.portfolioFor(
      Array.from({ length: 30 }, (_unused, index) => ({ ref: `a${index}`, name: 'Commun', website: null })),
      { expertises: [] },
    )

    if (read.status !== 'ok') throw new Error('lecture attendue en succès')
    expect(read.coverage.ambiguous).toBe(30)
    expect(read.review).toHaveLength(MARKET_REVIEW_QUEUE_MAX)
  })
})

describe('portfolioFor — le fit structurel (#1635.4)', () => {
  const COUVERT = signalRow({ companyKey: 'thales', matchKey: 'thales', websiteDomain: null, pathsTotal: 41 })

  it('rend `null` sans expertise déclarée — la question ne se pose pas', async () => {
    const service = await buildService({ signals: { find: jest.fn().mockResolvedValue([COUVERT]) } })

    const read = await service.portfolioFor([{ ref: 'a1', name: 'Thales', website: null }], { expertises: [] })

    if (read.status !== 'ok') throw new Error('lecture attendue en succès')
    expect(read.structuralFit).toBeNull()
  })

  it('rend `null` quand les expertises déclarées sont vides ou blanches', async () => {
    const service = await buildService({ signals: { find: jest.fn().mockResolvedValue([COUVERT]) } })

    const read = await service.portfolioFor([{ ref: 'a1', name: 'Thales', website: null }], {
      expertises: ['   ', ''],
    })

    if (read.status !== 'ok') throw new Error('lecture attendue en succès')
    expect(read.structuralFit).toBeNull()
  })

  it('compte les comptes couverts dont la pile observée recoupe une expertise', async () => {
    const stacksFind = jest.fn().mockResolvedValue([
      { companyKey: 'thales', techno: 'Kubernetes' },
      { companyKey: 'thales', techno: 'Terraform' },
    ])
    const service = await buildService({
      signals: { find: jest.fn().mockResolvedValue([COUVERT]) },
      stacks: { find: stacksFind },
    })

    const read = await service.portfolioFor([{ ref: 'a1', name: 'Thales', website: null }], {
      expertises: ['Infrastructure & Kubernetes'],
    })

    if (read.status !== 'ok') throw new Error('lecture attendue en succès')
    expect(read.structuralFit).toEqual({
      matching: 1,
      covered: 1,
      expertises: ['Infrastructure & Kubernetes'],
    })
  })

  it('prend les comptes COUVERTS pour dénominateur, jamais le portefeuille entier', async () => {
    const service = await buildService({
      signals: {
        find: jest
          .fn()
          .mockResolvedValue([
            COUVERT,
            signalRow({ companyKey: 'sous', matchKey: 'sous', websiteDomain: null, pathsTotal: 2 }),
          ]),
      },
      stacks: { find: jest.fn().mockResolvedValue([{ companyKey: 'thales', techno: 'Data' }]) },
    })

    const read = await service.portfolioFor(
      [
        { ref: 'a1', name: 'Thales', website: null },
        { ref: 'a2', name: 'Sous', website: null },
        { ref: 'a3', name: 'Absente', website: null },
      ],
      { expertises: ['Data'] },
    )

    if (read.status !== 'ok') throw new Error('lecture attendue en succès')
    // Trois comptes, UN couvert : le dénominateur du fit est 1, pas 3.
    expect(read.coverage.accounts).toBe(3)
    expect(read.structuralFit).toEqual({ matching: 1, covered: 1, expertises: ['Data'] })
  })

  it('rend 0 recoupement quand rien ne correspond — avec des expertises, zéro est une VRAIE mesure', async () => {
    const service = await buildService({
      signals: { find: jest.fn().mockResolvedValue([COUVERT]) },
      stacks: { find: jest.fn().mockResolvedValue([{ companyKey: 'thales', techno: 'COBOL' }]) },
    })

    const read = await service.portfolioFor([{ ref: 'a1', name: 'Thales', website: null }], {
      expertises: ['Data'],
    })

    if (read.status !== 'ok') throw new Error('lecture attendue en succès')
    expect(read.structuralFit).toEqual({ matching: 0, covered: 1, expertises: ['Data'] })
  })

  it('ne lit AUCUNE pile quand aucun compte n’est couvert', async () => {
    const stacksFind = jest.fn().mockResolvedValue([])
    const service = await buildService({
      signals: { find: jest.fn().mockResolvedValue([]) },
      stacks: { find: stacksFind },
    })

    const read = await service.portfolioFor([{ ref: 'a1', name: 'Absente', website: null }], {
      expertises: ['Data'],
    })

    if (read.status !== 'ok') throw new Error('lecture attendue en succès')
    expect(stacksFind).not.toHaveBeenCalled()
    expect(read.structuralFit).toEqual({ matching: 0, covered: 0, expertises: ['Data'] })
  })
})

describe('portfolioFor — ce qui ne sort JAMAIS de la mémoire marché', () => {
  it('ne rend ni date d’observation, ni étiquette de corpus, ni identité', async () => {
    const find = jest.fn().mockResolvedValue([
      signalRow({
        companyKey: 'roche-a',
        matchKey: 'roche',
        websiteDomain: null,
        pathsTotal: 12,
        corpusLabel: 'lot-2026-09',
      }),
      signalRow({ companyKey: 'roche-b', matchKey: 'roche', websiteDomain: null, pathsTotal: 9 }),
    ])
    const service = await buildService({ signals: { find } })

    const read = await service.portfolioFor([{ ref: 'a1', name: 'Roche', website: null }], { expertises: [] })

    if (read.status !== 'ok') throw new Error('lecture attendue en succès')
    const serialise = JSON.stringify(read)
    expect(serialise).not.toContain('corpusLabel')
    expect(serialise).not.toContain('lot-2026-09')
  })

  it('porte SON horodatage de calcul — un agrégat non daté se date de son rendu', async () => {
    const service = await buildService({ signals: { find: jest.fn().mockResolvedValue([]) } })

    const read = await service.portfolioFor([{ ref: 'a1', name: 'Absente', website: null }], { expertises: [] })

    if (read.status !== 'ok') throw new Error('lecture attendue en succès')
    expect(Number.isNaN(Date.parse(read.computedAt))).toBe(false)
  })
})

/* ───────────────────────────────────────────────────────────────────────────
 * #1575.1 — `coveredRefsFor` : QUELS comptes sont couverts, pas COMBIEN
 * ───────────────────────────────────────────────────────────────────────────*/

describe('coveredRefsFor — le même arbitre que portfolioFor, une réponse de plus', () => {
  it('rend les références des comptes couverts, et elles seules', async () => {
    const find = jest.fn().mockResolvedValue([
      signalRow({ companyKey: 'thales', matchKey: 'thales', websiteDomain: 'thalesgroup.com', pathsTotal: 41 }),
      // résolu mais SOUS le seuil — connu du corpus, pas couvert pour autant
      signalRow({ companyKey: 'petite', matchKey: 'petite', websiteDomain: 'petite.fr', pathsTotal: 2 }),
    ])
    const service = await buildService({ signals: { find } })

    const refs = await service.coveredRefsFor([
      { ref: 'a1', name: 'Thales', website: 'https://thalesgroup.com' },
      { ref: 'a2', name: 'Petite', website: 'https://petite.fr' },
      { ref: 'a3', name: 'Absente Du Corpus', website: null },
    ])

    expect(refs).toEqual(['a1'])
  })

  it('n’en rend AUCUNE sur une ambiguïté — un homonyme non tranché n’est pas couvert', async () => {
    const find = jest
      .fn()
      .mockResolvedValue([
        signalRow({ companyKey: 'roche-a', matchKey: 'roche', websiteDomain: null, pathsTotal: 12 }),
        signalRow({ companyKey: 'roche-b', matchKey: 'roche', websiteDomain: null, pathsTotal: 9 }),
      ])
    const service = await buildService({ signals: { find } })

    expect(await service.coveredRefsFor([{ ref: 'a1', name: 'Roche', website: null }])).toEqual([])
  })

  /**
   * ⚠️ LE PIÈGE DU LOT. `null` = « je n'ai pas pu lire », `[]` = « j'ai lu, et
   * aucun compte n'est couvert ». Les confondre transforme une panne de lecture
   * en un portefeuille vide — le défaut n°1 du dépôt, appliqué à un FILTRE :
   * l'écran annoncerait « aucun compte avec des parcours observés » alors qu'il
   * n'en sait rien.
   */
  it('rend `null` — pas un tableau vide — quand la lecture échoue', async () => {
    const service = await buildService({
      signals: { find: jest.fn().mockRejectedValue(new Error('base injoignable')) },
    })

    expect(await service.coveredRefsFor([{ ref: 'a1', name: 'Thales', website: null }])).toBeNull()
  })

  it('sur un portefeuille vide, rend un tableau vide sans interroger la base', async () => {
    const find = jest.fn().mockResolvedValue([])
    const service = await buildService({ signals: { find } })

    expect(await service.coveredRefsFor([])).toEqual([])
    expect(find).not.toHaveBeenCalled()
  })

  /**
   * L'UNE ET L'AUTRE LECTURE DOIVENT S'ACCORDER. `portfolioFor` compte, celle-ci
   * nomme ; deux boucles distinctes divergeraient au premier changement d'arbitre
   * — c'est le défaut « deux lectures du même objet qui divergent », déjà payé
   * deux fois sur ce module.
   */
  it('accorde son compte avec celui de `portfolioFor`, sur le même portefeuille', async () => {
    const lookups = [
      { ref: 'a1', name: 'Thales', website: 'https://thalesgroup.com' },
      { ref: 'a2', name: 'Petite', website: 'https://petite.fr' },
      { ref: 'a3', name: 'Absente', website: null },
    ]
    const rows = [
      signalRow({ companyKey: 'thales', matchKey: 'thales', websiteDomain: 'thalesgroup.com', pathsTotal: 41 }),
      signalRow({ companyKey: 'petite', matchKey: 'petite', websiteDomain: 'petite.fr', pathsTotal: 2 }),
    ]
    const service = await buildService({ signals: { find: jest.fn().mockResolvedValue(rows) } })

    const read = await service.portfolioFor(lookups, { expertises: [] })
    const refs = await service.coveredRefsFor(lookups)

    if (read.status !== 'ok') throw new Error('lecture attendue en succès')
    expect(refs).not.toBeNull()
    expect(refs?.length).toBe(read.coverage.covered)
  })
})
