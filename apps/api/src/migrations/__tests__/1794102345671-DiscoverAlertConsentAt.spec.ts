import type { QueryRunner } from 'typeorm'
import { DiscoverAlertConsentAt1794102345671 } from '../1794102345671-DiscoverAlertConsentAt'

async function upQueries(): Promise<string[]> {
  const queries: string[] = []
  const runner = {
    query: jest.fn(async (sql: string) => {
      queries.push(sql.replace(/\s+/g, ' ').trim())
      return []
    }),
  } as unknown as QueryRunner
  await new DiscoverAlertConsentAt1794102345671().up(runner)
  return queries
}

/**
 * La colonne qui rend un consentement DÉMONTRABLE.
 *
 * Le fait qui la motive : il existe en base des lignes `weekly_digest = true`
 * que personne n'a cochées. Une case dit qu'elle vaut `true` ; elle ne dit ni
 * quand ni comment elle y est passée. Une DATE, elle, ne s'écrit que sur le
 * chemin d'un geste.
 */
describe('DiscoverAlertConsentAt1794102345671', () => {
  it('ajoute `alert_consent_at` en NULLABLE — porte « ajout seulement »', async () => {
    const sql = (await upQueries()).join('\n')
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS alert_consent_at timestamptz')
    expect(sql).not.toMatch(/ADD COLUMN IF NOT EXISTS alert_consent_at[^\n]*NOT NULL/)
  })

  it('ne pose AUCUN défaut — un défaut de colonne écrirait un consentement que personne n’a donné', async () => {
    const sql = (await upQueries()).join('\n')
    expect(sql).not.toMatch(/alert_consent_at[^\n]*DEFAULT/i)
  })

  it('ne réécrit AUCUNE ligne existante — un `true` déjà en base reste non qualifié', async () => {
    // C'est la moitié de la règle : rétro-dater les lignes d'hier fabriquerait
    // exactement le consentement supposé qu'on refuse.
    const sql = (await upQueries()).join('\n')
    expect(sql).not.toMatch(/\bUPDATE\b/i)
    expect(sql).not.toMatch(/\bDELETE\b/i)
  })

  it('ne rétrécit aucune contrainte et n’en ajoute aucune (GA-11)', async () => {
    const sql = (await upQueries()).join('\n')
    expect(sql).not.toMatch(/DROP CONSTRAINT/i)
    expect(sql).not.toMatch(/ADD CONSTRAINT/i)
  })
})
