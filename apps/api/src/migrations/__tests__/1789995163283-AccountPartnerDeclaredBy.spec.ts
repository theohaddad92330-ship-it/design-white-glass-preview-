import type { QueryRunner } from 'typeorm'
import { AccountPartnerDeclaredBy1789995163283 } from '../1789995163283-AccountPartnerDeclaredBy'

/**
 * #2298.7 — QUI a déclaré la relation, et QUAND.
 *
 * Sept des huit métadonnées de `account_partners` étaient déjà rendues dans
 * `TabPartners.tsx` (`source`, `scope`, `certainty`, `evidence_origins`,
 * `market_observation_count`, `detected_at`, `note`). La huitième — l'ACTEUR
 * d'une ligne `source = 'declared'` — était absente de l'entité : ni `user_id`
 * ni `declared_by`.
 *
 * ⚠️ GA-11 / GA-12 — la contrainte s'élargit AVANT le code qui l'écrit : cette
 * migration ADD COLUMN précède le `PartnersService.create` qui la renseigne.
 *
 * Cette suite ne branche aucune base : elle capture les instructions émises et
 * lit ce qu'elles DISENT, sur le modèle de `1795711263408-NeedWithoutProject.spec.ts`.
 */
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

async function runUp(): Promise<string[]> {
  const { runner, queries } = createRunner()
  await new AccountPartnerDeclaredBy1789995163283().up(runner)
  return queries.map(normalize)
}

async function runDown(): Promise<string[]> {
  const { runner, queries } = createRunner()
  await new AccountPartnerDeclaredBy1789995163283().down(runner)
  return queries.map(normalize)
}

describe('AccountPartnerDeclaredBy1789995163283', () => {
  it('ajoute `account_partners.declared_by`, NULLABLE et ADDITIVE', async () => {
    const sql = await runUp()
    const add = sql.find(q => q.includes('ADD COLUMN IF NOT EXISTS declared_by uuid'))
    expect(add).toBeDefined()
    expect(add).toContain('ALTER TABLE account_partners')
    // JAMAIS `NOT NULL` : une relation déclarée AVANT cette migration n'a pas
    // d'auteur, et il ne s'invente pas. La colonne naît vide pour TOUTES les
    // lignes existantes.
    expect(add).not.toContain('NOT NULL')
  })

  it('ne BACKFILL rien — une ligne déjà déclarée n’a pas d’auteur retrouvable, jamais un auteur deviné', async () => {
    const sql = await runUp()
    expect(sql.some(q => /^UPDATE\s+account_partners/i.test(q))).toBe(false)
  })

  it('down retire la colonne — additive, donc réversible sans perte d’un invariant', async () => {
    const sql = await runDown()
    const drop = sql.find(q => q.includes('DROP COLUMN IF EXISTS declared_by'))
    expect(drop).toBeDefined()
    expect(drop).toContain('ALTER TABLE account_partners')
  })

  it('on archive, on ne supprime pas — `up` ne DELETE et ne DROP aucune ligne ni table', async () => {
    const sql = await runUp()
    expect(sql.some(q => /^DELETE\s+FROM/i.test(q))).toBe(false)
    expect(sql.some(q => /DROP\s+TABLE/i.test(q))).toBe(false)
  })
})
