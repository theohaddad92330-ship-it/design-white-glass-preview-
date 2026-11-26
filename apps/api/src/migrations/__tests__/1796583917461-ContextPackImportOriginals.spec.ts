import type { QueryRunner } from 'typeorm'
import { CONTEXT_PACK_ORIGINAL_STATUSES } from '@bellum/contracts'
import { ContextPackImportOriginals1796583917461 } from '../1796583917461-ContextPackImportOriginals'

/** #4573 — ajout seul : quatre colonnes nullables sur `context_pack_imports`, leurs contraintes ; rien de rétroactif. */
describe('ContextPackImportOriginals1796583917461', () => {
  async function upQueries(): Promise<string> {
    const queries: string[] = []
    const runner = {
      query: jest.fn(async (sql: string) => {
        queries.push(sql.replace(/\s+/g, ' ').trim())
        return []
      }),
    } as unknown as QueryRunner
    await new ContextPackImportOriginals1796583917461().up(runner)
    return queries.join(' ')
  }

  it('ajoute les colonnes de l’original, nullables, sans défaut qui réécrirait les lignes existantes', async () => {
    const all = await upQueries()
    for (const column of ['original_status', 'original_storage_path', 'original_mime_type', 'original_size_bytes']) {
      expect(all).toMatch(new RegExp(`ADD COLUMN IF NOT EXISTS ${column} (text|integer)(?! NOT NULL)(?! DEFAULT)`))
    }
  })

  it('borne le statut de l’original sur la liste des contrats, NULL compris (un import antérieur)', async () => {
    const all = await upQueries()
    const list = CONTEXT_PACK_ORIGINAL_STATUSES.map(status => `'${status}'`).join(', ')
    expect(all).toContain(`CONSTRAINT context_pack_imports_original_status_check`)
    expect(all).toContain(`original_status IS NULL OR original_status IN (${list})`)
    // Un chemin n'existe que pour un original conservé : jamais de chemin orphelin d'un autre statut.
    expect(all).toContain(`original_storage_path IS NULL OR original_status = 'kept'`)
  })

  it('ne touche aucune autre table et n’écrit aucune ligne (aucun rattrapage)', async () => {
    const all = await upQueries()
    expect(all).not.toMatch(/ALTER TABLE (?!context_pack_imports)|DROP TABLE|DELETE FROM|UPDATE |INSERT /)
  })
})
