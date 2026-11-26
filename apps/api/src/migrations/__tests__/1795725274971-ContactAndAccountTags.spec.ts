import type { QueryRunner } from 'typeorm'
import { TAGS_MAX_COUNT } from '@bellum/contracts'
import { ContactAndAccountTags1795725274971 } from '../1795725274971-ContactAndAccountTags'

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

// #2159.26 — les étiquettes des contacts et des comptes (décision Louis 19/09).
describe('ContactAndAccountTags1795725274971', () => {
  it.each(['contacts', 'accounts'])(
    'ajoute %s.tags, tableau NON NULL vide par défaut — jamais NULL à tester',
    async table => {
      const { runner, queries } = createRunner()
      await new ContactAndAccountTags1795725274971().up(runner)
      const sql = normalize(queries.join(' '))

      expect(sql).toContain(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}'`)
    },
  )

  // #2159.26 — graphie de la première saisie (décision Louis 19/09, « Casse
  // d'origine ») : la contrainte n'exige plus `lower(tags::text) = tags::text`.
  // Elle garde le plafond, l'absence de vide/NULL, et délègue à
  // `bellum_tags_valid` la longueur par étiquette et le doublon insensible à
  // la casse (non exprimables en ligne, sans subquery, dans un CHECK Postgres).
  it.each(['contacts', 'accounts'])(
    'la contrainte %s_tags_check tient la graphie unique en base : plafond, longueur, doublon insensible à la casse — SANS forcer les minuscules',
    async table => {
      const { runner, queries } = createRunner()
      await new ContactAndAccountTags1795725274971().up(runner)
      const sql = normalize(queries.join(' '))

      expect(sql).toContain(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${table}_tags_check`)
      expect(sql).toContain(
        `ALTER TABLE ${table} ADD CONSTRAINT ${table}_tags_check CHECK (cardinality(tags) <= ${TAGS_MAX_COUNT} AND array_position(tags, '') IS NULL AND array_position(tags, NULL) IS NULL AND bellum_tags_valid(tags))`,
      )
      expect(sql).not.toContain('lower(tags::text) = tags::text')
    },
  )

  it('crée `bellum_tags_valid`, IMMUTABLE, AVANT les contraintes qui l’appellent', async () => {
    const { runner, queries } = createRunner()
    await new ContactAndAccountTags1795725274971().up(runner)
    const sql = normalize(queries.join(' '))

    expect(sql).toContain('CREATE OR REPLACE FUNCTION bellum_tags_valid(tags text[]) RETURNS boolean')
    expect(sql).toContain('IMMUTABLE')
    // Longueur : au-delà de 40 caractères, refusé.
    expect(sql).toContain('length(t) > 40')
    // Doublon insensible à la casse : autant de clés distinctes que d'étiquettes.
    expect(sql).toContain('count(DISTINCT lower(t))')

    const fnIdx = sql.indexOf('CREATE OR REPLACE FUNCTION bellum_tags_valid')
    const checkIdx = sql.indexOf('bellum_tags_valid(tags))')
    expect(fnIdx).toBeGreaterThanOrEqual(0)
    expect(fnIdx).toBeLessThan(checkIdx)
  })

  it.each(['contacts', 'accounts'])('indexe %s.tags en GIN — le filtre de liste est un `@>`', async table => {
    const { runner, queries } = createRunner()
    await new ContactAndAccountTags1795725274971().up(runner)
    const sql = normalize(queries.join(' '))

    expect(sql).toContain(`CREATE INDEX IF NOT EXISTS idx_${table}_tags ON ${table} USING gin (tags)`)
  })

  it('down retire colonnes, contraintes, index ET la fonction — APRÈS les contraintes qui la référencent', async () => {
    const { runner, queries } = createRunner()
    await new ContactAndAccountTags1795725274971().down(runner)
    const sql = normalize(queries.join(' '))

    for (const table of ['contacts', 'accounts']) {
      expect(sql).toContain(`DROP INDEX IF EXISTS idx_${table}_tags`)
      expect(sql).toContain(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${table}_tags_check`)
      expect(sql).toContain(`ALTER TABLE ${table} DROP COLUMN IF EXISTS tags`)
    }
    expect(sql).toContain('DROP FUNCTION IF EXISTS bellum_tags_valid(text[])')
    const lastConstraintDropIdx = sql.lastIndexOf('DROP CONSTRAINT IF EXISTS accounts_tags_check')
    const fnDropIdx = sql.indexOf('DROP FUNCTION IF EXISTS bellum_tags_valid')
    expect(lastConstraintDropIdx).toBeGreaterThanOrEqual(0)
    expect(fnDropIdx).toBeGreaterThan(lastConstraintDropIdx)
  })
})
