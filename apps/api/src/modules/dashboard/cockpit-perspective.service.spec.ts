import type { DataSource } from 'typeorm'
import type { MarketMemoryService, MarketPathsRead } from '../market-memory/market-memory.service'
import { CockpitPerspectiveService } from './cockpit-perspective.service'

/**
 * Le recul du cockpit personnel (#1404 → #1411).
 *
 * Le service ne fait presque que du SQL : ce qui se teste ici est ce que le SQL
 * ne peut PAS garantir tout seul — la portée, le partage d'un dénominateur, la
 * distinction entre « zéro » et « non mesuré », et la tolérance à la panne d'un
 * bloc. Chaque test ci-dessous a été vu ROUGE en cassant volontairement la
 * ligne qu'il protège.
 */

type Row = Record<string, unknown>

/** Un faux `DataSource` qui répond par MOTIF de requête. Une requête qu'aucun
 *  motif ne reconnaît lève — un test qui interroge sans le vouloir se voit. */
function dataSourceOf(handlers: { match: RegExp; rows: Row[] | Error }[]) {
  const calls: string[] = []
  const query = jest.fn(async (sql: string) => {
    calls.push(sql)
    const handler = handlers.find(entry => entry.match.test(sql))
    if (!handler) throw new Error(`requête non prévue par le test :\n${sql.slice(0, 160)}`)
    if (handler.rows instanceof Error) throw handler.rows
    return handler.rows
  })
  return { dataSource: { query } as unknown as DataSource, query, calls }
}

/**
 * Une mémoire marché de test. Par défaut elle ne couvre RIEN — c'est l'état du
 * produit tant que le corpus n'est pas chargé, et le cockpit doit y être
 * strictement identique à ce qu'il était avant.
 */
function marketMemoryOf(read: MarketPathsRead = { status: 'ok', paths: new Map() }): MarketMemoryService {
  return { pathsFor: jest.fn(async () => read) } as unknown as MarketMemoryService
}

/** Le service, avec sa mémoire marché — vide sauf mention contraire. */
function serviceOf(dataSource: DataSource, memory: MarketMemoryService = marketMemoryOf()) {
  return new CockpitPerspectiveService(dataSource, memory)
}

const PIPELINE = /FROM opportunities o\s+JOIN accounts a/
const MISSIONS = /FROM missions m/
const BILLING = /FROM invoice_readiness ir/
const COVERAGE = /"without_next_action"/
const RELATIONSHIP = /"awaiting_reply"/
const DORMANT = /"submission_label"/
const SERIES = /generate_series/

/** Le jeu qui répond « rien du tout » partout : chaque test ne surcharge que ce
 *  qu'il mesure, ce qui garde la cause d'un rouge lisible. */
function baseline(over: { match: RegExp; rows: Row[] | Error }[] = []) {
  const defaults = [
    { match: PIPELINE, rows: [{ amount: '0', valued: 0, total: 0 }] },
    { match: MISSIONS, rows: [{ count: 0 }] },
    { match: BILLING, rows: [{ invoiced: null, collected: null }] },
    { match: COVERAGE, rows: [] as Row[] },
    { match: RELATIONSHIP, rows: [{ active_threads: 0, awaiting_reply: 0, replies_received: 0 }] },
    { match: DORMANT, rows: [] as Row[] },
    { match: SERIES, rows: [] as Row[] },
  ]
  return dataSourceOf([...over, ...defaults])
}

