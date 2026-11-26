import type { QueryRunner } from 'typeorm'
import { ProfileTimezone1793583612847 } from '../1793583612847-ProfileTimezone'

function createRunner(): { runner: QueryRunner; queries: string[] } {
  const queries: string[] = []
  const runner = {
    query: jest.fn(async (sql: string) => {
      queries.push(sql)
      return []
    }),
  } as unknown as QueryRunner
  return { runner, queries }
}

const normalize = (sql: string): string => sql.replace(/\s+/g, ' ').trim()

async function upQueries(): Promise<string[]> {
  const { runner, queries } = createRunner()
  await new ProfileTimezone1793583612847().up(runner)
  return queries.map(normalize)
}

/**
 * LE FUSEAU PAR UTILISATEUR — la colonne (décision Louis, 14/09/2026).
 *
 * Ce que la migration DOIT garantir :
 *  · ADDITIVE — une colonne, nullable, idempotente ; rien de retiré, rien de
 *    rétréci, aucune ligne réécrite ;
 *  · PAS de `DEFAULT 'Europe/Paris'` — c'est le cœur de la décision : un défaut
 *    en base rendrait « cette personne a choisi Paris » indiscernable de
 *    « personne n'a rien choisi », et il n'y aurait plus aucun moyen de
 *    proposer un fuseau détecté sans risquer d'écraser un choix humain ;
 *  · pas de contrainte de VALEUR — une liste de fuseaux périme, et une
 *    contrainte figée finirait par refuser un fuseau réel.
 */
describe('ProfileTimezone1793583612847', () => {
  it('ajoute `timezone` sur `profiles`, nullable et idempotent', async () => {
    expect(await upQueries()).toContain(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS timezone varchar(64) NULL`)
  })

  it('n’écrit AUCUN défaut : « inconnu » doit rester distinguable de « Paris choisi »', async () => {
    const sql = await upQueries()
    expect(sql.some(q => /DEFAULT/i.test(q))).toBe(false)
    expect(sql.some(q => /Europe\/Paris/.test(q))).toBe(false)
  })

  it('ne réécrit aucune ligne, ne supprime et ne rétrécit rien', async () => {
    const sql = await upQueries()
    expect(sql.some(q => q.startsWith('UPDATE '))).toBe(false)
    expect(sql.some(q => q.includes('DELETE FROM') || q.includes('DROP ') || q.includes('NOT NULL'))).toBe(false)
    // Preuve de lecture : la migration a bien produit du SQL.
    expect(sql.length).toBe(1)
  })

  it('ne pose aucune contrainte sur la VALEUR du fuseau', async () => {
    const sql = await upQueries()
    expect(sql.some(q => /CHECK\s*\(/i.test(q))).toBe(false)
  })

  it('redescend en retirant la seule colonne qu’elle a ajoutée', async () => {
    const { runner, queries } = createRunner()
    await new ProfileTimezone1793583612847().down(runner)
    expect(queries.map(normalize)).toEqual([`ALTER TABLE profiles DROP COLUMN IF EXISTS timezone`])
  })
})
