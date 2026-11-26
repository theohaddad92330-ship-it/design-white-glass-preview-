import type { QueryRunner } from 'typeorm'
import { PlanDefinitions1786200000000 } from '../../migrations/1786200000000-PlanDefinitions'
import { analysesAffordable } from '@bellum/contracts'
import { PLAN_CATALOG_DEFAULTS, PLAN_KEYS, type PlanKey } from './plan-catalog.defaults'

/**
 * GOLDEN PARITY — the DB-backed catalog must ship byte-identical to the former
 * hardcoded `PLAN_CONFIG` const. This freezes a literal SNAPSHOT of that const
 * (the exact values it held at the moment it was extracted) and asserts:
 *
 *  1. `PLAN_CATALOG_DEFAULTS` (the service's fallback) === the snapshot, and
 *  2. the migration seeds those SAME values into `plan_definitions`.
 *
 * Together: seeded DB == defaults == old PLAN_CONFIG, for every key and every
 * enforcement field. If anyone edits the shipped defaults, this test fails —
 * which is the point: the factory baseline is immutable; live changes happen in
 * the DB, not here.
 */

// The exact `PLAN_CONFIG` const removed from credits.service.ts (do NOT edit —
// this is the frozen reference, not a config to keep in sync).
/**
 * Le gel a été REBASÉ deux fois, et chaque rebase a sa raison écrite.
 *
 *  · 23/07 — monnaie unique : un crédit vaut une action, donc chaque palier
 *    n'expose plus qu'un quota, somme exacte des deux anciens.
 *  · 02/08 — crédits PONDÉRÉS (recette finale §8-9, arbitrage Louis) : une
 *    analyse complète coûte 8 crédits, un enrichissement 1. Le ratio de coût
 *    réel étant d'environ 8:1, « une action = un crédit » sur-facturait les
 *    actions bon marché et bradait les lourdes. Les volumes suivent la
 *    pondération : 160 / 600 / 1 600 aux mêmes prix.
 *
 * L'invariant de 23/07 (« quota = somme des deux anciens ») ne survit pas à ce
 * rebase, et c'est normal : il vérifiait une CONVERSION d'unité à capacité
 * constante. Ici le prix de chaque action change, donc la capacité se mesure
 * autrement — en analyses, la grandeur que le commercial manipule. C'est ce que
 * vérifie le test qui l'a remplacé.
 *
 * Ce qui reste gelé, et que ce fichier protège : les libellés, les prix, les
 * sièges, l'ordre des clés, et le fait que la migration de seed reste le miroir
 * exact des défauts.
 */
// ⚠️ Rebasé le 02/09/2026 : il n'y a plus d'essai gratuit. `trial` garde son
// libellé et son prix nul, mais son quota tombe à ZÉRO — c'est désormais l'état
// VERROUILLÉ (celui où se rabat déjà un abonnement résilié), pas une fenêtre
// d'évaluation. Le gel enregistre ce retournement plutôt que de le subir : ce
// qui reste protégé, c'est qu'un palier à zéro crédit ne redevienne pas
// silencieusement une porte ouverte.
//
// ⚠️ Rebasé le 27/08/2026 sur la grille tranchée par Louis : UN seul palier
// achetable — Growth 199 € / 250 crédits / 1 utilisateur, aucun siège vendable.
// Starter rejoint Team hors de la vente ; leurs prix et quotas restent gelés à
// ce que payent les espaces qui les portent encore, parce qu'un code de palier
// ne disparaît jamais (GA-08). Le gel n'a pas disparu — il protège maintenant
// CETTE grille, qui est celle que le site annonce et que Stripe prélève.
const OLD_PLAN_CONFIG: Record<
  'trial' | 'starter' | 'team' | 'growth' | 'beta',
  { label: string; price: number; accounts_limit: number; enrichment_credits: number; seats: number }
