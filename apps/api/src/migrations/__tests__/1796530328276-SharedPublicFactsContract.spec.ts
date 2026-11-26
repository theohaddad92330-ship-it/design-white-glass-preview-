import type { QueryRunner } from 'typeorm'
import {
  SHARED_PUBLIC_FACT_KEY_PATTERN,
  SHARED_PUBLIC_FACT_WORKSPACE_MARKERS,
  SHARED_PUBLIC_FACTS_STORE,
} from '@bellum/contracts'
import { SharedPublicFactsContract1796530328276 } from '../1796530328276-SharedPublicFactsContract'

const normalize = (sql: string): string => sql.replace(/\s+/g, ' ').trim()

async function upQueries(): Promise<string> {
  const queries: string[] = []
  const runner = {
    query: jest.fn(async (sql: string) => {
      queries.push(normalize(sql))
      return []
    }),
  } as unknown as QueryRunner
  await new SharedPublicFactsContract1796530328276().up(runner)
  return queries.join(' ')
}

describe('SharedPublicFactsContract1796530328276 (#3989 — la base commune des faits publics, tenue en SQL)', () => {
  it('ajout seulement : des contraintes NOT VALID sur la seule famille public_facts, jamais une ligne touchée', async () => {
    const flat = await upQueries()
    expect(flat).not.toMatch(/DROP TABLE|DELETE FROM|TRUNCATE|UPDATE source_cache|ALTER COLUMN/)
    const adds = flat.match(
      /ADD CONSTRAINT source_cache_public_fact_\w+ CHECK \(source <> 'public_facts' OR [^;]+? NOT VALID/g,
    )
    expect(adds).toHaveLength(3)
    expect(SHARED_PUBLIC_FACTS_STORE).toEqual({ table: 'source_cache', family: 'public_facts' })
  })

  it('la clé est une ENTREPRISE suivie d’un jeton fermé — jamais un espace, un compte, un texte libre', async () => {
    const flat = await upQueries()
    expect(flat).toContain(`company_key ~ '${SHARED_PUBLIC_FACT_KEY_PATTERN}'`)
    const key = new RegExp(SHARED_PUBLIC_FACT_KEY_PATTERN)
    expect(key.test('siren:552049447|esn_it')).toBe(true)
    expect(key.test('domain:acme.fr|')).toBe(true)
    expect(key.test('siren:552049447|ft:esn_it:all')).toBe(true)
    // Sait dire NON.
    expect(key.test('account:7f0c|esn_it')).toBe(false)
    expect(key.test('siren:552049447|Cabinet Dupont')).toBe(false)
    expect(key.test('siren:552049447')).toBe(false)
  })

  it('un fait garde sa date de collecte et sa liste de lignes — la NULLITÉ ne passe pas le CHECK', async () => {
    const flat = await upQueries()
    expect(flat).toContain("COALESCE(jsonb_typeof(payload->'collectedAt'), '') = 'string'")
    expect(flat).toContain("COALESCE(jsonb_typeof(payload->'rows'), '') = 'array'")
  })

  it('aucun marqueur d’espace ni d’utilisateur, à AUCUNE profondeur du fait', async () => {
    const flat = await upQueries()
    for (const marker of SHARED_PUBLIC_FACT_WORKSPACE_MARKERS) {
      expect(flat).toContain(`exists(@.${marker})`)
    }
    expect(flat).toContain("NOT jsonb_path_exists(payload, 'strict $.** ?")
  })

  it('down() retire les trois contraintes, jamais la table ni ses lignes', async () => {
    const queries: string[] = []
    const runner = {
      query: jest.fn(async (sql: string) => void queries.push(normalize(sql))),
    } as unknown as QueryRunner
    await new SharedPublicFactsContract1796530328276().down(runner)
    const flat = queries.join(' ')
    expect(flat.match(/DROP CONSTRAINT IF EXISTS source_cache_public_fact_\w+/g)).toHaveLength(3)
    expect(flat).not.toMatch(/DROP TABLE|DELETE FROM/)
  })
})
