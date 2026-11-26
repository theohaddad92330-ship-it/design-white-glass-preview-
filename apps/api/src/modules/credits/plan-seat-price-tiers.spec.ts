import type { QueryRunner } from 'typeorm'
import { PlanSeatPriceTiers1788251437219 } from '../../migrations/1788251437219-PlanSeatPriceTiers'
import { PLAN_CATALOG_DEFAULTS } from './plan-catalog.defaults'

/**
 * Le siège supplémentaire est PROPORTIONNEL au palier (29 / 59 / 89 € — Louis
 * 26/07, Growth ramené à 89 € le 31/07) : un siège puise dans le pool de crédits du plan, donc il coûte plus
 * cher là où le pool est plus riche.
 *
 * Ce test tient les deux bouts : les défauts embarqués (ce que voit un
 * environnement neuf / table vide) ET la migration (ce que voit la prod, dont
 * les lignes sont déjà seedées à 2900).
 */
describe('prix du siège supplémentaire — par palier', () => {
  it('le seul palier vendu ne vend AUCUN siège', () => {
    // Grille du 27/08 : Growth est un poste de travail mono-utilisateur. Zéro
    // ne veut pas dire « siège gratuit » — il veut dire qu'il n'y a rien à
    // acheter. La deuxième personne passe par un devis Entreprise.
    expect(PLAN_CATALOG_DEFAULTS.growth.seats).toBe(1)
    expect(PLAN_CATALOG_DEFAULTS.growth.extra_seat_price).toBe(0)
  })

  it('les paliers hors vente gardent le prix de siège qu’ils ont toujours eu', () => {
    // Ils ne sont plus proposés, mais des espaces les portent encore et des
    // sièges y ont été payés. Remettre ces valeurs à zéro effacerait ce que
    // ces espaces ont acheté.
    expect(PLAN_CATALOG_DEFAULTS.starter.extra_seat_price).toBe(3900)
    expect(PLAN_CATALOG_DEFAULTS.team.extra_seat_price).toBe(5900)
  })

  it('il n’y a qu’UN palier achetable — l’invariant de comparaison n’a plus d’objet', () => {
    // L'ancienne règle (« le siège croît avec le palier ») ne gardait qu'une
    // chose : qu'un prospect comparant deux cartes côte à côte voie une
    // progression cohérente. Il n'y a plus deux cartes à comparer. Ce que ce
    // test garde désormais, c'est la DÉCISION elle-même : si quelqu'un remet
    // un second palier en self-service, il tombe ici avant que la page de
    // tarifs ne l'affiche.
    const sellable = (Object.keys(PLAN_CATALOG_DEFAULTS) as (keyof typeof PLAN_CATALOG_DEFAULTS)[]).filter(
      key => PLAN_CATALOG_DEFAULTS[key].self_serve,
    )
    expect(sellable).toEqual(['growth'])
  })

  it('un siège en plus reste moins cher que le plan qui le contient', () => {
    // Garde-fou commercial : si un siège coûtait plus que l'abonnement lui-même,
    // le client aurait intérêt à ouvrir un second compte plutôt qu'un siège.
    for (const key of ['starter', 'team', 'growth'] as const) {
      const plan = PLAN_CATALOG_DEFAULTS[key]
      expect(plan.extra_seat_price).toBeLessThan(plan.price)
    }
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
      await new PlanSeatPriceTiers1788251437219().up(queryRunner)
      return calls
    }

    it('applique exactement les défauts embarqués aux paliers concernés', async () => {
      const calls = await run()
      // Valeurs HISTORIQUES : cette migration a déjà tourné en prod, ses
      // paramètres sont figés. Le passage de Growth à 89 € est porté par la
      // migration suivante (`1788300000000`), pas par une réécriture de
      // celle-ci — réécrire une migration jouée ne change rien à la base.
      expect(calls.map(c => c.params)).toEqual([
        [5900, 'team'],
        [9900, 'growth'],
      ])
    })

    it("ne touche jamais une ligne qu'un opérateur a déjà éditée", async () => {
      // Le WHERE ne cible que l'ancien défaut : un prix choisi dans le backoffice
      // survit à la migration, et rejouer la migration ne fait plus rien.
      for (const { sql } of await run()) {
        expect(sql).toContain('extra_seat_price_cents = 2900')
      }
    })

    it('ne touche pas Starter-Solo (son prix ne change pas)', async () => {
      expect((await run()).flatMap(c => c.params)).not.toContain('starter')
    })
  })
})
