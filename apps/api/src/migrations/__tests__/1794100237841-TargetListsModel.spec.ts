import type { QueryRunner } from 'typeorm'
import { TargetListsModel1794100237841 } from '../1794100237841-TargetListsModel'

async function upQueries(): Promise<string[]> {
  const queries: string[] = []
  const runner = {
    query: jest.fn(async (sql: string) => {
      queries.push(sql.replace(/\s+/g, ' ').trim())
      return []
    }),
  } as unknown as QueryRunner
  await new TargetListsModel1794100237841().up(runner)
  return queries
}

/**
 * #2156.5 à .48 — le modèle d'une cible commerciale.
 *
 * Cette migration est ANTÉRIEURE au code qui écrit les nouvelles valeurs
 * (GA-11 / GA-12) : la contrainte s'élargit d'abord, le service écrit ensuite.
 */
describe('TargetListsModel1794100237841', () => {
  it('ajoute les champs de liste demandés, sans en retirer aucun (#2156.9 à .22)', async () => {
    const sql = (await upQueries()).join('\n')
    for (const column of [
      'owner_user_id uuid',
      'team text',
      'visibility text',
      'source text',
      'source_query jsonb',
      'status text',
      'next_action text',
      'sequence_id uuid',
      'prospecting_session_id uuid',
    ]) {
      expect(sql).toContain(`ALTER TABLE target_lists ADD COLUMN IF NOT EXISTS ${column}`)
    }
    expect(sql).not.toContain('DROP COLUMN')
  })

  it('ajoute les champs d’élément demandés, motif de retrait compris (#2156.24 à .33)', async () => {
    const sql = (await upQueries()).join('\n')
    for (const column of [
      'selection_reason text',
      'refreshed_at timestamptz',
      'removed_at timestamptz',
      'removal_reason text',
      'notes text',
    ]) {
      expect(sql).toContain(`ALTER TABLE target_list_items ADD COLUMN IF NOT EXISTS ${column}`)
    }
  })

  it('les sept statuts de liste sont contraints en base (#2156.34 à .40)', async () => {
    const sql = (await upQueries()).join('\n')
    const constraint = sql.split('CONSTRAINT ').find(part => part.startsWith('target_lists_status_check')) ?? ''
    for (const value of ['draft', 'to_qualify', 'ready', 'in_progress', 'paused', 'done', 'archived']) {
      expect(constraint).toContain(`'${value}'`)
    }
  })

  it('les huit statuts d’élément s’ajoutent EN FIN, les cinq d’avant gardent leur place (#2156.41 à .48)', async () => {
    const sql = (await upQueries()).join('\n')
    const constraint =
      sql.split('CONSTRAINT ').find(part => part.startsWith('target_list_items_work_status_check')) ?? ''
    const values = [...constraint.matchAll(/'([a-z_]+)'/g)].map(match => match[1])
    // GA-08 : aucune valeur ne disparaît, et l'ordre historique ne bouge pas.
    expect(values.slice(0, 5)).toEqual(['to_review', 'in_progress', 'contacted', 'done', 'dropped'])
    for (const added of ['to_enrich', 'ready_to_contact', 'replied', 'to_follow_up']) {
      expect(values).toContain(added)
    }
  })

  it('la visibilité et la source sont contraintes (#2156.11 / .12)', async () => {
    const sql = (await upQueries()).join('\n')
    const byName = (name: string) => sql.split('CONSTRAINT ').find(part => part.startsWith(name)) ?? ''
    for (const value of ['workspace', 'private'])
      expect(byName('target_lists_visibility_check')).toContain(`'${value}'`)
    for (const value of ['manual', 'discover', 'import', 'analysis', 'saved_search']) {
      expect(byName('target_lists_source_check')).toContain(`'${value}'`)
    }
  })

  it('un élément RETIRÉ ne bloque plus le ré-ajout de la même fiche (#2156.31)', async () => {
    const sql = (await upQueries()).join('\n')
    // On archive, on ne supprime pas : la ligne reste, donc l'unicité ne porte
    // plus que sur les éléments encore dans la liste.
    expect(sql).toMatch(/target_list_items_list_account_uniq[^\n]*removed_at IS NULL/)
    expect(sql).toMatch(/target_list_items_list_contact_uniq[^\n]*removed_at IS NULL/)
  })
})