> = {
  trial: { label: 'Essai', price: 0, accounts_limit: 0, enrichment_credits: 0, seats: 3 },
  starter: { label: 'Starter', price: 11900, accounts_limit: 80, enrichment_credits: 0, seats: 1 },
  team: { label: 'Team / Enterprise', price: 25900, accounts_limit: 600, enrichment_credits: 0, seats: 3 },
  growth: { label: 'Growth', price: 19900, accounts_limit: 250, enrichment_credits: 0, seats: 1 },
  beta: { label: 'Bêta Design Partner', price: 11900, accounts_limit: 600, enrichment_credits: 0, seats: 3 },
}

/**
 * Ce que chaque palier doit permettre, en ANALYSES COMPLÈTES.
 *
 * C'est la promesse commerciale traduite dans l'unité que le commercial
 * manipule : il ne compte pas des crédits, il compte des comptes qu'il peut
 * ouvrir. Un quota exprimé en crédits pondérés se lit mal ; celui-ci se vérifie.
 */
// RAB2 (Louis 10/10 soir) — volumes au prix de l'analyse PAR DÉFAUT, 10 crédits
// (avant : poids plein 8 → 10/75/31/75). On promet ce qu'on tient.
const ANALYSES_PER_CYCLE: Record<string, number> = {
  trial: 0,
  starter: 8,
  team: 60,
  growth: 25,
  beta: 60,
}

/** Les clés figées, dans leur ordre d'origine. Un palier ajouté APRÈS l'extraction
 *  (ex. `decouverte`) est appendé à `PLAN_KEYS` et n'entre pas dans le gel. */
const LEGACY_PLAN_KEYS = Object.keys(OLD_PLAN_CONFIG) as PlanKey[]

describe('plan catalog — golden parity with the old PLAN_CONFIG', () => {
  it('keeps the legacy keys first, in their original order', () => {
    expect([...PLAN_KEYS].slice(0, LEGACY_PLAN_KEYS.length)).toEqual(LEGACY_PLAN_KEYS)
  })

  it.each(LEGACY_PLAN_KEYS)('plan "%s" defaults are byte-identical to the old const', key => {
    const def = PLAN_CATALOG_DEFAULTS[key]
    expect({
      label: def.label,
      price: def.price,
      accounts_limit: def.accounts_limit,
      enrichment_credits: def.enrichment_credits,
      seats: def.seats,
    }).toEqual(OLD_PLAN_CONFIG[key])
  })

  it('chaque palier permet le nombre d’analyses annoncé, et une seule monnaie', () => {
    // Le quota se lit en crédits pondérés, mais la promesse se tient en
    // analyses. Un écart ici veut dire qu'on a changé un volume sans changer ce
    // qu'on vend.
    for (const [key, analyses] of Object.entries(ANALYSES_PER_CYCLE)) {
      const def = PLAN_CATALOG_DEFAULTS[key as PlanKey]
      expect(analysesAffordable(def.accounts_limit)).toBe(analyses)
      // Plus de seconde monnaie : la colonne reste, à zéro, et ne décide rien.
      expect(def.enrichment_credits).toBe(0)
    }
  })

  it('seeds the migration verbatim from the defaults (seeded DB == defaults == old PLAN_CONFIG)', async () => {
    const calls: Array<{ sql: string; params?: unknown[] }> = []
    const queryRunner = {
      query: jest.fn((sql: string, params?: unknown[]) => {
        calls.push({ sql, params })
        return Promise.resolve(undefined)
      }),
    } as unknown as QueryRunner

    await new PlanDefinitions1786200000000().up(queryRunner)

    // One INSERT per LEGACY plan, in their original order — this migration is
    // historical: a plan added later ships in its own migration, never here.
    const inserts = calls.filter(c => c.sql.includes('INSERT INTO plan_definitions'))
    expect(inserts).toHaveLength(LEGACY_PLAN_KEYS.length)

    inserts.forEach((insert, i) => {
      const key = LEGACY_PLAN_KEYS[i]!
      const old = OLD_PLAN_CONFIG[key]
      const def = PLAN_CATALOG_DEFAULTS[key]
      // Params: [key, label, price_cents, accounts_limit, enrichment_credits, seats, self_serve, sort_order]
      expect(insert.params).toEqual([
        key,
        old.label,
        old.price,
        old.accounts_limit,
        old.enrichment_credits,
        old.seats,
        def.self_serve,
        def.sort_order,
      ])
    })
  })
})
