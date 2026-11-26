import { MEMORY_CROSSING_KINDS } from '@bellum/contracts'
import type { QueryRunner } from 'typeorm'
import { WorkspaceBridgeContacts1791450000001 } from '../1791450000001-WorkspaceBridgeContacts'

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
  await new WorkspaceBridgeContacts1791450000001().up(runner)
  return queries.map(normalize)
}

describe('WorkspaceBridgeContacts1791450000001', () => {
  it('couvre TOUTE la liste TypeScript des natures de croisement (GA-12)', async () => {
    const create = (await upQueries()).find(q => q.includes('CREATE TABLE'))
    expect(create).toBeDefined()
    for (const kind of MEMORY_CROSSING_KINDS) {
      expect(create).toContain(`'${kind}'`)
    }
  })

  it('nomme sa contrainte CHECK', async () => {
    const create = (await upQueries()).find(q => q.includes('CREATE TABLE'))
    expect(create).toContain('CONSTRAINT workspace_bridge_contacts_kind_check')
  })

  it('ne porte AUCUNE colonne de texte libre — le pont se compte, ce qui traverse ne se stocke pas', async () => {
    // La garde qui compte : une colonne `note`/`body`/`comment` ici ferait
    // rentrer par la base ce que le type d'un croisement interdit par le fil.
    const create = (await upQueries()).find(q => q.includes('CREATE TABLE')) as string
    const columns = create.slice(create.indexOf('('), create.indexOf('CONSTRAINT'))
    for (const forbidden of ['note', 'body', 'comment', 'message', 'detail', 'transcript', 'amount', 'margin']) {
      expect(columns).not.toContain(` ${forbidden} `)
    }
    // Preuve que l'extraction LIT quelque chose : les colonnes attendues y sont.
    for (const expected of ['workspace_id', 'account_id', 'kind', 'from_user_id', 'to_user_id', 'bridged_month']) {
      expect(columns).toContain(expected)
    }
  })

  it('borne l’espace, et compte une mise en relation par paire et par mois', async () => {
    const flat = await upQueries()
    const unique = flat.find(q => q.includes('workspace_bridge_contacts_once_idx')) as string
    expect(unique).toContain('UNIQUE INDEX')
    // Sans le mois, un clic de janvier empêcherait d'en compter un en février.
    expect(unique).toContain('bridged_month')
    // Sans `to_user_key`, deux `NULL` ne collisionnent pas et le même rôle
    // recontacté trois fois compterait trois ponts.
    expect(unique).toContain('to_user_key')
    expect(flat.some(q => q.includes('workspace_bridge_contacts_workspace_month_idx'))).toBe(true)
  })

  it('down() rend la table, sans laisser d’index orphelin', async () => {
    const { runner, queries } = createRunner()
    await new WorkspaceBridgeContacts1791450000001().down(runner)
    expect(queries.map(normalize)).toEqual(['DROP TABLE IF EXISTS workspace_bridge_contacts'])
  })
})
