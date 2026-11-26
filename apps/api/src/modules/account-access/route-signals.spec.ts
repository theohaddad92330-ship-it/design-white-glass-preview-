import {
  accumulatedRouteCriteriaOf,
  declaredRouteCriteriaOf,
  normalizeCompanyName,
  routeFactsOf,
  routeSignalsOf,
} from './route-signals'

// #3278.1 (lot M11 09/10) — les deux routes « veille seule » et « depuis un
// talent » ne se nomment que sur un FAIT : un niveau d'effort posé, une
// expérience de vivier au nom du client. Jamais une route devinée.
describe('routeSignalsOf', () => {
  it('nomme la veille seulement quand le niveau d’effort posé est « watch »', () => {
    expect(routeSignalsOf({ sprint: 'watch' }, false)).toEqual({ watch_only: true })
    for (const sprint of ['focus', 'extension', 'volume', 'no_go', 'partner_route', null, undefined]) {
      expect(routeSignalsOf({ sprint }, false)).toEqual({})
    }
  })

  it('nomme le talent seulement quand une expérience du vivier a été trouvée', () => {
    expect(routeSignalsOf({ sprint: null }, true)).toEqual({ talent_from_account: true })
    expect(routeSignalsOf({ sprint: 'watch' }, true)).toEqual({ watch_only: true, talent_from_account: true })
  })

  it('un compte sans aucun fait ne rend aucune clé — jamais un `false` qui dirait « vérifié »', () => {
    expect(routeSignalsOf(null, false)).toEqual({})
  })
})

// #3278.1 (décision Louis 11/10/2026) — « événement ou communauté » et « inbound / contenu » :
// deux faits DÉCLARÉS sur la fiche. Une colonne vide ou blanche ne dit rien.
describe('routeSignalsOf / routeFactsOf — événement et inbound', () => {
  it('nomme chaque route seulement quand son fait est déclaré (texte non vide)', () => {
    expect(routeSignalsOf({ declared_route_event: 'Salon Big Data, 12/09' }, false)).toEqual({ event_community: true })
    expect(routeSignalsOf({ declared_route_inbound: 'Livre blanc IA' }, false)).toEqual({ inbound_content: true })
    expect(routeSignalsOf({ declared_route_event: 'a', declared_route_inbound: 'b', sprint: 'watch' }, true)).toEqual({
      watch_only: true,
      talent_from_account: true,
      event_community: true,
      inbound_content: true,
    })
  })

  it('un fait vide, blanc ou absent ne rend aucune clé — jamais un `false` qui dirait « vérifié »', () => {
    for (const value of [null, undefined, '', '   ']) {
      expect(routeSignalsOf({ declared_route_event: value, declared_route_inbound: value }, false)).toEqual({})
    }
  })

  it('relaie le texte déclaré tel quel (rogné), sous les clés que lit Laura', () => {
    expect(routeFactsOf({ declared_route_event: '  Salon X ', declared_route_inbound: null })).toEqual({
      event: 'Salon X',
    })
    expect(routeFactsOf({ declared_route_event: ' ', declared_route_inbound: 'Webinaire' })).toEqual({
      inbound: 'Webinaire',
    })
    expect(routeFactsOf(null)).toEqual({})
  })
})

describe('normalizeCompanyName', () => {
  it('rapproche casse, espaces et accents — rien de plus', () => {
    expect(normalizeCompanyName('  Société   Générale ')).toBe('societe generale')
    expect(normalizeCompanyName('SOCIETE GENERALE')).toBe('societe generale')
  })

  it('ne fabrique jamais une égalité floue (suffixe, sigle) — et sait dire NON', () => {
    expect(normalizeCompanyName('Société Générale SA')).not.toBe(normalizeCompanyName('Société Générale'))
    expect(normalizeCompanyName('SG')).not.toBe(normalizeCompanyName('Société Générale'))
  })

  it('rend null pour un nom vide', () => {
    expect(normalizeCompanyName('   ')).toBeNull()
    expect(normalizeCompanyName(null)).toBeNull()
  })
})

