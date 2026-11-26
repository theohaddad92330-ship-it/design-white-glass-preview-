import { AccountAccessService } from './account-access.service'

/**
 * #2646.1 (décision Louis 20/09/2026) — L'ACCÈS SE NOMME : direct / rang 2 /
 * inconnu / rang 3+.
 *
 * `rang3_plus` se dérive de ce que le produit sait DÉJÀ, sans donnée neuve :
 * un rang 1 CONCURRENT est en place (`account_entities.rank1_incumbent`) ET
 * l'espace n'a déclaré AUCUN partenaire sur ce compte (`account_partners`,
 * `relationship = 'partner'`, non écarté). La fonction pure qui tranche vit
 * dans `@bellum/contracts` (`accountAccessLevel`, GA-26) ; ce test verrouille
 * l'APPELANT côté compte réel (voir aussi le candidat Découvrir sans fiche
 * compte, côté web).
 */

type Row = Record<string, unknown>

function buildService(opts: {
  entityRows?: Row[]
  hasPartnerRow?: boolean
  partnerName?: string
}): AccountAccessService {
  const facts = {
    find: jest.fn().mockResolvedValue([]),
    // La seule requête SQL brute de ce test : « existe-t-il un partenaire
    // DÉCLARÉ, non écarté, sur ce compte ? », et depuis #2646.1 (badge sans
    // preuve) SON NOM — c'est ce nom qui fonde `accessLevelFact`. Les autres
    // requêtes brutes du service (contacts, sites, communauté, question)
    // passent par la même méthode `query` — on ne peut donc pas les
    // distinguer par mock ciblé, seulement rendre la réponse générique
    // attendue par CHACUNE.
    query: jest.fn().mockImplementation(async (sql: string) => {
      if (sql.includes('FROM account_partners')) {
        return opts.hasPartnerRow ? [{ name: opts.partnerName ?? 'Sopra' }] : []
      }
      return []
    }),
    save: jest.fn(),
    create: jest.fn(),
  }
  const accounts = {
    findOne: jest.fn().mockResolvedValue({
      id: 'acc-1',
      siren: null,
      priority_gate: 'pending',
      raw_analysis: {},
      signals_collected_at: null,
    }),
  }
  const entities = { find: jest.fn().mockResolvedValue(opts.entityRows ?? []) }
  return new AccountAccessService(facts as never, accounts as never, entities as never)
}

describe('AccountAccessService — le niveau d’accès nommé (#2646.1)', () => {
  it('`direct` — aucune entité ne porte de rang 1 en place', async () => {
    const service = buildService({
      entityRows: [
        {
          id: 'e1',
          workspace_id: 'ws-1',
          account_id: 'acc-1',
          name: 'Siège',
          kind: 'bu',
          is_default: false,
          rank1_incumbent: 'no',
        },
      ],
      hasPartnerRow: false,
    })
    const landscape = await service.landscape('ws-1', 'acc-1')
    expect(landscape.accessLevel).toBe('direct')
  })

  it('`inconnu` — le rang 1 n’est établi sur AUCUNE entité, jamais `rang3_plus` par défaut (GA-18/GA-19)', async () => {
    const service = buildService({ entityRows: [], hasPartnerRow: false })
    const landscape = await service.landscape('ws-1', 'acc-1')
    expect(landscape.accessLevel).toBe('inconnu')
  })

  it('`rang2` — un rang 1 est en place ET un partenaire est déclaré sur ce compte', async () => {
    const service = buildService({
      entityRows: [
        {
          id: 'e1',
          workspace_id: 'ws-1',
          account_id: 'acc-1',
          name: 'DSI',
          kind: 'bu',
          is_default: false,
          rank1_incumbent: 'yes',
        },
      ],
      hasPartnerRow: true,
    })
    const landscape = await service.landscape('ws-1', 'acc-1')
    expect(landscape.accessLevel).toBe('rang2')
  })

  it('`rang3_plus` — un rang 1 est en place et AUCUN partenaire n’est déclaré (la règle exacte de Louis)', async () => {
    const service = buildService({
      entityRows: [
        {
          id: 'e1',
          workspace_id: 'ws-1',
          account_id: 'acc-1',
          name: 'DSI',
          kind: 'bu',
          is_default: false,
          rank1_incumbent: 'yes',
        },
      ],
      hasPartnerRow: false,
    })
    const landscape = await service.landscape('ws-1', 'acc-1')
    expect(landscape.accessLevel).toBe('rang3_plus')
  })
})

