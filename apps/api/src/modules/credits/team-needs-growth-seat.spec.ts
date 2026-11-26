import type { QueryRunner } from 'typeorm'
import { TeamNeedsAndGrowthSeatPrice1788300000000 } from '../../migrations/1788300000000-TeamNeedsAndGrowthSeatPrice'
import { PLAN_CATALOG_DEFAULTS } from './plan-catalog.defaults'

/**
 * Arbitrages Louis 31/07 : siège Growth à 89 €, écran Besoins ouvert dès Team.
 *
 * Les défauts embarqués ne suffisent pas — le catalogue live fait foi partout,
 * donc la prod déjà seedée garderait l'ancienne grille sans cette migration.
 */
describe('Besoins en Team + siège Growth à 89 €', () => {
  it('les défauts embarqués portent la décision', () => {
    // 27/08 : Growth ne vend plus de siège du tout (0 = « rien à acheter »,
    // pas « gratuit »). Ce que ce test garde encore, et qui n'a pas changé,
    // c'est que les Besoins sont ouverts sur Team ET sur Growth.
    expect(PLAN_CATALOG_DEFAULTS.growth.extra_seat_price).toBe(0)
    expect(PLAN_CATALOG_DEFAULTS.team.features).toContain('needs')
    // Cumulatif : Growth garde tout ce que porte Team.
    expect(PLAN_CATALOG_DEFAULTS.growth.features).toContain('needs')
    // Starter reste au socle : la décision descend Besoins d'un cran, pas de deux.
    expect(PLAN_CATALOG_DEFAULTS.starter.features).not.toContain('needs')
  })

  describe('migration', () => {
    async function run(): Promise<{ sql: string; params: unknown[] }[]> {
      const calls: { sql: string; params: unknown[] }[] = []
      const queryRunner = {
        query: jest.fn(async (sql: string, params: unknown[]) => {
          calls.push({ sql, params })
          return []
        }),
      } as unknown as QueryRunner
      await new TeamNeedsAndGrowthSeatPrice1788300000000().up(queryRunner)
      return calls
    }

    it('descend le siège Growth à la valeur embarquée', async () => {
      const [seat] = await run()
      // La migration de juillet posait 8900 EN DUR : c'est un fait historique,
      // pas une valeur qui suit la grille. La comparer au défaut embarqué la
      // ferait échouer à chaque arbitrage tarifaire — ce qui vient d'arriver.
      expect(seat!.params).toEqual([8900, 9900])
    })

    it('pose sur Team la grille de juillet — un fait historique, pas la grille du jour', async () => {
      // Même leçon que le prix du siège juste au-dessus : la migration a écrit
      // CETTE liste-là, une fois. La comparer aux défauts vivants la ferait
      // échouer à chaque arbitrage d'offre — ce qui vient d'arriver quand le CRM
      // et l'ATS natifs sont entrés dans la grille (Louis 16/08), alors que la
      // migration de juillet, elle, n'a pas changé d'un octet.
      const [, grid] = await run()
      expect(JSON.parse(String(grid!.params[0]))).toEqual([
        'exports',
        'chat_ai',
        'discover',
        'watchlist',
        'knowledge_base',
        'team_workspace',
        'needs',
      ])
    })

    it("ne touche jamais un prix ni une grille qu'un opérateur a édités", async () => {
      // Le prix ne bouge que s'il vaut encore l'ancien défaut ; la grille, que si
      // elle est EXACTEMENT l'ancienne (comparée comme un ensemble, l'ordre en
      // base n'étant pas garanti). Une décision plus récente que la migration
      // n'est jamais rejouée par-dessus.
      const [seat, grid] = await run()
      expect(seat!.sql).toContain('extra_seat_price_cents = $2')
      expect(grid!.sql).toContain('array_agg(value ORDER BY value)')
      expect(grid!.params[1]).toEqual([
        'chat_ai',
        'discover',
        'exports',
        'knowledge_base',
        'team_workspace',
        'watchlist',
      ])
    })
  })
})
