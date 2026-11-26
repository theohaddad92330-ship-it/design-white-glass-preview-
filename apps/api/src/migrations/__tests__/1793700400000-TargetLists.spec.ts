import { TARGET_PRIORITIES } from '@bellum/contracts'
import type { QueryRunner } from 'typeorm'
import { TargetLists1793700400000 } from '../1793700400000-TargetLists'

async function upQueries(): Promise<string[]> {
  const queries: string[] = []
  const runner = {
    query: jest.fn(async (sql: string) => {
      queries.push(sql.replace(/\s+/g, ' ').trim())
      return []
    }),
  } as unknown as QueryRunner
  await new TargetLists1793700400000().up(runner)
  return queries
}

/** #2155.14 / .15 / .28 — une cible RÉFÉRENCE la fiche canonique, elle ne la recopie pas. */
describe('TargetLists1793700400000', () => {
  it('un élément référence un compte OU un contact — jamais les deux, jamais aucun', async () => {
    const sql = (await upQueries()).join('\n')
    expect(sql).toContain('CHECK (num_nonnulls(account_id, contact_id) = 1)')
    expect(sql).toContain('account_id uuid NULL REFERENCES accounts(id) ON DELETE CASCADE')
    expect(sql).toContain('contact_id uuid NULL REFERENCES contacts(id) ON DELETE CASCADE')
  })

  it('ne recopie AUCUNE donnée de la fiche — ni nom, ni titre, ni entreprise', async () => {
    const items = (await upQueries()).find(q => q.startsWith('CREATE TABLE IF NOT EXISTS target_list_items'))
    expect(items).toBeDefined()
    for (const copied of ['full_name', 'company_name', 'title', 'email', 'label']) {
      expect(items).not.toMatch(new RegExp(`\\b${copied}\\b`))
    }
  })

  /**
   * #2156.41 a .48 — CE QUE CETTE MIGRATION-CI CREE, PAS LE CONTRAT D'AUJOURD'HUI.
   *
   * Cette assertion lisait `TARGET_WORK_STATUSES` en entier, ce qui revenait a
   * exiger qu'une migration de CREATION connaisse toute valeur future de son
   * enumeration : elle est devenue rouge le jour ou #2156 a ajoute les quatre
   * statuts du parcours (`to_enrich`, `ready_to_contact`, `replied`,
   * `to_follow_up`) — l'elargissement vivant, comme GA-11 l'exige, dans une
   * migration POSTERIEURE (`1794100237841-TargetListsModel`, dont la spec
   * verifie que les cinq d'avant gardent leur rang).
   *
   * Un instantane se verifie contre ce qu'il posait. La couverture du contrat
   * ENTIER est tenue par GA-12 (`check-constraints-cover-enums.spec.ts`), qui
   * lit la DERNIERE declaration de chaque contrainte, pas la premiere — c'est
   * la seule lecture qui peut rester vraie quand une enumeration grandit.
   */
  it('pose les valeurs de son epoque, et les deux enumerations encore figees (GA-12)', async () => {
    const sql = (await upQueries()).join('\n')
    const byName = (name: string) => sql.split('CONSTRAINT ').find(part => part.startsWith(name)) ?? ''
    for (const value of ['to_review', 'in_progress', 'contacted', 'done', 'dropped'])
      expect(byName('target_list_items_work_status_check')).toContain(`'${value}'`)
    // La provenance a grandi depuis (`laura`, `crm` : migrations 1796321349137 et
    // 1796321349281, #2973) — elle se lit donc, comme le statut, a son epoque.
    for (const value of ['manual', 'discover', 'import', 'analysis'])
      expect(byName('target_list_items_provenance_check')).toContain(`'${value}'`)
    // La priorite n'a pas bouge : elle se lit toujours au contrat.
    for (const value of TARGET_PRIORITIES) expect(byName('target_list_items_priority_check')).toContain(`'${value}'`)
  })

  it('active la RLS sur les deux tables', async () => {
    const sql = await upQueries()
    expect(sql).toContain('ALTER TABLE target_lists ENABLE ROW LEVEL SECURITY')
    expect(sql).toContain('ALTER TABLE target_list_items ENABLE ROW LEVEL SECURITY')
  })
})
