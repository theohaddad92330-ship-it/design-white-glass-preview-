import { CopilotBridgeController } from './copilot-bridge.controller'

/**
 * #3919 — « qu'est-ce qui bouge chez ce compte ? » / « les 5 comptes où ça
 * bouge ». MÊME lecture que la Veille du portefeuille
 * (`AccountsService.listAccountSignals`), jamais un second moteur (GA-26).
 * Voir le docblock de `accountSignals` (`copilot-bridge.controller.ts`).
 */
describe('CopilotBridgeController.accountSignals (#3919)', () => {
  const USER_ID = '99999999-9999-9999-9999-999999999999'
  const ACCOUNT_ID = '11111111-1111-1111-1111-111111111111'
  const OTHER_ACCOUNT_ID = '22222222-2222-2222-2222-222222222222'

  const workspaceContext = { resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'w-1' }) }
  // GA-333 — `resolveBusinessUnitScope` exige un service présent (sinon il LÈVE) :
  // même construction que `copilot-account-manager-review.spec.ts`.
  const businessUnits = { scopeFor: jest.fn().mockResolvedValue(null) }
  const NO_HIRES = { windowDays: 183, examinedContacts: 0, hires: [] }

  function signal(overrides: Record<string, unknown>) {
    return {
      id: 'sig-1',
      account_id: ACCOUNT_ID,
      company_name: 'SNCF',
      date: '2026-09-01',
      label: 'Levée de fonds Série B',
      source: 'Les Échos',
      type: 'funding',
      freshness: 'current',
      temporal_status: null,
      sales_implication: 'Budget dégagé pour la DSI',
      impact: 'Peut financer un projet de modernisation',
      importance: 'high',
      action_id: null,
      action_label: null,
      first_detected_at: '2026-09-02T00:00:00.000Z',
      last_seen_at: '2026-09-20T00:00:00.000Z',
      history_status: 'active',
      ...overrides,
    }
  }

  function call(deps: Record<string, unknown>, dto: Record<string, unknown>) {
    return CopilotBridgeController.prototype.accountSignals.call(
      {
        workspaceContext,
        businessUnits,
        ...deps,
        accounts: {
          findOneForWorkspace: jest.fn().mockResolvedValue({ type: 'success', output: { id: ACCOUNT_ID } }),
          listAccountSignals: jest.fn().mockResolvedValue([]),
          recentHires: jest.fn().mockResolvedValue(NO_HIRES),
          ...(deps.accounts as Record<string, unknown> | undefined),
        },
      } as never,
      { userId: USER_ID, ...dto } as never,
    )
  }

  it('un accountId introuvable dans cet espace rend account_not_found — jamais une liste vide', async () => {
    const accounts = { findOneForWorkspace: jest.fn().mockResolvedValue({ type: 'failure' }) }
    const out = await call({ accounts }, { accountId: ACCOUNT_ID })
    expect(out).toEqual({ error: 'account_not_found' })
  })

  it('un compte TROUVÉ sans signal actif rend accounts: [] — « lu, rien » ≠ « pas lu »', async () => {
    const out = (await call({}, { accountId: ACCOUNT_ID })) as { accountId: string; accounts: unknown[] }
    // #4286.15.c — sans lecteur de base commune branché, les tendances de marché se NOMMENT absentes.
    expect(out).toEqual({
      accountId: ACCOUNT_ID,
      accounts: [],
      recentHires: NO_HIRES,
      marketPatterns: { error: 'shared_base_unavailable' },
    })
  })

  const foundAccount = jest.fn().mockResolvedValue({ type: 'success', output: { id: ACCOUNT_ID } })

  it('relaie type, date, source, impact — `link: null` quand aucune URL n’est stockée pour ce signal', async () => {
    const accounts = {
      findOneForWorkspace: foundAccount,
      listAccountSignals: jest.fn().mockResolvedValue([signal({})]),
    }
    const out = (await call({ accounts }, { accountId: ACCOUNT_ID })) as {
      accounts: { accountId: string; companyName: string; signals: Record<string, unknown>[] }[]
    }
    expect(accounts.listAccountSignals).toHaveBeenCalledWith('w-1', USER_ID, null, ACCOUNT_ID)
    expect(out.accounts).toEqual([
      {
        accountId: ACCOUNT_ID,
        companyName: 'SNCF',
        signals: [
          {
            label: 'Levée de fonds Série B',
            type: 'funding',
            date: '2026-09-01',
            source: 'Les Échos',
            link: null,
            linkKind: null,
            impact: 'Peut financer un projet de modernisation',
            salesImplication: 'Budget dégagé pour la DSI',
            importance: 'high',
            actionLabel: null,
            firstDetectedAt: '2026-09-02T00:00:00.000Z',
            lastSeenAt: '2026-09-20T00:00:00.000Z',
          },
        ],
      },
    ])
  })

  // #3922.6 — Laura cite la preuve : le lien du flux unique atteint sa réponse, `null` sinon.
  it('#4977.1 — une offre d’emploi porte sa ville (`location`) jusqu’à Laura ; sans ville, aucune clé inventée', async () => {
    const accounts = {
      findOneForWorkspace: foundAccount,
      listAccountSignals: jest
        .fn()
        .mockResolvedValue([
          signal({ label: 'Chargé de Développement Technique', type: 'recrutement', location: 'Paris (75)' }),
          signal({ label: 'Développeur Java', type: 'recrutement', location: null }),
        ]),
    }
    const out = (await call({ accounts }, { accountId: ACCOUNT_ID })) as {
      accounts: { signals: Record<string, unknown>[] }[]
    }
    const [withCity, withoutCity] = out.accounts[0]!.signals
    expect(withCity).toMatchObject({ label: 'Chargé de Développement Technique', location: 'Paris (75)' })
    expect(withoutCity).not.toHaveProperty('location')
  })

  it('relaie le lien vérifiable du signal quand le pipeline l’a posé, jamais un lien inventé sinon (#3922.6)', async () => {
    const accounts = {
      findOneForWorkspace: foundAccount,
      listAccountSignals: jest
        .fn()
        .mockResolvedValue([
          signal({ id: 'with', source_url: 'https://www.bodacc.fr/a?id=1', source_kind: 'bodacc' }),
          signal({ id: 'without', label: 'Sans lien', source_url: null }),
        ]),
    }
    const out = (await call({ accounts }, { accountId: ACCOUNT_ID })) as {
      accounts: { signals: { label: string; link: string | null; linkKind: string | null }[] }[]
    }
    const [withLink, withoutLink] = out.accounts[0].signals
    expect(withLink).toMatchObject({ link: 'https://www.bodacc.fr/a?id=1', linkKind: 'bodacc' })
    expect(withoutLink).toMatchObject({ link: null, linkKind: null })
  })

  it('un signal PÉRIMÉ (résolu ou archivé) n’apparaît jamais dans « ce qui bouge »', async () => {
    const accounts = {
      findOneForWorkspace: foundAccount,
      listAccountSignals: jest
        .fn()
        .mockResolvedValue([
          signal({ id: 'resolved', history_status: 'resolved' }),
          signal({ id: 'archived', freshness: 'archive', date: '2019-01-01' }),
          signal({ id: 'fresh' }),
        ]),
    }
    const out = (await call({ accounts }, { accountId: ACCOUNT_ID })) as {
      accounts: { signals: { label: string }[] }[]
    }
    expect(out.accounts).toHaveLength(1)
    expect(out.accounts[0].signals).toHaveLength(1)
  })

  it('#3928.1 — un signal SANS date n’est pas récent : jamais dans « ce qui bouge »', async () => {
    const accounts = {
      findOneForWorkspace: foundAccount,
      listAccountSignals: jest
        .fn()
        .mockResolvedValue([
          signal({ id: 'undated', label: 'Sans date stampé', freshness: 'undated', date: null }),
          signal({ id: 'nodate', label: 'Sans date ni fraîcheur', freshness: null, date: null }),
          signal({ id: 'fresh', label: 'Daté et actuel' }),
        ]),
    }
    const out = (await call({ accounts }, { accountId: ACCOUNT_ID })) as {
      accounts: { signals: { label: string }[] }[]
    }
    expect(out.accounts[0].signals.map(s => s.label)).toEqual(['Daté et actuel'])
  })

  it('#3928.1 — sans accountId, un compte dont tous les signaux sont sans date ne « bouge » pas', async () => {
    const accounts = {
      listAccountSignals: jest
        .fn()
        .mockResolvedValue([
          signal({ id: 'u', account_id: OTHER_ACCOUNT_ID, company_name: 'BPCE', freshness: 'undated', date: null }),
          signal({ id: 'f' }),
        ]),
    }
    const out = (await call({ accounts }, {})) as { accounts: { accountId: string }[] }
    expect(out.accounts.map(a => a.accountId)).toEqual([ACCOUNT_ID])
  })

  it('sans accountId : les comptes où ça bouge, groupés, plafonnés à 5', async () => {
    const many = Array.from({ length: 7 }, (_, i) =>
      signal({ id: `s${i}`, account_id: `acc-${i}`, company_name: `Compte ${i}` }),
    )
    const accounts = { listAccountSignals: jest.fn().mockResolvedValue(many) }
    const out = (await call({ accounts }, {})) as { accountId: null; accounts: { accountId: string }[] }

    expect(accounts.listAccountSignals).toHaveBeenCalledWith('w-1', USER_ID, null, undefined)
    expect(out.accountId).toBeNull()
    expect(out.accounts).toHaveLength(5)
    expect(out.accounts.map(a => a.accountId)).toEqual(['acc-0', 'acc-1', 'acc-2', 'acc-3', 'acc-4'])
  })

  it('par compte : jusqu’à 8 signaux, jamais une troncature silencieuse du compte lui-même', async () => {
    const twelve = Array.from({ length: 12 }, (_, i) => signal({ id: `s${i}`, label: `Signal ${i}` }))
    const accounts = { findOneForWorkspace: foundAccount, listAccountSignals: jest.fn().mockResolvedValue(twelve) }
    const out = (await call({ accounts }, { accountId: ACCOUNT_ID })) as {
      accounts: { signals: unknown[] }[]
    }
    expect(out.accounts).toHaveLength(1)
    expect(out.accounts[0].signals).toHaveLength(8)
  })

  it('deux comptes distincts restent deux lignes distinctes, chacune avec ses propres signaux', async () => {
    const accounts = {
      listAccountSignals: jest
        .fn()
        .mockResolvedValue([
          signal({ id: 's1' }),
          signal({ id: 's2', account_id: OTHER_ACCOUNT_ID, company_name: 'BPCE' }),
        ]),
    }
    const out = (await call({ accounts }, {})) as { accounts: { accountId: string; companyName: string }[] }
    expect(out.accounts.map(a => ({ accountId: a.accountId, companyName: a.companyName }))).toEqual([
      { accountId: ACCOUNT_ID, companyName: 'SNCF' },
      { accountId: OTHER_ACCOUNT_ID, companyName: 'BPCE' },
    ])
  })

  // P05.c (#3246, lot 09/10) — les signaux qui précèdent une affaire, ailleurs.
  it('P05.c — pour les types rendus, la base commune dit combien ont précédé une affaire', async () => {
    const accounts = {
      findOneForWorkspace: foundAccount,
      listAccountSignals: jest.fn().mockResolvedValue([signal({})]),
    }
    const sharedPrecedence = {
      basis: 'shared_anonymous_base',
      status: 'shared',
      lines: [{ signalType: 'funding', sector: 'all', signals: 11, followedByDeal: 4, contributingWorkspaces: 3 }],
    }
    const sharedBase = {
      signalPrecedenceElsewhere: jest.fn().mockResolvedValue(sharedPrecedence),
      marketPatternsElsewhere: jest.fn().mockResolvedValue({ status: 'not_enough_shared_data' }),
    }
    const out = (await call({ accounts, sharedBase }, { accountId: ACCOUNT_ID })) as Record<string, unknown>
    expect(sharedBase.signalPrecedenceElsewhere).toHaveBeenCalledWith('w-1', ['funding'], ACCOUNT_ID)
    expect(out.sharedPrecedence).toEqual(sharedPrecedence)
  })

  it('P05.c — sait dire NON : aucun signal rendu, aucune lecture et aucune clé ; un échec se NOMME', async () => {
    const sharedBase = {
      signalPrecedenceElsewhere: jest.fn().mockRejectedValue(new Error('db down')),
      marketPatternsElsewhere: jest.fn().mockRejectedValue(new Error('db down')),
    }
    const empty = (await call({ sharedBase }, { accountId: ACCOUNT_ID })) as Record<string, unknown>
    expect(sharedBase.signalPrecedenceElsewhere).not.toHaveBeenCalled()
    expect(empty).not.toHaveProperty('sharedPrecedence')

    const accounts = {
      findOneForWorkspace: foundAccount,
      listAccountSignals: jest.fn().mockResolvedValue([signal({})]),
    }
    const failed = (await call({ accounts, sharedBase }, { accountId: ACCOUNT_ID })) as Record<string, unknown>
    expect(failed.sharedPrecedence).toEqual({ error: 'shared_base_unavailable' })
  })

  // #4286.15.c (Louis 22/10/2026) — `market_pattern` : les tendances de marché entre espaces autour du
  // compte NOMMÉ, servies ici comme un signal que Laura lit — pas d'écran neuf.
  it('#4286.15.c — sur un compte nommé, les tendances de marché de la base commune, « observé dans N espaces »', async () => {
    const marketPatterns = {
      basis: 'shared_anonymous_base',
      minWorkspaces: 3,
      windowDays: 180,
      status: 'shared',
      lines: [
        {
          topic: 'data',
          sectorKey: 'naf_64',
          sizeBand: 'eti',
          regionKey: 'ile_de_france',
          observations: 4,
          contributingWorkspaces: 3,
          observedIn: 'observé dans 3 espaces',
        },
      ],
    }
    const sharedBase = { marketPatternsElsewhere: jest.fn().mockResolvedValue(marketPatterns) }
    const out = (await call({ sharedBase }, { accountId: ACCOUNT_ID })) as Record<string, unknown>
    expect(sharedBase.marketPatternsElsewhere).toHaveBeenCalledWith('w-1', ACCOUNT_ID)
    expect(out.marketPatterns).toEqual(marketPatterns)
  })

  it('#4286.15.c — sait dire NON : sans compte nommé, aucune lecture ni clé ; un échec se NOMME', async () => {
    const sharedBase = { marketPatternsElsewhere: jest.fn().mockRejectedValue(new Error('db down')) }
    const portfolio = (await call({ sharedBase }, {})) as Record<string, unknown>
    expect(sharedBase.marketPatternsElsewhere).not.toHaveBeenCalled()
    expect(portfolio).not.toHaveProperty('marketPatterns')
    const failed = (await call({ sharedBase }, { accountId: ACCOUNT_ID })) as Record<string, unknown>
    expect(failed.marketPatterns).toEqual({ error: 'shared_base_unavailable' })
  })

  // #3970 (lot P07) — « qui a été recruté chez X ? » : la MÊME lecture que la
  // section « Recrutements récents » de la veille, sur le compte nommé.
  describe('recentHires (#3970)', () => {
    const hire = {
      contactId: 'c1',
      name: 'Claire Martin',
      role: 'DSI',
      startedOn: '2026-08-01',
      source: 'people_enrichment',
      email: 'claire.martin@acme.fr',
      phone: null,
      linkedinUrl: null,
      relevance: { status: 'pertinent', reasonFr: 'Nouveau décideur', reasonEn: 'New decision-maker' },
    }

    it('relaie les recrutements du compte nommé, avec leur raison de pertinence', async () => {
      const found = { type: 'success', output: { id: ACCOUNT_ID, company_name: 'ACME' } }
      const accounts = {
        findOneForWorkspace: jest.fn().mockResolvedValue(found),
        listAccountSignals: jest.fn().mockResolvedValue([]),
        recentHires: jest.fn().mockResolvedValue({ windowDays: 183, examinedContacts: 3, hires: [hire] }),
      }
      const out = (await call({ accounts }, { accountId: ACCOUNT_ID })) as { recentHires: unknown }
      expect(accounts.recentHires).toHaveBeenCalledWith('w-1', USER_ID, found.output)
      expect(out.recentHires).toEqual({ windowDays: 183, examinedContacts: 3, hires: [hire] })
    })

    it('sait dire NON : une lecture en échec rend `null` (« pas lu »), jamais une liste vide (« personne »)', async () => {
      const accounts = {
        findOneForWorkspace: foundAccount,
        listAccountSignals: jest.fn().mockResolvedValue([]),
        recentHires: jest.fn().mockRejectedValue(new Error('db down')),
      }
      const out = (await call({ accounts }, { accountId: ACCOUNT_ID })) as { recentHires: unknown }
      expect(out.recentHires).toBeNull()
    })

    it('sans compte nommé (portefeuille), aucune lecture de recrutements', async () => {
      const accounts = {
        findOneForWorkspace: foundAccount,
        listAccountSignals: jest.fn().mockResolvedValue([]),
        recentHires: jest.fn(),
      }
      const out = (await call({ accounts }, {})) as Record<string, unknown>
      expect(accounts.recentHires).not.toHaveBeenCalled()
      expect(out).not.toHaveProperty('recentHires')
    })
  })
})
