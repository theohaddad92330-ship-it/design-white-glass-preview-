import { MARKET_MEMORY_COHORT_INDEX_SETTINGS, MARKET_MEMORY_MIN_PATHS } from '@bellum/contracts'
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

/**
 * #1640.2 — L'INDEX PAR COHORTE D'UNE ENTREPRISE, VU DE LA FAÇADE.
 *
 * Ce que cette suite tient, et qui est le cœur du lot : le calcul de
 * `@bellum/contracts` a enfin un APPELANT, et cet appelant lit la cohorte
 * SANS recopier la règle d'éligibilité en SQL. Les tests du calcul lui-même
 * vivent dans `packages/contracts/src/schemas/market-memory-cohort-index.test.ts` ;
 * ici on mesure la FAÇADE — ce qu'elle interroge, ce qu'elle rend, et ce
 * qu'elle ne fait pas.
 */

type Row = Record<string, unknown>

const BRACKET = '11-50'

function signalRow(overrides: Row = {}): Row {
  return {
    companyKey: 'thales',
    companyName: 'Thales',
    matchKey: 'thales',
    websiteDomain: 'thalesgroup.com',
    pathsTotal: 20,
    headcountBracket: BRACKET,
    // ⚠️ `numeric` Postgres revient en CHAÎNE — c'est la forme réelle, pas un
    // nombre. Un test qui poserait `80` ici ne mesurerait pas la conversion.
    externalizationScore: '80',
    roleFamilies: [],
    ...overrides,
  }
}

/** Une cohorte de `count` pairs, scores 0, 4, 8… — assez large pour `minCohortSize`. */
function cohort(count: number): Row[] {
  return Array.from({ length: count }, (_, i) =>
    signalRow({
      companyKey: `peer-${i}`,
      matchKey: `peer-${i}`,
      websiteDomain: `peer-${i}.example`,
      externalizationScore: String(i * 4),
    }),
  )
}

interface Probe {
  /** Les `where` passés à `signals.find` — pour prouver ce que la façade DEMANDE. */
  readonly finds: Row[]
}

async function buildService(options: { target?: Row | null; peers?: Row[] } = {}) {
  const target = options.target === undefined ? signalRow() : options.target
  const peers = options.peers ?? []
  const probe: Probe = { finds: [] }

  const find = jest.fn(async (args: { where?: Row } = {}) => {
    const where = args.where ?? {}
    probe.finds.push(where)
    // La cohorte : la façade ne filtre QUE sur la tranche.
    if ('headcountBracket' in where) {
      return peers.filter(row => row.headcountBracket === where.headcountBracket)
    }
    // Le rapprochement (`resolveDetailed`) : domaine puis nom normalisé.
    if (target && (where.websiteDomain === target.websiteDomain || where.matchKey === target.matchKey)) {
      return [target]
    }
    return []
  })

  const moduleRef = await Test.createTestingModule({
    providers: [
      MarketMemoryService,
      {
        provide: getRepositoryToken(MarketCompanySignalEntity),
        useValue: { findOne: jest.fn().mockResolvedValue(target), find },
      },
      {
        provide: getRepositoryToken(MarketEsnClientEntity),
        useValue: { find: jest.fn().mockResolvedValue([]) },
      },
      {
        provide: getRepositoryToken(MarketCompanyStackEntity),
        useValue: { find: jest.fn().mockResolvedValue([]) },
      },
      {
        provide: getRepositoryToken(MarketExEsnAtClientEntity),
        useValue: { find: jest.fn().mockResolvedValue([]) },
      },
      {
        provide: getRepositoryToken(MarketCompanyAliasEntity),
        useValue: { find: jest.fn().mockResolvedValue([]) },
      },
      {
        provide: getRepositoryToken(MarketCompanyResolutionOverrideEntity),
        useValue: { find: jest.fn().mockResolvedValue([]) },
      },
    ],
  })
    .setLogger(new Logger())
    .compile()

  return { service: moduleRef.get(MarketMemoryService), probe, find }
}

const LOOKUP = { ref: 'account-1', name: 'Thales', website: 'https://thalesgroup.com', country: 'FR' }