describe('AccountAccessService — le FAIT qui fonde le niveau, jamais l’état seul (#2646.1, corrigé le 21/09/2026)', () => {
  it('`direct` nomme les entités OUVERTES', async () => {
    const service = buildService({
      entityRows: [
        {
          id: 'e1',
          workspace_id: 'ws-1',
          account_id: 'acc-1',
          name: 'Siège',
          kind: 'bu',
          is_default: false,
          rank1_incumbent: 'no',
        },
      ],
      hasPartnerRow: false,
    })
    const landscape = await service.landscape('ws-1', 'acc-1')
    expect(landscape.accessLevelFact).toEqual({ kind: 'no_incumbent', entities: ['Siège'] })
  })

  it('`inconnu` ne porte AUCUN fait — en inventer un violerait « on n’affiche pas ce qu’on n’a pas »', async () => {
    const service = buildService({ entityRows: [], hasPartnerRow: false })
    const landscape = await service.landscape('ws-1', 'acc-1')
    expect(landscape.accessLevelFact).toBeNull()
  })

  it('`rang2` nomme l’entité verrouillée ET le partenaire, lu depuis `account_partners.name`', async () => {
    const service = buildService({
      entityRows: [
        {
          id: 'e1',
          workspace_id: 'ws-1',
          account_id: 'acc-1',
          name: 'DSI',
          kind: 'bu',
          is_default: false,
          rank1_incumbent: 'yes',
        },
      ],
      hasPartnerRow: true,
      partnerName: 'Sopra',
    })
    const landscape = await service.landscape('ws-1', 'acc-1')
    expect(landscape.accessLevelFact).toEqual({ kind: 'incumbent_with_partner', entities: ['DSI'], partner: 'Sopra' })
  })

  it('`rang3_plus` nomme l’entité verrouillée SANS partenaire', async () => {
    const service = buildService({
      entityRows: [
        {
          id: 'e1',
          workspace_id: 'ws-1',
          account_id: 'acc-1',
          name: 'DSI',
          kind: 'bu',
          is_default: false,
          rank1_incumbent: 'yes',
        },
      ],
      hasPartnerRow: false,
    })
    const landscape = await service.landscape('ws-1', 'acc-1')
    expect(landscape.accessLevelFact).toEqual({ kind: 'incumbent_without_partner', entities: ['DSI'] })
  })
})

describe('AccountAccessService — le score d’entité voyage avec ses axes (#4016 L9, renversement daté du 11/10/2026 de c48)', () => {
  it('chaque entité porte ses points par axe ET nomme les axes sans fait, jamais un zéro', async () => {
    const service = buildService({
      entityRows: [
        {
          id: 'e1',
          workspace_id: 'ws-1',
          account_id: 'acc-1',
          name: 'Filiale',
          kind: 'subsidiary',
          is_default: false,
          rank1_incumbent: 'yes',
        },
      ],
      hasPartnerRow: false,
    })
    const [entity] = (await service.landscape('ws-1', 'acc-1')).entities

    expect(entity?.reason_facts.map(fact => [fact.code, fact.points])).toEqual([
      ['kind', 25],
      ['rank1', 5],
    ])
    expect(entity?.reason_facts.reduce((sum, fact) => sum + fact.points, 0)).toBe(entity?.score)
    // Contacts et sites : aucun fait → NOMMÉS, pas comptés « 0 ».
    expect(entity?.missing_axes).toEqual(['contacts', 'sites'])
  })
})