describe('AccountAccessService.routeInputs — l’appelant réel (base → fonction pure)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { AccountAccessService } = require('./account-access.service') as typeof import('./account-access.service')

  function build(account: Record<string, unknown> | null, names: Array<string | null>) {
    const accounts = { findOne: jest.fn().mockResolvedValue(account) }
    const query = jest.fn().mockResolvedValue(names.map(name => ({ name })))
    const experiences = { manager: { query } }
    const service = new AccountAccessService({} as never, accounts as never, {} as never, experiences as never)
    return { service, accounts, query }
  }

  it('trouve le talent par le nom exact du compte, et lit dans CET espace seulement', async () => {
    const { service, accounts, query } = build(
      { id: 'a-1', sprint: null, company_name: 'Société Générale', trade_name: null },
      ['Capgemini', 'SOCIETE GENERALE'],
    )
    await expect(service.routeInputs('w-1', 'a-1')).resolves.toMatchObject({ signals: { talent_from_account: true } })
    expect(accounts.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'a-1', workspace_id: 'w-1' } }),
    )
    expect(query.mock.calls[0][1]).toEqual(['w-1'])
    expect(query.mock.calls[0][0]).toContain('archived_at IS NULL')
    expect(query.mock.calls[0][0]).toContain('client_masked = false')
  })

  it('sait dire NON : un vivier qui n’a jamais travaillé chez ce client ne rend aucun signal', async () => {
    const { service } = build({ id: 'a-1', sprint: 'focus', company_name: 'Société Générale', trade_name: 'SG' }, [
      'Société Générale SA',
      null,
    ])
    await expect(service.routeInputs('w-1', 'a-1')).resolves.toMatchObject({ signals: {} })
  })

  it('un compte hors de l’espace ne rend rien, sans lire le vivier', async () => {
    const { service, query } = build(null, ['Société Générale'])
    await expect(service.routeInputs('w-2', 'a-1')).resolves.toMatchObject({ signals: {} })
    expect(query).not.toHaveBeenCalled()
  })

  it('le niveau veille seul suffit à nommer la veille', async () => {
    const { service } = build({ id: 'a-1', sprint: 'watch', company_name: 'Acme', trade_name: null }, [])
    await expect(service.routeInputs('w-1', 'a-1')).resolves.toMatchObject({ signals: { watch_only: true } })
  })
})

// #3278.2 (lot M11) — les six critères déclarés sur la fiche.
describe('declaredRouteCriteriaOf', () => {
  it('relaie chaque critère déclaré sous la clé que lit Laura, texte trimé', () => {
    expect(
      declaredRouteCriteriaOf({
        declared_route_scope: '  TMA du SI RH ',
        declared_route_timing: 'appel d’offres au T1',
        declared_route_partners: null,
      }),
    ).toEqual({ scope: 'TMA du SI RH', timing: 'appel d’offres au T1' })
  })

  it('sait dire NON : un critère vide ou non déclaré n’a pas de clé', () => {
    expect(declaredRouteCriteriaOf({ declared_route_history: '   ', declared_route_objectives: null })).toEqual({})
    expect(declaredRouteCriteriaOf(null)).toEqual({})
  })
})

describe('AccountAccessService.routeInputs — critères déclarés', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { AccountAccessService } = require('./account-access.service') as typeof import('./account-access.service')

  it('relit les colonnes déclarées du compte de CET espace', async () => {
    const accounts = {
      findOne: jest.fn().mockResolvedValue({
        id: 'a-1',
        sprint: null,
        company_name: 'Acme',
        trade_name: null,
        declared_route_objectives: 'réduire le run de 20 %',
      }),
    }
    const service = new AccountAccessService({} as never, accounts as never, {} as never)
    await expect(service.routeInputs('w-1', 'a-1')).resolves.toEqual({
      signals: {},
      declaredCriteria: { objectives: 'réduire le run de 20 %' },
      facts: {},
      accumulated: {},
    })
  })
})

describe('AccountAccessService.routeInputs — événement et inbound', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { AccountAccessService } = require('./account-access.service') as typeof import('./account-access.service')

  it('relit les deux faits déclarés du compte de CET espace, signal ET texte', async () => {
    const accounts = {
      findOne: jest.fn().mockResolvedValue({
        id: 'a-1',
        sprint: null,
        company_name: 'Acme',
        trade_name: null,
        declared_route_event: 'Salon Big Data, 12/09',
        declared_route_inbound: null,
      }),
    }
    const service = new AccountAccessService({} as never, accounts as never, {} as never)
    await expect(service.routeInputs('w-1', 'a-1')).resolves.toMatchObject({
      signals: { event_community: true },
      facts: { event: 'Salon Big Data, 12/09' },
    })
    expect(accounts.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ declared_route_event: true, declared_route_inbound: true }),
      }),
    )
  })
})

