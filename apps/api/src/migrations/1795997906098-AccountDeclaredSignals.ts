import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2634.1 — LinkedIn comme source de signaux d'achat, par une voie autorisée
 * (saisie manuelle, import d'un export déjà possédé par le client, ou un
 * connecteur officiel à venir) — jamais un scraping (agent_docs/doctrine.md,
 * `c79_collecte_large_mais_propre`).
 *
 * `accounts.declared_signals` est un JSONB SÉPARÉ de `accounts.recent_signals`,
 * que l'IA réécrit intégralement à chaque analyse (voir
 * `signal-history.service.ts`). Un signal déclaré par un humain doit SURVIVRE
 * à chaque ré-analyse : il vit donc dans SA PROPRE colonne, jamais fusionné
 * dans celle de l'IA, et il est greffé sur `raw_analysis.recent_signals` à la
 * LECTURE (`AccountsService.findOneForWorkspace`) — exactement le même
 * principe que `org_declared_people` (#1103) pour l'organigramme.
 *
 * GA-11/GA-12 : cette migration élargit la table AVANT le code qui l'écrit
 * (`AccountsService.declareSignals`, lot suivant du même chantier).
 */
export class AccountDeclaredSignals1795997906098 implements MigrationInterface {
  public name = 'AccountDeclaredSignals1795997906098'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE accounts
      ADD COLUMN IF NOT EXISTS declared_signals jsonb NOT NULL DEFAULT '[]'::jsonb
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE accounts DROP COLUMN IF EXISTS declared_signals
    `)
  }
}