describe('#1640.2 — MarketMemoryService.cohortIndexFor', () => {
  it('rend l’index ET ses axes pour une entreprise rapprochée, cohorte suffisante', async () => {
    const { service } = await buildService({ peers: [signalRow(), ...cohort(24)] })

    const read = await service.cohortIndexFor(LOOKUP)

    expect(read.status).toBe('ok')
    if (read.status !== 'ok' || read.index === null) throw new Error('index attendu')
    expect(read.index.kind).toBe('calculable')
    if (read.index.kind !== 'calculable') throw new Error('calculable attendu')
    // Un score n'est JAMAIS nu : ses trois axes voyagent avec lui.
    expect(read.index.evaluated.map(axis => axis.axis)).toEqual([
      'cohortRelativePosition',
      'cohortCoverage',
      'ownObservations',
    ])
    expect(read.index.cohort).toEqual({ bracket: BRACKET, measuredPeers: 25 })
    // Et la clé du corpus ne voyage pas.
    expect(JSON.stringify(read.index)).not.toContain('thales')
  })

  it('ne recopie AUCUNE règle d’éligibilité en SQL — la cohorte se lit sur la seule TRANCHE', async () => {
    // Le point : `WHERE paths_total >= 3 AND externalization_score IS NOT NULL`
    // serait une SECONDE écriture de `isCohortPeer`, dans un autre langage, qui
    // diverge le jour où l'échelle bouge d'un cran — sans que rien ne le dise.
    const { service, probe } = await buildService({ peers: [signalRow(), ...cohort(24)] })

    await service.cohortIndexFor(LOOKUP)

    const cohortQuery = probe.finds.find(where => 'headcountBracket' in where)
    expect(cohortQuery).toEqual({ headcountBracket: BRACKET })
    expect(Object.keys(cohortQuery!)).toEqual(['headcountBracket'])
  })

  it('applique quand même le filtre — une ligne sous le plancher n’est pas un PAIR', async () => {
    // La règle vit dans le calcul, elle n'est donc pas perdue : 24 lignes sous
    // le plancher produit ne font pas une cohorte de 25.
    const sousPlancher = cohort(24).map(row => ({ ...row, pathsTotal: MARKET_MEMORY_MIN_PATHS - 1 }))
    const { service } = await buildService({ peers: [signalRow(), ...sousPlancher] })

    const read = await service.cohortIndexFor(LOOKUP)

    expect(read.status).toBe('ok')
    if (read.status !== 'ok' || read.index === null) throw new Error('index attendu')
    expect(read.index).toEqual({ kind: 'excluded', reason: 'cohortTooSmall' })
  })

  it('un score illisible vaut `null`, jamais un `0` inventé', async () => {
    // « On n'a pas su lire » et « le corpus dit zéro » ne sont pas la même
    // affirmation — et `0` placerait l'entreprise en bas de sa cohorte.
    const { service } = await buildService({
      target: signalRow({ externalizationScore: 'pas-un-nombre' }),
      peers: [signalRow(), ...cohort(24)],
    })

    const read = await service.cohortIndexFor(LOOKUP)

    if (read.status !== 'ok' || read.index === null) throw new Error('index attendu')
    expect(read.index).toEqual({ kind: 'excluded', reason: 'noScore' })
  })

  it('rend `null` — et AUCUNE raison d’exclusion — quand l’entreprise n’est pas rapprochée', async () => {
    // `unresolved` / `ambiguous` ne sont pas des lignes DU corpus : leur
    // inventer une sixième raison mentirait sur ce que les cinq énumèrent.
    const { service } = await buildService({ target: null })

    expect(await service.cohortIndexFor(LOOKUP)).toEqual({ status: 'ok', index: null })
  })

  it('une lecture en panne rend `unavailable`, jamais « pas d’index »', async () => {
    // Une panne ne se raconte pas comme une absence de données : ce serait une
    // bonne nouvelle fausse.
    const { service, find } = await buildService({ peers: [signalRow(), ...cohort(24)] })
    find.mockRejectedValue(new Error('base indisponible'))

    const read = await service.cohortIndexFor(LOOKUP)

    expect(read.status).toBe('unavailable')
  })

  it('ne lit AUCUNE cohorte quand la tranche d’effectif est inconnue', async () => {
    // Sans tranche il n'y a pas de cohorte : la requête serait payée pour rien,
    // et la raison (`noBracket`) est déjà celle du calcul.
    const { service, probe } = await buildService({ target: signalRow({ headcountBracket: null }) })

    const read = await service.cohortIndexFor(LOOKUP)

    if (read.status !== 'ok' || read.index === null) throw new Error('index attendu')
    expect(read.index).toEqual({ kind: 'excluded', reason: 'noBracket' })
    expect(probe.finds.some(where => 'headcountBracket' in where)).toBe(false)
  })

  it('ne relit pas la cohorte pour un second compte de la MÊME tranche', async () => {
    // Deux comptes de la même taille partagent une cohorte, qui est un fait de
    // marché commun à tous les espaces — la relire par dossier ferait payer à
    // chaque visiteur une lecture identique pour tout le monde.
    const { service, probe } = await buildService({ peers: [signalRow(), ...cohort(24)] })

    await service.cohortIndexFor(LOOKUP)
    await service.cohortIndexFor({ ...LOOKUP, ref: 'account-2' })

    expect(probe.finds.filter(where => 'headcountBracket' in where)).toHaveLength(1)
  })

  it('le seuil de matière PROPRE est plus exigeant que le plancher de visibilité', async () => {
    // `minOwnPathsForIndex` gouverne la CONFIANCE dans un index gradué ;
    // `MARKET_MEMORY_MIN_PATHS` ne garantit que la VISIBILITÉ. Un compte visible
    // n'a donc pas forcément un index — et la raison le dit.
    expect(MARKET_MEMORY_COHORT_INDEX_SETTINGS.minOwnPathsForIndex).toBeGreaterThan(MARKET_MEMORY_MIN_PATHS)
    const { service } = await buildService({
      target: signalRow({ pathsTotal: MARKET_MEMORY_MIN_PATHS }),
      peers: [signalRow({ pathsTotal: MARKET_MEMORY_MIN_PATHS }), ...cohort(24)],
    })

    const read = await service.cohortIndexFor(LOOKUP)

    if (read.status !== 'ok' || read.index === null) throw new Error('index attendu')
    expect(read.index).toEqual({ kind: 'excluded', reason: 'belowOwnPathsThreshold' })
  })
})
