import type { QueryRunner } from 'typeorm'
import { OpenCrmNativeOnExistingPlans1789351994288 } from '../../migrations/1789351994288-OpenCrmNativeOnExistingPlans'

/**
 * La porte fermée en silence sur tous les clients existants.
 *
 * Constaté en production le 17/08 : `PATCH /accounts/:id` et `GET /notes`
 * rendaient 403 pour tout le monde, dix minutes après le déploiement du socle
 * CRM. Le code était juste ; la grille de features stockée en base, elle, avait
 * été écrite avant que `crm_native` existe — donc aucun espace déjà provisionné
 * ne la portait.
 *
 * Ce qui se teste ici est exactement ce qui a manqué : la migration ADDITIONNE
 * sans rien retirer, et ne rejoue pas sur une grille qui porte déjà la clé.
 */
describe('ouverture de crm_native / ats_native sur les grilles existantes', () => {
  async function run(): Promise<{ sql: string; params: unknown[] }[]> {
    const calls: { sql: string; params: unknown[] }[] = []
    const queryRunner = {
      query: jest.fn(async (sql: string, params: unknown[]) => {
        calls.push({ sql, params })
        return []
      }),
    } as unknown as QueryRunner
    await new OpenCrmNativeOnExistingPlans1789351994288().up(queryRunner)
    return calls
  }

  it('ouvre LES DEUX clés, une requête chacune', async () => {
    const calls = await run()
    expect(calls).toHaveLength(2)
    expect(calls[0]!.params).toEqual(['crm_native'])
    expect(calls[1]!.params).toEqual(['ats_native'])
  })

  it('ajoute la clé sans jamais réécrire la grille entière', async () => {
    const [{ sql }] = await run()
    const flat = sql.replace(/\s+/g, ' ')
    // Concaténation, pas remplacement : une grille qu'un opérateur a restreinte
    // garde toutes ses autres décisions.
    expect(flat).toContain("features = COALESCE(features, '[]'::jsonb) || to_jsonb($1::text)")
    expect(flat).not.toContain('SET features = $1::jsonb')
  })

  it('est idempotente — une grille qui porte déjà la clé n’est pas touchée', async () => {
    const [{ sql }] = await run()
    const flat = sql.replace(/\s+/g, ' ')
    expect(flat).toContain("WHERE NOT COALESCE(features, '[]'::jsonb) @> to_jsonb($1::text)")
  })

  it('ne cible AUCUN palier en particulier — les deux clés sont ouvertes par défaut', async () => {
    const [{ sql }] = await run()
    expect(sql).not.toContain("key = '")
  })

  it('refuse de redescendre : retirer la clé refermerait la porte', async () => {
    await expect(new OpenCrmNativeOnExistingPlans1789351994288().down()).rejects.toThrow(/not supported/)
  })
})
