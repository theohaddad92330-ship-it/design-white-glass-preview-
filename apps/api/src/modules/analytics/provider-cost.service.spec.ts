import { correlationStorage } from '../../correlation-id/correlation-id.store'
import { ProviderCostService } from './provider-cost.service'

/**
 * Persistance des coûts fournisseurs (D19, étape 2).
 *
 * La règle tenue ici : « non tarifé » (NULL) ne se confond JAMAIS avec
 * « gratuit » (0). C'est ce genre de zéro silencieux qui a laissé croire qu'un
 * run coûtait 0,75 € pendant que la facture réelle était sept fois plus haute.
 */
describe('ProviderCostService', () => {
  function setup(insertThrows = false) {
    const costs = {
      insert: insertThrows ? jest.fn().mockRejectedValue(new Error('db down')) : jest.fn().mockResolvedValue({}),
    }
    return { service: new ProviderCostService(costs as never), costs }
  }

  describe('lecture de l’en-tête', () => {
    it('lit le registre transmis par le service IA', () => {
      const { service } = setup()

      const rows = service.parseHeader(
        '[{"provider":"firecrawl","operation":"scrape","calls":1,"units":12,"cost_usd":null}]',
      )

      expect(rows).toEqual([{ provider: 'firecrawl', operation: 'scrape', calls: 1, units: 12, cost_usd: null }])
    })

    it('garde NULL pour un fournisseur non tarifé — jamais 0', () => {
      const { service } = setup()
      const [row] = service.parseHeader('[{"provider":"apollo","operation":"request","calls":2,"units":2}]')

      expect(row!.cost_usd).toBeNull()
    })

    it('ignore un en-tête absent, vide ou illisible sans lever', () => {
      const { service } = setup()

      expect(service.parseHeader(null)).toEqual([])
      expect(service.parseHeader('')).toEqual([])
      expect(service.parseHeader('pas du json')).toEqual([])
      expect(service.parseHeader('{"provider":"x"}')).toEqual([])
    })

    it('jette les lignes sans fournisseur ni opération', () => {
      const { service } = setup()

      expect(
        service.parseHeader('[{"calls":3},{"provider":"serper","operation":"search","calls":1,"units":1}]'),
      ).toEqual([{ provider: 'serper', operation: 'search', calls: 1, units: 1, cost_usd: null }])
    })

    it('borne le nombre de lignes et la longueur des noms', () => {
      const { service } = setup()
      const many = JSON.stringify(
        Array.from({ length: 100 }, () => ({ provider: 'x'.repeat(200), operation: 'y', calls: 1, units: 1 })),
      )

      const rows = service.parseHeader(many)

      expect(rows).toHaveLength(40)
      expect(rows[0]!.provider.length).toBe(60)
    })

    /**
     * #2440.6/.7/.8/.9/.16/.19 — le détail LLM que `cost_ledger.py` ajoute
     * maintenant à ses lignes Anthropic/OpenAI. Un fournisseur de données
     * (Firecrawl, Apollo…) ne les porte jamais : la ligne garde sa forme
     * d'avant plutôt que de porter des clés `null` qui ne disent rien.
     */
    it('lit le détail modèle/jetons/cache/statut/version tarifaire quand il est présent', () => {
      const { service } = setup()

      const [row] = service.parseHeader(
        '[{"provider":"anthropic","operation":"bellum_facts","calls":1,"units":1200,"cost_usd":0.031,' +
          '"model":"claude-sonnet-5","input_tokens":1000,"output_tokens":200,"cache_read_tokens":50,' +
          '"cache_creation_tokens":10,"status":"ok","tariff_version":"anthropic-2026-v1"}]',
      )

      expect(row).toEqual({
        provider: 'anthropic',
        operation: 'bellum_facts',
        calls: 1,
        units: 1200,
        cost_usd: 0.031,
        model: 'claude-sonnet-5',
        input_tokens: 1000,
        output_tokens: 200,
        cache_read_tokens: 50,
        cache_creation_tokens: 10,
        status: 'ok',
        tariff_version: 'anthropic-2026-v1',
      })
    })

    it('n’invente aucune de ces clés pour une ligne de fournisseur de données', () => {
      const { service } = setup()

      const [row] = service.parseHeader('[{"provider":"firecrawl","operation":"scrape","calls":1,"units":3}]')

      expect(row).toEqual({ provider: 'firecrawl', operation: 'scrape', calls: 1, units: 3, cost_usd: null })
    })
  })

  describe('#2442.12 — le coût PAR OUTIL de chat', () => {
    it('lit le nom de l’outil quand l’IA l’a transmis, et seulement dans la forme admise par la base', () => {
      const { service } = setup()
      const rows = service.parseRows([
        { provider: 'brave', operation: 'search', calls: 1, units: 1, cost_usd: 0.005, tool: 'web_search' },
        { provider: 'brave', operation: 'search', calls: 1, units: 1, cost_usd: 0.005, tool: 'Web Search; DROP' },
        { provider: 'anthropic', operation: 'bellum_chat', calls: 1, units: 900, cost_usd: 0.01 },
      ])
      expect(rows[0].tool).toBe('web_search')
      // Sait dire NON : un nom hors forme n'est PAS écrit — la contrainte le refuserait,
      // et l'insertion en lot ferait perdre TOUT le tour.
      expect(rows[1]).not.toHaveProperty('tool')
      // Hors outil : aucune clé, jamais un outil deviné.
      expect(rows[2]).not.toHaveProperty('tool')
    })

    it('lit le registre du `done` comme celui de l’en-tête — une seule lecture', () => {
      const { service } = setup()
      const row = { provider: 'firecrawl', operation: 'scrape', calls: 1, units: 3, cost_usd: null }
      expect(service.parseRows([row])).toEqual(service.parseHeader(JSON.stringify([row])))
      expect(service.parseRows('pas une liste')).toEqual([])
    })

    it('écrit la colonne `tool`, NULL hors outil', async () => {
      const { service, costs } = setup()
      await service.record(
        [
          { provider: 'brave', operation: 'search', calls: 1, units: 1, cost_usd: 0.005, tool: 'web_search' },
          { provider: 'anthropic', operation: 'bellum_chat', calls: 1, units: 900, cost_usd: 0.01 },
        ],
        { workspaceId: 'ws-1', userId: 'user-1', feature: 'chat' },
      )
      expect(costs.insert).toHaveBeenCalledWith([
        expect.objectContaining({ tool: 'web_search', workspace_id: 'ws-1' }),
        expect.objectContaining({ tool: null }),
      ])
    })

    it('l’agrégat par outil ne lit QUE les lignes d’un outil — une ligne hors outil n’en fait aucune', async () => {
      const query = jest.fn().mockResolvedValue([])
      const service = new ProviderCostService({ insert: jest.fn(), manager: { query } } as never)
      await service.overview(30)
      const sql = query.mock.calls.map(call => String(call[0])).find(text => /COALESCE\(tool::text/.test(text))
      expect(sql).toBeDefined()
      expect(sql).toMatch(/tool IS NOT NULL/)
    })
  })

  describe('écriture', () => {
    /**
     * #3717.7 / #3777 (DEC-4036 Q10) — UN identifiant traverse l'analyse et Laura :
     * le correlation-id de la requête (ou du job) arrive jusqu'à la ligne de coût.
     */
    it('porte le correlation-id du contexte sur chaque ligne de coût', async () => {
      const { service, costs } = setup()

      await correlationStorage.run({ correlationId: 'cid-4036' }, () =>
        service.record([{ provider: 'anthropic', operation: 'bellum_chat', calls: 1, units: 10, cost_usd: 0.01 }], {
          workspaceId: 'ws-1',
          userId: 'user-1',
          feature: 'chat',
        }),
      )

      expect(costs.insert).toHaveBeenCalledWith([expect.objectContaining({ correlation_id: 'cid-4036' })])
    })

    it('sait dire NON — hors contexte, aucun identifiant inventé (NULL)', async () => {
      const { service, costs } = setup()

      await service.record([{ provider: 'firecrawl', operation: 'scrape', calls: 1, units: 1, cost_usd: null }], {
        workspaceId: 'ws-1',
        userId: 'user-1',
        feature: 'analysis',
      })

      expect(costs.insert).toHaveBeenCalledWith([expect.objectContaining({ correlation_id: null })])
    })

    it('borne un identifiant venu d’un en-tête client à 128 caractères', async () => {
      const { service, costs } = setup()

      await correlationStorage.run({ correlationId: 'x'.repeat(500) }, () =>
        service.record([{ provider: 'serper', operation: 'search', calls: 1, units: 1, cost_usd: null }], {
          workspaceId: null,
          userId: null,
          feature: 'analysis',
        }),
      )

      const [[inserted]] = costs.insert.mock.calls as unknown as [[Array<{ correlation_id: string }>]]
      expect(inserted[0]!.correlation_id).toHaveLength(128)
    })

    it('écrit une ligne par fournisseur, rattachée au run et au workspace', async () => {
      const { service, costs } = setup()

      await service.record(
        [{ provider: 'anthropic', operation: 'bellum_plan', calls: 1, units: 900, cost_usd: 0.12 }],
        {
          workspaceId: 'ws-1',
          userId: 'user-1',
          accountId: 'acc-1',
          runId: 'run-1',
          feature: 'analysis',
        },
      )

      expect(costs.insert).toHaveBeenCalledWith([
        expect.objectContaining({
          workspace_id: 'ws-1',
          user_id: 'user-1',
          account_id: 'acc-1',
          run_id: 'run-1',
          feature: 'analysis',
          provider: 'anthropic',
          cost_usd: '0.12',
        }),
      ])
    })

    it('persiste le détail modèle/jetons/cache/statut/version tarifaire, NULL quand absent', async () => {
      const { service, costs } = setup()

      await service.record(
        [
          {
            provider: 'anthropic',
            operation: 'bellum_facts',
            calls: 1,
            units: 1200,
            cost_usd: 0.031,
            model: 'claude-sonnet-5',
            input_tokens: 1000,
            output_tokens: 200,
            cache_read_tokens: 50,
            cache_creation_tokens: 10,
            status: 'ok',
            tariff_version: 'anthropic-2026-v1',
          },
          { provider: 'firecrawl', operation: 'scrape', calls: 1, units: 3, cost_usd: null },
        ],
        { workspaceId: 'ws-1', userId: 'user-1', accountId: null, runId: 'run-1', feature: 'analysis' },
      )

      expect(costs.insert).toHaveBeenCalledWith([
        expect.objectContaining({
          provider: 'anthropic',
          model: 'claude-sonnet-5',
          input_tokens: 1000,
          output_tokens: 200,
          cache_read_tokens: 50,
          cache_creation_tokens: 10,
          status: 'ok',
          tariff_version: 'anthropic-2026-v1',
        }),
        expect.objectContaining({
          provider: 'firecrawl',
          model: null,
          input_tokens: null,
          output_tokens: null,
          cache_read_tokens: null,
          cache_creation_tokens: null,
          status: null,
          tariff_version: null,
        }),
      ])
    })

    /**
     * #2440.106 (épopée #2975) — gate de recette : un CHANGEMENT DE GRILLE
     * TARIFAIRE ne réécrit jamais l'historique. Chaque appel à `record` est un
     * INSERT (jamais un upsert par provider/opération) : une ligne déjà écrite
     * sous `anthropic-2026-v1` garde cette version pour toujours, même quand un
     * appel POSTÉRIEUR porte `anthropic-2026-v2`. Les deux versions coexistent,
     * distinctes, dans le même mois civil.
     */
    it('#2440.106 — un changement de grille tarifaire coexiste avec l’historique, jamais une réécriture', async () => {
      const { service, costs } = setup()
      const ancienAppel = {
        provider: 'anthropic',
        operation: 'bellum_facts',
        calls: 1,
        units: 1000,
        cost_usd: 0.03,
        tariff_version: 'anthropic-2026-v1',
      }
      const nouvelAppel = {
        provider: 'anthropic',
        operation: 'bellum_facts',
        calls: 1,
        units: 1000,
        cost_usd: 0.05,
        tariff_version: 'anthropic-2026-v2',
      }
      const context = { workspaceId: 'ws-1', userId: 'user-1', accountId: null, runId: 'run-1', feature: 'analysis' }

      await service.record([ancienAppel], { ...context, runId: 'run-avant-grille' })
      await service.record([nouvelAppel], { ...context, runId: 'run-apres-grille' })

      expect(costs.insert).toHaveBeenCalledTimes(2)
      expect(costs.insert).toHaveBeenNthCalledWith(1, [
        expect.objectContaining({ run_id: 'run-avant-grille', tariff_version: 'anthropic-2026-v1', cost_usd: '0.03' }),
      ])
      expect(costs.insert).toHaveBeenNthCalledWith(2, [
        expect.objectContaining({ run_id: 'run-apres-grille', tariff_version: 'anthropic-2026-v2', cost_usd: '0.05' }),
      ])
      // La ligne « avant » n'a JAMAIS été relue ni réécrite par le second appel.
      expect(costs.insert).not.toHaveBeenNthCalledWith(
        2,
        expect.arrayContaining([expect.objectContaining({ run_id: 'run-avant-grille' })]),
      )
    })

    /**
     * Défaut B (n6) : une dépense de développement et une dépense de
     * production s'additionnaient dans le même total, sans qu'aucune colonne
     * ne dise laquelle est laquelle. `environment` se lit sur le PROCESS
     * (même convention que `health.controller.ts` / `admin-ops.service.ts` :
     * `SENTRY_ENVIRONMENT` puis `NODE_ENV`), pas sur l'appelant — les quatre
     * appelants de `record()` (analyse, ia-proxy, contacts, need-play)
     * n'ont donc rien à changer.
     */
    describe('environnement (Défaut B)', () => {
      const ENV_KEYS = ['SENTRY_ENVIRONMENT', 'NODE_ENV'] as const
      let saved: Record<string, string | undefined>

      beforeEach(() => {
        saved = Object.fromEntries(ENV_KEYS.map(key => [key, process.env[key]]))
        for (const key of ENV_KEYS) delete process.env[key]
      })

      afterEach(() => {
        for (const key of ENV_KEYS) {
          if (saved[key] === undefined) delete process.env[key]
          else process.env[key] = saved[key]
        }
      })

      it('pose SENTRY_ENVIRONMENT sur la ligne écrite', async () => {
        process.env['SENTRY_ENVIRONMENT'] = 'production'
        const { service, costs } = setup()

        await service.record([{ provider: 'anthropic', operation: 'bellum_plan', calls: 1, units: 1, cost_usd: 0 }], {
          workspaceId: 'ws-1',
          userId: 'user-1',
          feature: 'analysis',
        })

        expect(costs.insert).toHaveBeenCalledWith([expect.objectContaining({ environment: 'production' })])
      })

      it('retombe sur NODE_ENV quand SENTRY_ENVIRONMENT est absente', async () => {
        process.env['NODE_ENV'] = 'development'
        const { service, costs } = setup()

        await service.record([{ provider: 'anthropic', operation: 'bellum_plan', calls: 1, units: 1, cost_usd: 0 }], {
          workspaceId: 'ws-1',
          userId: 'user-1',
          feature: 'analysis',
        })

        expect(costs.insert).toHaveBeenCalledWith([expect.objectContaining({ environment: 'development' })])
      })

      it('retombe sur "unknown" — jamais "production" — quand rien n’est posé', async () => {
        // Le piège nommé dans la consigne : un défaut "production" gonflerait
        // le coût de production dès qu'un poste de dev tourne sans variable.
        const { service, costs } = setup()

        await service.record([{ provider: 'anthropic', operation: 'bellum_plan', calls: 1, units: 1, cost_usd: 0 }], {
          workspaceId: 'ws-1',
          userId: 'user-1',
          feature: 'analysis',
        })

        expect(costs.insert).toHaveBeenCalledWith([expect.objectContaining({ environment: 'unknown' })])
        expect(costs.insert).not.toHaveBeenCalledWith([expect.objectContaining({ environment: 'production' })])
      })
    })

    it('n’écrit rien quand il n’y a rien à écrire', async () => {
      const { service, costs } = setup()

      await service.record([], { workspaceId: 'ws-1', userId: 'u', feature: 'analysis' })

      expect(costs.insert).not.toHaveBeenCalled()
    })

    it('ne fait JAMAIS échouer le geste mesuré quand la base tousse', async () => {
      // Une métrique qui casse une analyse coûte infiniment plus cher que la
      // métrique perdue.
      const { service } = setup(true)

      await expect(
        service.record([{ provider: 'serper', operation: 'search', calls: 1, units: 1, cost_usd: null }], {
          workspaceId: 'ws-1',
          userId: 'u',
          feature: 'analysis',
        }),
      ).resolves.toBeUndefined()
    })
  })

  /**
   * L'agrégat qui manquait — et le trou qu'il bouche.
   *
   * `operation` porte le `prompt_name` : c'est la SEULE colonne qui répond à
   * « quel prompt coûte cher ». Elle était écrite à chaque appel, indexée par la
   * migration… et lue par aucun agrégat : `overview()` groupait par fournisseur,
   * fonctionnalité, espace et compte. On savait donc que l'analyse coûtait X,
   * jamais que `bellum_facts` en portait la moitié — c'est-à-dire jamais ce
   * qu'il fallait savoir pour décider d'un routage de modèle.
   *
   * C'est le motif maison : du calcul juste, persisté, que personne n'appelle.
   */
  describe('agrégat par prompt', () => {
    function overviewSetup(rowsByColumn: Record<string, unknown[]>) {
      const query = jest.fn().mockImplementation((sql: string) => {
        const column = Object.keys(rowsByColumn).find(key => new RegExp(`COALESCE\\(${key}::text`).test(sql))
        return Promise.resolve(column ? rowsByColumn[column] : [])
      })
      const costs = { insert: jest.fn(), manager: { query } }
      return { service: new ProviderCostService(costs as never), query }
    }

    it('classe les prompts par coût — la question « lequel coûte cher »', async () => {
      const { service } = overviewSetup({
        operation: [
          { key: 'bellum_facts', calls: '120', units: '900000', cost_usd: '18.40', untariffed: '0' },
          { key: 'bellum_chat', calls: '480', units: '600000', cost_usd: '11.10', untariffed: '0' },
        ],
      })

      const overview = await service.overview(30)

      expect(overview.byOperation).toEqual([
        { key: 'bellum_facts', calls: 120, units: 900000, cost_usd: 18.4, untariffed: 0 },
        { key: 'bellum_chat', calls: 480, units: 600000, cost_usd: 11.1, untariffed: 0 },
      ])
    })

    it('#4452 — la somme des unités garde ses fractions : jamais un cast entier qui les tronque', async () => {
      const { service, query } = overviewSetup({
        provider: [{ key: 'firecrawl', calls: '6', units: '1.0000000000000000', cost_usd: '0.01', untariffed: '0' }],
      })

      const overview = await service.overview(30)

      const sqls = query.mock.calls.map(([sql]) => sql as string)
      expect(sqls.some(sql => /SUM\(units\)::int/.test(sql))).toBe(false)
      expect(overview.byProvider[0]!.units).toBe(1)
    })

    // #3861.R2 — le coût PAR PALIER de raisonnement de Laura : les trois noms de coût du tour
    // (`bellum_chat`, `_fast`, `_deep`), NON bornés au top 20 de `byOperation` (un palier bon marché
    // y disparaîtrait). Seules ces opérations y entrent — jamais un prompt d'analyse.
    it('byTier : ne lit QUE les opérations de palier du copilote, et rend leurs lignes telles quelles', async () => {
      const query = jest.fn().mockImplementation((sql: string) => {
        if (/operation IN \(/.test(sql)) {
          return Promise.resolve([
            { key: 'bellum_chat_deep', calls: '40', units: '800000', cost_usd: '9.5', untariffed: '0' },
            { key: 'bellum_chat_fast', calls: '900', units: '700000', cost_usd: '2.1', untariffed: '3' },
          ])
        }
        return Promise.resolve([])
      })
      const service = new ProviderCostService({ insert: jest.fn(), manager: { query } } as never)

      const overview = await service.overview(30)

      expect(overview.byTier).toEqual([
        { key: 'bellum_chat_deep', calls: 40, units: 800000, cost_usd: 9.5, untariffed: 0 },
        { key: 'bellum_chat_fast', calls: 900, units: 700000, cost_usd: 2.1, untariffed: 3 },
      ])
      const tierSql = query.mock.calls.map(c => String(c[0])).find(sql => /operation IN \(/.test(sql))!
      expect(tierSql).toMatch(/'bellum_chat'/)
      expect(tierSql).toMatch(/'bellum_chat_fast'/)
      expect(tierSql).toMatch(/'bellum_chat_deep'/)
      expect(tierSql).not.toMatch(/bellum_facts/)
    })

    it('byTier : aucune ligne de palier ⇒ liste vide (une absence ne fait AUCUNE ligne)', async () => {
      const { service } = overviewSetup({})
      expect((await service.overview(30)).byTier).toEqual([])
    })

    it('groupe bien sur la colonne `operation`, pas sur une autre', async () => {
      // La garde qui sait dire NON : si quelqu'un rebranche l'agrégat sur
      // `feature`, on retombe sur quatre lignes fourre-tout et la question
      // « quel prompt » redevient sans réponse, en silence.
      const { service, query } = overviewSetup({})

      await service.overview(30)

      const sqls = query.mock.calls.map(call => String(call[0]))
      expect(sqls.some(sql => /GROUP BY/.test(sql) && /COALESCE\(operation::text/.test(sql))).toBe(true)
    })

    it('ne compte JAMAIS une ligne non tarifée comme un zéro', async () => {
      // « Prix inconnu » et « gratuit » ne se lisent pas pareil : c'est la règle
      // que tout le registre tient, et l'agrégat par prompt la tient aussi.
      const { service } = overviewSetup({
        operation: [{ key: 'scrape', calls: '9', units: '9', cost_usd: '0', untariffed: '9' }],
      })

      const [row] = (await service.overview(30)).byOperation

      expect(row!.untariffed).toBe(9)
      expect(row!.cost_usd).toBe(0)
    })

    /**
     * Défaut B (n6), volet lecture : « toute alerte de coût quotidien mesure
     * [dev et prod] à la fois » — parce que rien ne pouvait leur demander de
     * ne mesurer QUE l'une des deux. `overview()` accepte donc un filtre
     * `environment` optionnel.
     *
     * ⚠️ Le piège nommé dans la consigne : les lignes déjà en base n'ont pas
     * la colonne (NULL, "environnement inconnu"). Un filtre qui les COALESCE
     * vers 'production' gonflerait rétroactivement le coût de production de
     * tout l'historique de développement. Le filtre doit donc être une
     * égalité STRICTE (`environment = $2`), qui exclut naturellement le NULL
     * — jamais un `COALESCE(environment, 'production') = $2`.
     */
    describe('filtre par environnement (Défaut B, n6)', () => {
      it('sans filtre : le comportement est INCHANGÉ — aucune requête ne borne l’environnement', async () => {
        const { service, query } = overviewSetup({})

        await service.overview(30)

        const sqls = query.mock.calls.map(call => String(call[0]))
        expect(sqls.length).toBeGreaterThan(0)
        expect(sqls.every(sql => !/environment/i.test(sql))).toBe(true)
      })

      it('avec un environnement : chaque requête le borne par égalité STRICTE — jamais par COALESCE', async () => {
        const { service, query } = overviewSetup({})

        await service.overview(30, 'production')

        const calls = query.mock.calls
        expect(calls.length).toBeGreaterThan(0)
        for (const [sql, params] of calls) {
          expect(String(sql)).toMatch(/AND\s+environment\s*=\s*\$2/i)
          expect(String(sql)).not.toMatch(/COALESCE\(\s*environment/i)
          expect(params).toEqual([expect.any(Date), 'production'])
        }
      })

      it("prouve l'appelant : filtrer sur 'production' exclut les lignes de développement", async () => {
        // Ce que ferait réellement une alerte de coût quotidien qui ne veut pas
        // mélanger dev et prod : elle appelle `overview(days, 'production')` et
        // ne doit lire QUE ce que Postgres aurait filtré par `environment = $2`
        // — jamais la somme des deux, qui est exactement le défaut n6-B.
        const query = jest.fn().mockImplementation((sql: string, params: unknown[]) => {
          if (!/COALESCE\(provider::text/.test(String(sql))) return Promise.resolve([])
          // `GROUP BY 1` groupe par `provider`, PAS par `environment` : sans
          // filtre, Postgres rend UNE ligne déjà sommée sur les deux
          // environnements — le mock reproduit ce vrai comportement plutôt que
          // de renvoyer deux lignes que le code TS re-sommerait lui-même.
          const filteredToProd = params.length === 2 && params[1] === 'production'
          return Promise.resolve(
            filteredToProd
              ? [{ key: 'anthropic', calls: '10', units: '1000', cost_usd: '5.00', untariffed: '0' }]
              : [{ key: 'anthropic', calls: '50', units: '5000', cost_usd: '5.02', untariffed: '0' }],
          )
        })
        const costs = { insert: jest.fn(), manager: { query } }
        const service = new ProviderCostService(costs as never)

        const allEnvironments = await service.overview(30)
        const productionOnly = await service.overview(30, 'production')

        // Sans filtre : dev + prod additionnés (le défaut actuel, préservé).
        expect(allEnvironments.byProvider).toEqual([
          { key: 'anthropic', calls: 50, units: 5000, cost_usd: 5.02, untariffed: 0 },
        ])
        // Filtré : la ligne de dev (0,02 $ sur 40 appels) a disparu du total.
        expect(productionOnly.byProvider).toEqual([
          { key: 'anthropic', calls: 10, units: 1000, cost_usd: 5, untariffed: 0 },
        ])
      })
    })
  })

  /**
   * #1661 — la série JOUR × FOURNISSEUR, l'axe que l'écran des coûts empile.
   *
   * Ce que ces tests défendent : **une journée sans consommation n'est pas une
   * journée à zéro.** Le registre ne peut pas prouver qu'on n'a rien dépensé —
   * il peut seulement dire qu'il n'a rien vu. Les deux se ressemblent sur un
   * graphique, et l'un des deux est un mensonge.
   */
  describe('série quotidienne (#1661)', () => {
    type Ligne = { day: string; provider: string | null; cost_usd: string; priced: number; untariffed: number }

    /** Un mock qui répond à CHAQUE requête d'`overview` par sa forme propre. */
    function dailySetup(jours: Ligne[], distinct?: { operations: number; workspaces: number; accounts: number }) {
      const query = jest.fn().mockImplementation((sql: string) => {
        const texte = String(sql)
        if (/generate_series/.test(texte)) return Promise.resolve(jours)
        if (/COUNT\(DISTINCT/.test(texte)) return Promise.resolve(distinct ? [distinct] : [])
        return Promise.resolve([])
      })
      return { service: new ProviderCostService({ insert: jest.fn(), manager: { query } } as never), query }
    }

    /** N journées consécutives à un coût donné, une seule ligne fournisseur. */
    function joursA(premier: number, nombre: number, cout: number): Ligne[] {
      return Array.from({ length: nombre }, (_, index) => ({
        day: `2026-09-${String(premier + index).padStart(2, '0')}`,
        provider: 'anthropic',
        cost_usd: String(cout),
        priced: 1,
        untariffed: 0,
      }))
    }

    it('replie les lignes en une journée par entrée, décomposée par fournisseur', async () => {
      const { service } = dailySetup([
        { day: '2026-09-01', provider: 'anthropic', cost_usd: '4.5', priced: 3, untariffed: 0 },
        { day: '2026-09-01', provider: 'firecrawl', cost_usd: '1.25', priced: 2, untariffed: 0 },
      ])

      const { byDay } = await service.overview(30)

      expect(byDay).toEqual([
        {
          day: '2026-09-01',
          measured: true,
          costUsd: 5.75,
          perProvider: { anthropic: 4.5, firecrawl: 1.25 },
          untariffed: 0,
        },
      ])
    })

    it('une journée SANS aucune ligne est « non mesurée », jamais « 0 $ »', async () => {
      // C'est la ligne que le LEFT JOIN produit : le jour existe, `provider`
      // est NULL, rien n'a été vu. Un `costUsd: 0` ici dessinerait une colonne
      // à zéro sur un graphique — c'est-à-dire une dépense nulle AFFIRMÉE.
      const { service } = dailySetup([{ day: '2026-09-02', provider: null, cost_usd: '0', priced: 0, untariffed: 0 }])

      const [jour] = (await service.overview(30)).byDay

      expect(jour).toEqual({ day: '2026-09-02', measured: false, costUsd: null, perProvider: {}, untariffed: 0 })
    })

    it('une journée dont TOUTES les lignes sont sans prix reste non mesurée, et les COMPTE', async () => {
      // « Non tarifé » n'est pas « gratuit » : le jour n'a pas de coût connu,
      // et le nombre de lignes sans prix est dit plutôt que noyé.
      const { service } = dailySetup([
        { day: '2026-09-03', provider: 'apollo', cost_usd: '0', priced: 0, untariffed: 9 },
      ])

      const [jour] = (await service.overview(30)).byDay

      expect(jour).toEqual({ day: '2026-09-03', measured: false, costUsd: null, perProvider: {}, untariffed: 9 })
    })

    it('un VRAI zéro reste un zéro — une ligne tarifée à 0,00 $ est mesurée', async () => {
      // La règle a deux côtés : on ne fabrique pas de faux zéro, et on ne
      // masque pas un vrai. Un fournisseur tarifé qui n'a rien coûté ce
      // jour-là a bien coûté zéro.
      const { service } = dailySetup([
        { day: '2026-09-04', provider: 'serper', cost_usd: '0', priced: 4, untariffed: 0 },
      ])

      const [jour] = (await service.overview(30)).byDay

      expect(jour).toMatchObject({ measured: true, costUsd: 0 })
    })

    it('compte les clés DISTINCTES — un top 20 n’est pas un total', async () => {
      const { service } = dailySetup([], { operations: 31, workspaces: 47, accounts: 168 })

      const { distinctKeys } = await service.overview(30)

      expect(distinctKeys).toEqual({ operation: 31, workspace: 47, account: 168 })
    })

    it('sans réponse au comptage, les clés distinctes valent 0 plutôt que de lever', async () => {
      const { service } = dailySetup([])

      expect((await service.overview(30)).distinctKeys).toEqual({ operation: 0, workspace: 0, account: 0 })
    })

    it('le pic se lit sur la dernière journée COMPLÈTE — jamais sur celle en cours', async () => {
      // Sept journées à 10 $, puis un 08 à 40 $, puis la journée EN COURS
      // (le 09) qui n'a encore presque rien dépensé. Le verdict doit porter sur
      // le 08 : une journée incomplète comparée à des journées entières ne
      // produirait que des faux négatifs.
      const { service } = dailySetup([
        ...joursA(1, 7, 10),
        { day: '2026-09-08', provider: 'anthropic', cost_usd: '40', priced: 1, untariffed: 0 },
        { day: '2026-09-09', provider: 'anthropic', cost_usd: '0.5', priced: 1, untariffed: 0 },
      ])

      const { costSpike } = await service.overview(30)

      expect(costSpike).toEqual({
        spike: true,
        day: '2026-09-08',
        costUsd: 40,
        medianUsd: 10,
        ratio: 4,
        thresholdUsd: 15,
      })
    })

    it('sans médiane 7 jours, AUCUN pic — pas de données, pas d’alerte', async () => {
      const { service } = dailySetup([
        ...joursA(1, 3, 10),
        { day: '2026-09-04', provider: 'anthropic', cost_usd: '999', priced: 1, untariffed: 0 },
        { day: '2026-09-05', provider: 'anthropic', cost_usd: '1', priced: 1, untariffed: 0 },
      ])

      expect((await service.overview(30)).costSpike).toEqual({
        spike: false,
        reason: 'not_enough_days',
        observedDays: 3,
        requiredDays: 7,
      })
    })

    it('une série vide ne produit ni pic ni exception', async () => {
      const { service } = dailySetup([])

      expect((await service.overview(30)).costSpike).toEqual({
        spike: false,
        reason: 'not_enough_days',
        observedDays: 0,
        requiredDays: 7,
      })
    })

    it('les journées NON MESURÉES sortent de la médiane — elles ne la tirent pas vers le bas', async () => {
      // Le piège exact : si les trois journées sans donnée comptaient pour 0 $,
      // la médiane de sept tomberait, et un jour ordinaire passerait pour un
      // pic. Elles sortent donc de l'échantillon — au prix d'un « pas assez de
      // journées », qui est la bonne réponse.
      const { service } = dailySetup([
        ...joursA(1, 4, 10),
        { day: '2026-09-05', provider: null, cost_usd: '0', priced: 0, untariffed: 0 },
        { day: '2026-09-06', provider: null, cost_usd: '0', priced: 0, untariffed: 0 },
        { day: '2026-09-07', provider: null, cost_usd: '0', priced: 0, untariffed: 0 },
        { day: '2026-09-08', provider: 'anthropic', cost_usd: '11', priced: 1, untariffed: 0 },
        { day: '2026-09-09', provider: 'anthropic', cost_usd: '1', priced: 1, untariffed: 0 },
      ])

      expect((await service.overview(30)).costSpike).toMatchObject({ reason: 'not_enough_days', observedDays: 4 })
    })
  })
})
