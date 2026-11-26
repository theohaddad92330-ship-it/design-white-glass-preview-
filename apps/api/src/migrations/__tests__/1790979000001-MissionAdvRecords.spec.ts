import type { QueryRunner } from 'typeorm'
import { MissionAdvRecords1790979000001 } from '../1790979000001-MissionAdvRecords'

/** Capture chaque instruction SQL émise (aucune base réelle n'est nécessaire). */
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

async function ranQueries(): Promise<string[]> {
  const { runner, queries } = createRunner()
  await new MissionAdvRecords1790979000001().up(runner)
  return queries.map(normalize)
}

describe('MissionAdvRecords1790979000001', () => {
  it('crée la table du dossier ADV avec ses deux contraintes, AVANT tout code qui écrit', async () => {
    const queries = await ranQueries()
    const create = queries.find(q => q.includes('CREATE TABLE'))
    expect(create).toContain('CREATE TABLE IF NOT EXISTS mission_adv_records')
    // `0` n'est pas une condition de règlement : le laisser passer ferait lire
    // « personne ne les a saisies » comme « règlement comptant ».
    expect(create).toContain('CHECK (payment_terms_days IS NULL OR payment_terms_days > 0)')
    // Une chaîne vide se lirait comme une référence saisie.
    expect(create).toContain("CHECK (client_billing_reference IS NULL OR btrim(client_billing_reference) <> '')")
    expect(create).toContain('REFERENCES missions(id) ON DELETE CASCADE')
  })

  it('NE PORTE AUCUN moyen de paiement — le refus d’IBAN du dépôt n’est pas levé', async () => {
    // Ce test est la garde de forme : il n'y a nulle part, dans cette table, où
    // ranger un numéro. C'est la structure qui tient la règle, pas un commentaire.
    const create = (await ranQueries()).find(q => q.includes('CREATE TABLE')) ?? ''
    // Le commentaire de table CITE le mot « IBAN » pour dire qu'il n'y en a
    // pas : c'est le `CREATE TABLE` seul qu'on inspecte ici.
    for (const forbidden of ['iban', 'bic', 'swift', 'account_number', 'rib']) {
      expect(create.toLowerCase()).not.toContain(forbidden)
    }
    // Ce qui EST stocké de la transmission est une date, et rien d'autre.
    expect(create).toContain('payment_details_transmitted_at timestamptz')
  })

  it('n’autorise qu’UN dossier par mission, et indexe l’espace pour la purge de démo', async () => {
    const queries = await ranQueries()
    expect(queries.some(q => q.includes('CREATE UNIQUE INDEX IF NOT EXISTS mission_adv_records_mission_idx'))).toBe(
      true,
    )
    expect(queries.some(q => q.includes('mission_adv_records_workspace_idx'))).toBe(true)
  })

  it('down() ne retire QUE la table qu’elle a posée', async () => {
    const { runner, queries } = createRunner()
    await new MissionAdvRecords1790979000001().down(runner)
    expect(queries.map(normalize)).toEqual(['DROP TABLE IF EXISTS mission_adv_records'])
  })
})
