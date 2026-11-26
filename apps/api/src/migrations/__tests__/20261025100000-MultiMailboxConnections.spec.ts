import type { QueryRunner } from 'typeorm'
import { MultiMailboxConnections20261025100000 } from '../20261025100000-MultiMailboxConnections'

async function runMigration(direction: 'up' | 'down'): Promise<string[]> {
  const queries: string[] = []
  const runner = {
    query: jest.fn(async (sql: string) => {
      queries.push(sql.replace(/\s+/g, ' ').trim())
      return []
    }),
  } as unknown as QueryRunner
  const migration = new MultiMailboxConnections20261025100000()
  if (direction === 'up') {
    await migration.up(runner)
  } else {
    await migration.down(runner)
  }
  return queries
}

/**
 * #4546 — Plusieurs boîtes mail par commercial (Google et Outlook).
 *
 * Cette migration ÉLARGIT l'index unique `(user_id, provider)` en
 * `(user_id, provider, external_account_id)` pour permettre plusieurs
 * connexions par fournisseur.
 *
 * Elle ajoute aussi `scope_type` pour distinguer les connexions HÉRITÉES
 * (qui gardent leur comportement partagé) des NOUVELLES (personnelles).
 *
 * Doctrine :
 * - La contrainte SQL s'élargit AVANT le code qui écrit (GA-11 / GA-12).
 * - On archive, on ne supprime pas — aucune ligne perdue.
 * - Les connexions déjà posées gardent leur comportement.
 */
describe('MultiMailboxConnections20261025100000', () => {
  describe('up', () => {
    it('ajoute scope_type aux deux tables de connexion', async () => {
      const sql = (await runMigration('up')).join('\n')
      expect(sql).toContain('ADD COLUMN')
      expect(sql).toContain('scope_type')
      expect(sql).toContain('google_connections')
      expect(sql).toContain('microsoft_connections')
    })

    it("remplit external_account_id depuis l'id pour les connexions existantes sans identifiant", async () => {
      const sql = (await runMigration('up')).join('\n')
      expect(sql).toContain('UPDATE google_connections SET external_account_id')
      expect(sql).toContain('WHERE external_account_id IS NULL')
      expect(sql).toContain('UPDATE microsoft_connections SET external_account_id')
    })

    it("marque l'existant comme inherited_shared (décision antériorité du 25/10)", async () => {
      const sql = (await runMigration('up')).join('\n')
      expect(sql).toContain("scope_type = 'inherited_shared'")
    })

    it("retire l'ancien index unique (user_id, provider)", async () => {
      const sql = (await runMigration('up')).join('\n')
      expect(sql).toContain('DROP INDEX')
      expect(sql).toContain('google_connections_user_provider_uidx')
      expect(sql).toContain('microsoft_connections_user_provider_uidx')
    })

    it('crée le nouvel index unique (user_id, provider, external_account_id) — GA-12', async () => {
      const sql = (await runMigration('up')).join('\n')
      expect(sql).toContain('CREATE UNIQUE INDEX')
      expect(sql).toContain('user_id')
      expect(sql).toContain('provider')
      expect(sql).toContain('external_account_id')
    })

    it('ne supprime AUCUNE ligne — on archive, on ne supprime pas', async () => {
      const sql = (await runMigration('up')).join('\n')
      expect(sql).not.toMatch(/\bDELETE\b/i)
      expect(sql).not.toMatch(/\bTRUNCATE\b/i)
    })

    it('est idempotente (IF NOT EXISTS / IF EXISTS)', async () => {
      const sql = (await runMigration('up')).join('\n')
      expect(sql).toContain('IF NOT EXISTS')
      expect(sql).toContain('IF EXISTS')
    })
  })

  describe('down', () => {
    it('retire scope_type des deux tables', async () => {
      const sql = (await runMigration('down')).join('\n')
      expect(sql).toContain('DROP COLUMN')
      expect(sql).toContain('scope_type')
    })

    it("restaure l'ancien index unique (user_id, provider)", async () => {
      const sql = (await runMigration('down')).join('\n')
      expect(sql).toContain('CREATE UNIQUE INDEX')
      expect(sql).toContain('google_connections_user_provider_uidx')
      expect(sql).toContain('microsoft_connections_user_provider_uidx')
      expect(sql).toContain('user_id')
      expect(sql).toContain('provider')
    })

    it('retire le nouvel index multi-boîtes', async () => {
      const sql = (await runMigration('down')).join('\n')
      expect(sql).toContain('DROP INDEX')
      expect(sql).toContain('multi_mailbox_uidx')
    })
  })
})