// #3278.2b (Louis 15/10) — budget, disponibilité, réseau existant : déclaratifs, vide = absent.
describe('declaredRouteCriteriaOf — budget / disponibilité / réseau', () => {
  it('relaie les trois quand saisis, tronqués ; vide ou null ne fait aucune clé', () => {
    expect(
      declaredRouteCriteriaOf({
        declared_route_budget: ' 300 k€ ',
        declared_route_availability: 'Deux consultants',
        declared_route_network: '   ',
      }),
    ).toEqual({ budget: '300 k€', availability: 'Deux consultants' })
    expect(declaredRouteCriteriaOf({ declared_route_network: null })).toEqual({})
  })
})

// #3278.3 (#3259.3) — « preuves » et « historique des canaux » : deux entrées de la route lues sur ce que
// l'espace a DÉJÀ accumulé (références publiables du secteur, messages préparés sur le compte) — jamais saisies.
describe('accumulatedRouteCriteriaOf', () => {
  it('nomme les références publiables du secteur et les canaux déjà utilisés, comptés', () => {
    expect(
      accumulatedRouteCriteriaOf({
        sector: 'Banque',
        sectorReferences: 2,
        channelCounts: [
          { channel: 'email', count: 3 },
          { channel: 'linkedin', count: 1 },
        ],
      }),
    ).toEqual({
      proofs: '2 références client publiables dans le secteur Banque',
      channel_history: 'email ×3, linkedin ×1 (messages préparés sur ce compte)',
    })
  })

  it('une référence au singulier', () => {
    expect(accumulatedRouteCriteriaOf({ sector: 'Banque', sectorReferences: 1, channelCounts: [] })).toEqual({
      proofs: '1 référence client publiable dans le secteur Banque',
    })
  })

  it('sait dire NON : zéro référence, secteur inconnu ou aucun message ne font AUCUNE clé (jamais « 0 »)', () => {
    expect(accumulatedRouteCriteriaOf({ sector: 'Banque', sectorReferences: 0, channelCounts: [] })).toEqual({})
    expect(accumulatedRouteCriteriaOf({ sector: '  ', sectorReferences: 4, channelCounts: [] })).toEqual({})
    expect(
      accumulatedRouteCriteriaOf({
        sector: null,
        sectorReferences: 4,
        channelCounts: [{ channel: 'email', count: 0 }],
      }),
    ).toEqual({})
  })
})

describe('AccountAccessService.routeInputs — entrées accumulées', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { AccountAccessService } = require('./account-access.service') as typeof import('./account-access.service')

  it('lit, dans CET espace, les références du secteur (hors ce compte) et les messages des contacts du compte', async () => {
    const find = jest.fn(async (entity: { name: string }, options: { where: Record<string, unknown> }) => {
      if (entity.name === 'AccountEntity') return [{ id: 'a-2' }, { id: 'a-3' }]
      if (entity.name === 'TestimonialEntity') return [{ id: 't-1' }, { id: 't-2' }]
      if (entity.name === 'ContactEntity') return [{ id: 'c-1' }]
      if (entity.name === 'OutreachMessageEntity') return [{ channel: 'email' }, { channel: 'email' }]
      throw new Error(`entité inattendue ${entity.name} ${JSON.stringify(options.where)}`)
    })
    const accounts = {
      findOne: jest.fn().mockResolvedValue({ id: 'a-1', sector: 'Banque', sprint: null, company_name: 'Acme' }),
      manager: { find },
    }
    const service = new AccountAccessService({} as never, accounts as never, {} as never)
    const result = await service.routeInputs('w-1', 'a-1')
    expect(result.accumulated).toEqual({
      proofs: '2 références client publiables dans le secteur Banque',
      channel_history: 'email ×2 (messages préparés sur ce compte)',
    })
    const firstCall = find.mock.calls[0]
    expect(JSON.stringify(firstCall[1].where)).toContain('w-1')
  })

  it('une lecture qui échoue ne fabrique rien : accumulated vide, le reste du pont part', async () => {
    const accounts = {
      findOne: jest.fn().mockResolvedValue({ id: 'a-1', sector: 'Banque', sprint: null, company_name: 'Acme' }),
      manager: { find: jest.fn().mockRejectedValue(new Error('db down')) },
    }
    const service = new AccountAccessService({} as never, accounts as never, {} as never)
    await expect(service.routeInputs('w-1', 'a-1')).resolves.toMatchObject({ accumulated: {}, signals: {} })
  })
})