describe('CockpitPerspectiveService', () => {
  it('lit le PORTEFEUILLE (responsable), jamais le créateur — #1408', async () => {
    const { dataSource, calls } = baseline()
    await serviceOf(dataSource).getPerspective('user-1', 'ws-1', true)

    // La contradiction du lot tenait à ce seul prédicat : `/comptes` filtrait
    // sur `assigned_to`, le cockpit sur `user_id`, et les deux disaient
    // « mes comptes ». Une seule population désormais.
    // ⚠️ L'alias se BORNE. `not.toContain('a.user_id')` rougissait sur
    // `ua.user_id` — la première trace de l'utilisateur, qui est légitimement
    // scopée par SON identifiant et n'a rien à voir avec un compte. Une garde
    // qui attrape ce qu'elle ne vise pas ne garde plus rien : on ne la croit
    // plus, et on la désactive.
    const accountScopedByCreator = /(?<![A-Za-z_])a\.user_id/
    const scoped = calls.filter(sql => /(?:FROM|JOIN) accounts a\b/.test(sql))
    expect(scoped.length).toBeGreaterThan(0)
    for (const sql of scoped) {
      expect(sql).toContain('a.assigned_to = $2')
      expect(sql).not.toMatch(accountScopedByCreator)
    }
  })

  it('n’annonce PAS « 0 € » quand aucune affaire ne porte de montant', async () => {
    const { dataSource } = baseline([{ match: PIPELINE, rows: [{ amount: '0', valued: 0, total: 30 }] }])
    const res = await serviceOf(dataSource).getPerspective('user-1', 'ws-1', true)

    // Trente affaires ouvertes, aucune chiffrée : « 0 € de pipe » serait un
    // chiffre FAUX, pas un chiffre bas. La somme n'existe pas ; les deux
    // dénombrements, si.
    expect(res.trajectory.pipeline).toEqual({ amount_euros: null, open_count: 30, valued_count: 0 })
  })

  it('somme le pipe dès qu’une affaire est chiffrée, et dit sur combien', async () => {
    const { dataSource } = baseline([{ match: PIPELINE, rows: [{ amount: '120000', valued: 4, total: 30 }] }])
    const res = await serviceOf(dataSource).getPerspective('user-1', 'ws-1', true)
    expect(res.trajectory.pipeline).toEqual({ amount_euros: 120000, open_count: 30, valued_count: 4 })
  })

  it('un bloc en panne rend `null` et n’éteint PAS les quatre autres', async () => {
    const { dataSource } = baseline([{ match: BILLING, rows: new Error('relation manquante') }])
    const res = await serviceOf(dataSource).getPerspective('user-1', 'ws-1', true)

    // « Je n'ai pas pu lire » ≠ « il n'y a rien ». Le facturé est inconnu…
    expect(res.trajectory.invoiced_euros).toBeNull()
    expect(res.trajectory.collected_euros).toBeNull()
    // …et le reste de la trajectoire tient debout.
    expect(res.trajectory.missions_active).toBe(0)
    expect(res.trajectory.pipeline).not.toBeNull()
  })

  it('« comptes sans échange depuis 30 jours » est calculé UNE fois et lu deux fois', async () => {
    const { dataSource } = baseline([
      {
        match: COVERAGE,
        rows: [
          {
            id: 'a1',
            company_name: 'Alpha',
            logo_url: null,
            website: null,
            followed: true,
            without_next_action: false,
            last_interaction: null,
            new_signal_at: null,
            ever_worked: true,
          },
          {
            id: 'a2',
            company_name: 'Beta',
            logo_url: null,
            website: null,
            followed: true,
            without_next_action: false,
            last_interaction: null,
            new_signal_at: null,
            ever_worked: true,
          },
        ],
      },
      // Le bloc relationnel prétend, lui, qu'il ne se passe rien.
      { match: RELATIONSHIP, rows: [{ active_threads: 9, awaiting_reply: 3, replies_received: 4 }] },
    ])
    const res = await serviceOf(dataSource).getPerspective('user-1', 'ws-1', true)

    // C'est le piège le plus cher du lot 6 : une tuile annonçait 2 et son filtre
    // rendait zéro ligne, parce que deux requêtes comptaient deux populations
    // sous la même phrase. Ici il n'y a qu'un calcul, donc jamais deux nombres.
    expect(res.coverage.no_interaction_30d).toBe(2)
    expect(res.relationship.accounts_without_interaction).toBe(res.coverage.no_interaction_30d)
  })

  it('n’admet une anomalie que si le compte RÉVÈLE un problème, et les range par gravité', async () => {
    const old = new Date(Date.now() - 200 * 86_400_000)
    const { dataSource } = baseline([
      {
        match: COVERAGE,
        rows: [
          // Sain : suivi, travaillé, action programmée, échange récent. Il n'a rien à faire dans la liste.
          {
            id: 'sain',
            company_name: 'Sain',
            logo_url: null,
            website: null,
            followed: true,
            without_next_action: false,
            last_interaction: new Date(),
            new_signal_at: null,
            ever_worked: true,
          },
          {
            id: 'muet',
            company_name: 'Muet',
            logo_url: null,
            website: null,
            followed: true,
            without_next_action: false,
            last_interaction: old,
            new_signal_at: null,
            ever_worked: true,
          },
          {
            id: 'signal',
            company_name: 'Signal',
            logo_url: null,
            website: null,
            followed: true,
            without_next_action: false,
            last_interaction: null,
            new_signal_at: new Date(),
            ever_worked: false,
          },
        ],
      },
    ])
    const res = await serviceOf(dataSource).getPerspective('user-1', 'ws-1', true)

    expect(res.coverage.anomalies.map(a => a.account_id)).toEqual(['signal', 'muet'])
    // Un signal neuf que personne n'a touché passe devant un silence : c'est lui
    // qui donne une raison d'agir cette semaine.
    expect(res.coverage.anomalies[0].kind).toBe('new_signal_untouched')
    expect(res.coverage.anomalies[1].kind).toBe('no_recent_interaction')
  })

  describe('les parcours observés sur une anomalie (#1572)', () => {
    const OLD = new Date(Date.now() - 200 * 86_400_000)

    function silentAccount(id: string, name: string, website: string | null = null) {
      return {
        id,
        company_name: name,
        logo_url: null,
        website,
        followed: true,
        without_next_action: false,
        last_interaction: OLD,
        new_signal_at: null,
        ever_worked: true,
      }
    }

    it('pose le compte quand la mémoire marché couvre le compte', async () => {
      const { dataSource } = baseline([
        { match: COVERAGE, rows: [silentAccount('a1', 'Thales', 'https://thalesgroup.com')] },
      ])
      const memory = marketMemoryOf({ status: 'ok', paths: new Map([['a1', 41]]) })

      const res = await serviceOf(dataSource, memory).getPerspective('user-1', 'ws-1', true)

      expect(res.coverage.anomalies[0].market_paths).toBe(41)
    })

    it('n’interroge la mémoire QU’APRÈS la coupe — cinq comptes au plus, jamais le portefeuille', async () => {
      const rows = Array.from({ length: 12 }, (unused, index) => silentAccount(`a${index}`, `A${index}`))
      const { dataSource } = baseline([{ match: COVERAGE, rows }])
      const memory = marketMemoryOf()

      await serviceOf(dataSource, memory).getPerspective('user-1', 'ws-1', true)

      const lookups = (memory.pathsFor as jest.Mock).mock.calls[0][0]
      expect(lookups).toHaveLength(5)
    })

    it('laisse la ligne INTACTE quand la mémoire est indisponible — un « 0 » sur une panne mentirait', async () => {
      const { dataSource } = baseline([{ match: COVERAGE, rows: [silentAccount('a1', 'Thales')] }])
      const memory = marketMemoryOf({ status: 'unavailable', reason: 'read_failed' })

      const res = await serviceOf(dataSource, memory).getPerspective('user-1', 'ws-1', true)

      expect(res.coverage.anomalies).toHaveLength(1)
      expect(res.coverage.anomalies[0].market_paths).toBeUndefined()
    })

    it('laisse la ligne INTACTE quand le compte n’est pas couvert', async () => {
      const { dataSource } = baseline([{ match: COVERAGE, rows: [silentAccount('a1', 'Thales')] }])
      const memory = marketMemoryOf({ status: 'ok', paths: new Map([['a1', null]]) })

      const res = await serviceOf(dataSource, memory).getPerspective('user-1', 'ws-1', true)

      expect(res.coverage.anomalies[0].market_paths).toBeUndefined()
    })

    it('n’interroge pas la mémoire pour un compte SANS NOM — une clé vide rapprocherait n’importe quoi', async () => {
      const { dataSource } = baseline([
        { match: COVERAGE, rows: [{ ...silentAccount('a1', 'x'), company_name: null }] },
      ])
      const memory = marketMemoryOf()

      await serviceOf(dataSource, memory).getPerspective('user-1', 'ws-1', true)

      expect((memory.pathsFor as jest.Mock).mock.calls[0][0]).toEqual([])
    })
  })

  describe('le reclassement par la mémoire marché — #1573.5', () => {
    const OLD = new Date(Date.now() - 200 * 86_400_000)
    const LESS_OLD = new Date(Date.now() - 40 * 86_400_000)

    function silentAccount(id: string, name: string, lastInteraction: Date) {
      return {
        id,
        company_name: name,
        logo_url: null,
        website: null,
        followed: true,
        without_next_action: false,
        last_interaction: lastInteraction,
        new_signal_at: null,
        ever_worked: true,
      }
    }

    function untouchedSignalAccount(id: string, name: string) {
      return {
        id,
        company_name: name,
        logo_url: null,
        website: null,
        followed: true,
        without_next_action: false,
        last_interaction: null,
        new_signal_at: new Date(),
        ever_worked: false,
      }
    }

    it('ne remonte JAMAIS un compte au-dessus d’un compte porteur d’un signal récent, même avec un potentiel énorme', async () => {
      const { dataSource } = baseline([
        {
          match: COVERAGE,
          // « silencieux » n'a AUCUN potentiel marché ; « signal » n'en a pas
          // non plus — c'est le potentiel de « silencieux » qui est testé, pas
          // sa présence : un compte sans signal récent, aussi couvert soit-il
          // par la mémoire marché, ne doit jamais dépasser un signal neuf.
          rows: [silentAccount('silencieux', 'Silencieux', OLD), untouchedSignalAccount('signal', 'Signal')],
        },
      ])
      // « silencieux » porte un potentiel ÉNORME — 999 parcours observés.
      const memory = marketMemoryOf({ status: 'ok', paths: new Map([['silencieux', 999]]) })

      const res = await serviceOf(dataSource, memory).getPerspective('user-1', 'ws-1', true)

      // #4016.L10.c — les deux sont CHAUDS (signal neuf / présence marché) : à
      // chaleur égale, le signal neuf garde la tête ; et le VOLUME (999) ne
      // compte jamais, la chaleur est une présence.
      expect(res.coverage.anomalies.map(a => a.account_id)).toEqual(['signal', 'silencieux'])
    })

    it('à ÉGALITÉ de kind, un compte couvert par la mémoire marché remonte devant un compte non couvert', async () => {
      const { dataSource } = baseline([
        {
          match: COVERAGE,
          rows: [
            // Sans la mémoire marché, « pire » sortirait en premier (silence
            // plus ancien). C'est justement ce que ce test renverse.
            silentAccount('pire', 'Pire silence', OLD),
            silentAccount('couvert', 'Couvert', LESS_OLD),
          ],
        },
      ])
      const memory = marketMemoryOf({ status: 'ok', paths: new Map([['couvert', 15]]) })

      const res = await serviceOf(dataSource, memory).getPerspective('user-1', 'ws-1', true)

      // Les deux sont `no_recent_interaction` : à kind égal, le potentiel
      // structurel devient le facteur de classement SECONDAIRE.
      expect(res.coverage.anomalies.map(a => a.account_id)).toEqual(['couvert', 'pire'])
    })

    // #4016.L10.c revient sur GA-262, délibérément — Louis 11/10 : une présence
    // marché SEULE rend le compte chaud, et un compte chaud passe devant un froid
    // même d'un `kind` plus grave (un signal neuf reste en tête des chauds).
    it('#4016.L10.c — un compte silencieux mais observé passe devant un compte froid jamais travaillé', async () => {
      const neverWorked = {
        ...silentAccount('jamais', 'Jamais travaillé', OLD),
        last_interaction: null,
        ever_worked: false,
      }
      const { dataSource } = baseline([
        { match: COVERAGE, rows: [neverWorked, silentAccount('observe', 'Observé', LESS_OLD)] },
      ])
      const memory = marketMemoryOf({ status: 'ok', paths: new Map([['observe', 3]]) })

      const res = await serviceOf(dataSource, memory).getPerspective('user-1', 'ws-1', true)

      expect(res.coverage.anomalies.map(a => `${a.account_id}:${a.kind}`)).toEqual([
        'observe:no_recent_interaction',
        'jamais:never_worked',
      ])
      // …et l'observation n'est jamais comptée comme un « nouveau signal » (#1573.7).
      expect(res.coverage.new_signals_7d).toBe(0)
    })

    it('sans AUCUNE couverture marché, l’ordre reste celui d’avant — kind puis ancienneté', async () => {
      const { dataSource } = baseline([
        {
          match: COVERAGE,
          rows: [silentAccount('recent', 'Récent', LESS_OLD), silentAccount('ancien', 'Ancien', OLD)],
        },
      ])
      const memory = marketMemoryOf({ status: 'ok', paths: new Map() })

      const res = await serviceOf(dataSource, memory).getPerspective('user-1', 'ws-1', true)

      expect(res.coverage.anomalies.map(a => a.account_id)).toEqual(['ancien', 'recent'])
    })
  })

  it('borne les anomalies à cinq — c’est la borne du retour, pas une préférence', async () => {
    const old = new Date(Date.now() - 200 * 86_400_000)
    const rows = Array.from({ length: 12 }, (unused, index) => ({
      id: `a${index}`,
      company_name: `A${index}`,
      logo_url: null,
      website: null,
      followed: true,
      without_next_action: false,
      last_interaction: old,
      new_signal_at: null,
      ever_worked: true,
    }))
    const { dataSource } = baseline([{ match: COVERAGE, rows }])
    const res = await serviceOf(dataSource).getPerspective('user-1', 'ws-1', true)

    expect(res.coverage.anomalies).toHaveLength(5)
    // …mais le COMPTEUR, lui, porte les douze. La liste montre, le compteur compte.
    expect(res.coverage.no_interaction_30d).toBe(12)
  })

  it('refuse une opportunité endormie sans AUCUNE preuve datée', async () => {
    const { dataSource } = baseline([
      {
        match: DORMANT,
        rows: [
          // Un compte silencieux dont on ne sait rien : pas une opportunité, un vide.
          {
            id: 'vide',
            company_name: 'Vide',
            logo_url: null,
            website: null,
            last_interaction: null,
            last_submission: null,
            submission_label: null,
            last_message: null,
            contact_since: null,
            contact_label: null,
            need_since: null,
            need_label: null,
            signal_label: null,
            signal_at: null,
          },
          {
            id: 'reel',
            company_name: 'Réel',
            logo_url: null,
            website: null,
            last_interaction: null,
            last_submission: '2026-01-10T00:00:00.000Z',
            submission_label: 'Data engineer',
            last_message: null,
            contact_since: null,
            contact_label: null,
            need_since: null,
            need_label: null,
            signal_label: null,
            signal_at: null,
          },
        ],
      },
    ])
    const res = await serviceOf(dataSource).getPerspective('user-1', 'ws-1', true)

    expect(res.dormant.map(item => item.account_id)).toEqual(['reel'])
    expect(res.dormant[0].evidence).toEqual([
      { kind: 'proposal_sent', label: 'Data engineer', occurred_at: '2026-01-10T00:00:00.000Z' },
    ])
    // Aucun signal inventé pour rendre la carte plus vendeuse : la raison est le silence.
    expect(res.dormant[0].new_signal).toBeNull()
  })

  it('fait passer devant l’opportunité qui porte un signal NEUF', async () => {
    const row = (id: string, signal: string | null) => ({
      id,
      company_name: id,
      logo_url: null,
      website: null,
      last_interaction: null,
      last_submission: '2026-01-10T00:00:00.000Z',
      submission_label: 'Mission',
      last_message: null,
      contact_since: null,
      contact_label: null,
      need_since: null,
      need_label: null,
      signal_label: signal,
      signal_at: signal ? '2026-09-01T00:00:00.000Z' : null,
    })
    const { dataSource } = baseline([{ match: DORMANT, rows: [row('muet', null), row('signal', 'Levée de fonds')] }])
    const res = await serviceOf(dataSource).getPerspective('user-1', 'ws-1', true)
    expect(res.dormant.map(item => item.account_id)).toEqual(['signal', 'muet'])
  })

  /**
   * #1574.1 — la mémoire marché sur les opportunités à réveiller.
   *
   * Le retour l'écrit en toutes lettres : « ne jamais transformer cette mémoire
   * en prétexte automatique pour contacter le client ». Ces tests tiennent donc
   * autant ce qu'elle N'A PAS le droit de faire que ce qu'elle apporte. Chacun
   * a été vu ROUGE en cassant la ligne qu'il protège.
   */
  describe('la mémoire marché sur une opportunité endormie — #1574.1', () => {
    /** Une opportunité endormie minimale : une preuve datée, et rien d'autre. */
    const dormantRow = (
      id: string,
      over: { signal?: string | null; proofs?: number; country?: string | null; name?: string | null } = {},
    ) => {
      const proofs = over.proofs ?? 1
      return {
        id,
        company_name: over.name === undefined ? id : over.name,
        logo_url: null,
        website: null,
        registry_country: over.country ?? null,
        last_interaction: null,
        last_submission: '2026-01-10T00:00:00.000Z',
        submission_label: 'Mission',
        // La deuxième preuve n'existe que lorsque le test veut une relation
        // PLUS documentée que sa voisine.
        contact_since: proofs >= 2 ? '2026-01-09T00:00:00.000Z' : null,
        contact_label: proofs >= 2 ? 'Contact' : null,
        last_message: null,
        need_since: null,
        need_label: null,
        signal_label: over.signal ?? null,
        signal_at: over.signal ? '2026-09-01T00:00:00.000Z' : null,
      }
    }

    /** La lecture faite pour les opportunités endormies, parmi tous les appels —
     *  le bloc des anomalies interroge la même mémoire dans le même tour, et
     *  se fier au RANG de l'appel rendrait ce test dépendant de l'ordonnancement. */
    const dormantLookups = (memory: MarketMemoryService, ref: string) =>
      (memory.pathsFor as jest.Mock).mock.calls
        .map(call => call[0] as { ref: string }[])
        .find(lookups => lookups.some(lookup => lookup.ref === ref))

    it('pose le compte observé sur la carte, et le pays qui départage les homonymes', async () => {
      const { dataSource } = baseline([{ match: DORMANT, rows: [dormantRow('a1', { country: 'FR' })] }])
      const memory = marketMemoryOf({ status: 'ok', paths: new Map([['a1', 15]]) })
      const res = await serviceOf(dataSource, memory).getPerspective('user-1', 'ws-1', true)

      expect(res.dormant[0].market_paths).toBe(15)
      expect(dormantLookups(memory, 'a1')).toEqual([{ ref: 'a1', name: 'a1', website: null, country: 'FR' }])
    })

    it('n’interroge la mémoire QU’APRÈS la coupe — cinq comptes au plus, jamais le portefeuille', async () => {
      const rows = Array.from({ length: 9 }, (_, index) => dormantRow(`a${index}`))
      const { dataSource } = baseline([{ match: DORMANT, rows }])
      const memory = marketMemoryOf()
      await serviceOf(dataSource, memory).getPerspective('user-1', 'ws-1', true)

      expect(dormantLookups(memory, 'a0')).toHaveLength(5)
    })

    it('laisse la carte INTACTE quand la mémoire est indisponible — un « 0 » sur une panne mentirait', async () => {
      const { dataSource } = baseline([{ match: DORMANT, rows: [dormantRow('a1')] }])
      const memory = marketMemoryOf({ status: 'unavailable', reason: 'read_failed' })
      const res = await serviceOf(dataSource, memory).getPerspective('user-1', 'ws-1', true)

      expect(res.dormant[0].market_paths).toBeUndefined()
    })

    it('laisse la carte INTACTE quand le compte n’est pas couvert — jamais « 0 parcours »', async () => {
      const { dataSource } = baseline([{ match: DORMANT, rows: [dormantRow('a1')] }])
      const memory = marketMemoryOf({ status: 'ok', paths: new Map([['a1', null]]) })
      const res = await serviceOf(dataSource, memory).getPerspective('user-1', 'ws-1', true)

      expect(res.dormant[0].market_paths).toBeUndefined()
    })

    it('n’interroge pas la mémoire pour un compte SANS NOM — une clé vide rapprocherait n’importe quoi', async () => {
      const { dataSource } = baseline([
        { match: DORMANT, rows: [dormantRow('anonyme', { name: null }), dormantRow('nomme')] },
      ])
      const memory = marketMemoryOf()
      await serviceOf(dataSource, memory).getPerspective('user-1', 'ws-1', true)

      expect(dormantLookups(memory, 'nomme')).toEqual([{ ref: 'nomme', name: 'nomme', website: null, country: null }])
    })

    it('ne remonte JAMAIS un compte au-dessus d’un compte porteur d’un signal récent, même avec un potentiel énorme', async () => {
      const { dataSource } = baseline([
        { match: DORMANT, rows: [dormantRow('signal', { signal: 'Levée de fonds' }), dormantRow('observe')] },
      ])
      const memory = marketMemoryOf({ status: 'ok', paths: new Map([['observe', 999]]) })
      const res = await serviceOf(dataSource, memory).getPerspective('user-1', 'ws-1', true)

      expect(res.dormant.map(item => item.account_id)).toEqual(['signal', 'observe'])
    })

    // ⚠️ #4016.L10.c revient sur GA-262, délibérément — Louis 11/10 : « un signal
    // isolé suffit pour chaud ». Ancien test : ~~« ne remonte JAMAIS un compte
    // au-dessus d'une relation MIEUX documentée »~~ — la présence marché seule
    // rend désormais le compte chaud, et un compte chaud passe devant un froid.
    it('#4016.L10.c — un compte observé par la mémoire marché est CHAUD : il passe devant une relation froide mieux documentée', async () => {
      const { dataSource } = baseline([
        { match: DORMANT, rows: [dormantRow('documente', { proofs: 2 }), dormantRow('observe')] },
      ])
      const memory = marketMemoryOf({ status: 'ok', paths: new Map([['observe', 42]]) })
      const res = await serviceOf(dataSource, memory).getPerspective('user-1', 'ws-1', true)

      expect(res.dormant.map(item => item.account_id)).toEqual(['observe', 'documente'])
      // Chaud n'invente RIEN : aucun signal daté n'apparaît sur la carte observée.
      expect(res.dormant[0].new_signal).toBeNull()
    })

    it('à ÉGALITÉ de signal et de preuves, le compte observé passe devant', async () => {
      const { dataSource } = baseline([{ match: DORMANT, rows: [dormantRow('muet'), dormantRow('observe')] }])
      const memory = marketMemoryOf({ status: 'ok', paths: new Map([['observe', 4]]) })
      const res = await serviceOf(dataSource, memory).getPerspective('user-1', 'ws-1', true)

      expect(res.dormant.map(item => item.account_id)).toEqual(['observe', 'muet'])
    })

    it('sans AUCUNE couverture, l’ordre reste EXACTEMENT celui d’avant', async () => {
      const { dataSource } = baseline([{ match: DORMANT, rows: [dormantRow('premier'), dormantRow('second')] }])
      const memory = marketMemoryOf({ status: 'ok', paths: new Map() })
      const res = await serviceOf(dataSource, memory).getPerspective('user-1', 'ws-1', true)

      expect(res.dormant.map(item => item.account_id)).toEqual(['premier', 'second'])
    })
  })

  it('une semaine ANTÉRIEURE à la première trace vaut `null`, pas zéro — #1410', async () => {
    const { dataSource } = baseline([
      {
        match: SERIES,
        rows: [
          { week: new Date('2026-06-01T00:00:00.000Z'), covered: 0, outreach: 0, measured: false },
          { week: new Date('2026-06-08T00:00:00.000Z'), covered: 0, outreach: 0, measured: true },
          { week: new Date('2026-06-15T00:00:00.000Z'), covered: 3, outreach: 9, measured: true },
        ],
      },
    ])
    const res = await serviceOf(dataSource).getPerspective('user-1', 'ws-1', true)

    // On ne mesurait pas : un zéro dessinerait une vallée AVANT l'arrivée de
    // l'utilisateur, et cette vallée se lit comme un effondrement.
    expect(res.series.coverage?.[0]).toEqual({ at: '2026-06-01', value: null })
    // On mesurait, il ne s'est rien passé : ce zéro-là est VRAI et il se garde.
    expect(res.series.coverage?.[1]).toEqual({ at: '2026-06-08', value: 0 })
    expect(res.series.outreach?.[2]).toEqual({ at: '2026-06-15', value: 9 })
  })

  it('sans une seule semaine mesurée, il n’y a PAS de série — pas une série plate', async () => {
    const { dataSource } = baseline([
      {
        match: SERIES,
        rows: [
          { week: new Date('2026-06-01T00:00:00.000Z'), covered: 0, outreach: 0, measured: false },
          { week: new Date('2026-06-08T00:00:00.000Z'), covered: 0, outreach: 0, measured: false },
        ],
      },
    ])
    const res = await serviceOf(dataSource).getPerspective('user-1', 'ws-1', true)

    // Le retour l'écrit lui-même : « si aucune série temporelle fiable n'existe,
    // afficher une synthèse statique plutôt qu'un graphique artificiel ».
    expect(res.series.coverage).toBeNull()
    expect(res.series.outreach).toBeNull()
    expect(res.series.provenance.sources).toEqual([])
  })

  it('nomme des CAPACITÉS dans sa provenance, jamais un éditeur — #1411', async () => {
    const { dataSource } = baseline()
    const res = await serviceOf(dataSource).getPerspective('user-1', 'ws-1', true)

    // Le retour écrivait « Sources : Gmail + CRM + actions Bellum ». « Gmail »
    // est un nom d'éditeur, et la doctrine l'interdit côté application.
    const named = [
      ...res.trajectory.provenance.sources,
      ...res.coverage.provenance.sources,
      ...res.relationship.provenance.sources,
    ]
    expect(named.length).toBeGreaterThan(0)
    for (const source of named) {
      expect(['bellum', 'crm', 'mailbox', 'calendar', 'public_registry']).toContain(source)
    }
  })

  it('ne LIT PAS la facturation sans `finance:read` — on retire le moyen, pas l’affichage', async () => {
    const { dataSource, calls } = baseline([{ match: BILLING, rows: [{ invoiced: '900000', collected: '450000' }] }])
    const res = await serviceOf(dataSource).getPerspective('user-1', 'ws-1', false)

    // Cette route ne porte que `JwtGuard` : sans cette retenue, elle rendait le
    // facturé et l'encaissé à un `sales` que `/delivery` masque — une porte
    // dérobée par un agrégat, la forme exacte du défaut #1457.
    expect(calls.some(sql => BILLING.test(sql))).toBe(false)
    expect(res.trajectory.invoiced_euros).toBeNull()
    expect(res.trajectory.collected_euros).toBeNull()
    // ⚠️ Et le drapeau DIT laquelle des deux absences c'est. Sans lui, l'écran
    // écrirait « non mesurable » à quelqu'un dont c'est seulement le périmètre.
    expect(res.trajectory.finance_readable).toBe(false)
  })

  it('la LIT quand le droit est là, et le dit', async () => {
    const { dataSource } = baseline([{ match: BILLING, rows: [{ invoiced: '900000', collected: '450000' }] }])
    const res = await serviceOf(dataSource).getPerspective('user-1', 'ws-1', true)
    // Les montants sont en CENTIMES en base, en euros au contrat.
    expect(res.trajectory.invoiced_euros).toBe(9000)
    expect(res.trajectory.collected_euros).toBe(4500)
    expect(res.trajectory.finance_readable).toBe(true)
  })

  it('BORNE les libellés d’une opportunité endormie — recette live du 04/09', async () => {
    // Le vrai libellé mesuré en production, mot pour mot. `opportunities.label`
    // et `signal_history.label` portent des ANALYSES, pas des intitulés : rendus
    // tels quels, ils donnaient des pastilles de cinq lignes. Aucun test ne
    // pouvait le voir — jsdom ne met rien en page, et la chaîne était juste.
    const paragraphe =
      'Les besoins IT propres à E B TRANS ASSISTANCE ne sont pas documentés dans les sources. ' +
      'Hypothèse à vérifier : une structure de conseil et de services rattachée à un groupe ' +
      'européen de transport pourrait avoir des besoins de consolidation de données.'
    const { dataSource } = baseline([
      {
        match: DORMANT,
        rows: [
          {
            id: 'a1',
            company_name: 'E B TRANS',
            logo_url: null,
            website: null,
            last_interaction: null,
            last_submission: null,
            submission_label: null,
            last_message: null,
            contact_since: null,
            contact_label: null,
            need_since: '2026-08-01T00:00:00.000Z',
            need_label: paragraphe,
            signal_label: paragraphe,
            signal_at: '2026-09-01T00:00:00.000Z',
          },
        ],
      },
    ])
    const res = await serviceOf(dataSource).getPerspective('user-1', 'ws-1', true)

    const preuve = res.dormant[0].evidence[0]
    expect(preuve.label!.length).toBeLessThanOrEqual(75)
    // On coupe NOUS, sur un mot entier, et on le DIT : une phrase tronquée par
    // la mise en page ne signale rien et se lit comme une donnée abîmée.
    expect(preuve.label).toMatch(/…$/)
    expect(preuve.label).not.toMatch(/\s…$/)
    expect(res.dormant[0].new_signal!.label.length).toBeLessThanOrEqual(75)
    // Et rien n’est INVENTÉ : le début est bien celui du vrai libellé.
    expect(paragraphe.startsWith(preuve.label!.replace(/…$/, ''))).toBe(true)
  })

  it('laisse INTACT un libellé qui tient déjà', async () => {
    const { dataSource } = baseline([
      {
        match: DORMANT,
        rows: [
          {
            id: 'a1',
            company_name: 'ACME',
            logo_url: null,
            website: null,
            last_interaction: null,
            last_submission: '2026-01-10T00:00:00.000Z',
            submission_label: 'Data engineer',
            last_message: null,
            contact_since: null,
            contact_label: null,
            need_since: null,
            need_label: null,
            signal_label: null,
            signal_at: null,
          },
        ],
      },
    ])
    const res = await serviceOf(dataSource).getPerspective('user-1', 'ws-1', true)
    expect(res.dormant[0].evidence[0].label).toBe('Data engineer')
  })

  it('ne prétend AUCUNE population sur la trajectoire — elle en a trois', async () => {
    const { dataSource } = baseline([{ match: PIPELINE, rows: [{ amount: '120000', valued: 21, total: 644 }] }])
    const res = await serviceOf(dataSource).getPerspective('user-1', 'ws-1', true)

    // Mesuré en production le 04/09 : l’écran écrivait « sur 644 comptes » —
    // 644 est un nombre d’AFFAIRES. Un compteur juste sous un nom faux se croise
    // avec les 28 de la tuile « Mon portefeuille » et fait douter des deux.
    // Le pipe compte des affaires, les missions des missions, la facturation des
    // mois : il n’y a pas UN dénominateur, et le seul honnête est aucun.
    expect(res.trajectory.provenance.population).toBeNull()
    // La couverture, elle, en a une VRAIE — et elle la garde.
    expect(res.coverage.provenance.population).toBe(0)
  })
})
