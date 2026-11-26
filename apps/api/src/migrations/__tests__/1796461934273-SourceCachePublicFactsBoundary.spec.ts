import type { QueryRunner } from 'typeorm'
import { SourceCachePublicFactsBoundary1796461934273 } from '../1796461934273-SourceCachePublicFactsBoundary'

const normalize = (sql: string): string => sql.replace(/\s+/g, ' ').trim()

function createRunner(): { runner: QueryRunner; queries: string[] } {
  const queries: string[] = []
  const runner = {
    query: jest.fn(async (sql: string) => {
      queries.push(normalize(sql))
      return []
    }),
  } as unknown as QueryRunner
  return { runner, queries }
}

describe('SourceCachePublicFactsBoundary1796461934273 (#4067 DECOUVRIR-COLLECTE)', () => {
  it('crée la table du cache partagé si le service IA ne l’a pas encore créée — même forme, ajout seulement', async () => {
    const { runner, queries } = createRunner()
    await new SourceCachePublicFactsBoundary1796461934273().up(runner)
    const flat = queries.join(' ')
    expect(flat).toContain('CREATE TABLE IF NOT EXISTS source_cache')
    expect(flat).toContain('PRIMARY KEY (source, category, company_key)')
    expect(flat).not.toMatch(/DROP TABLE|DELETE FROM|TRUNCATE/)
  })

  it('active la RLS SANS politique : aucun rôle client (anon, authenticated) ne lit le cache, seul le service', async () => {
    const { runner, queries } = createRunner()
    await new SourceCachePublicFactsBoundary1796461934273().up(runner)
    const flat = queries.join(' ')
    expect(flat).toContain('ALTER TABLE source_cache ENABLE ROW LEVEL SECURITY')
    expect(flat).not.toMatch(/CREATE POLICY/)
  })

  it('la base dit NON à une famille privée d’un espace, et borne les natures de faits publics', async () => {
    const { runner, queries } = createRunner()
    await new SourceCachePublicFactsBoundary1796461934273().up(runner)
    const flat = queries.join(' ')
    expect(flat).toContain(
      "CHECK (source NOT IN ('crm', 'notes', 'documents', 'drive', 'missions', 'corrections', 'lists', 'contacts', 'signal_history'))",
    )
    expect(flat).toContain(
      "CHECK (source <> 'public_facts' OR category IN ('jobs', 'news', 'legal', 'tenders', 'registry'))",
    )
  })

  it('down() retire les contraintes et la RLS, jamais la table ni ses lignes (on archive)', async () => {
    const { runner, queries } = createRunner()
    await new SourceCachePublicFactsBoundary1796461934273().down(runner)
    const flat = queries.join(' ')
    expect(flat).toContain('DROP CONSTRAINT IF EXISTS source_cache_no_private_family')
    expect(flat).toContain('DROP CONSTRAINT IF EXISTS source_cache_public_fact_natures')
    expect(flat).toContain('DISABLE ROW LEVEL SECURITY')
    expect(flat).not.toMatch(/DROP TABLE/)
  })
})
