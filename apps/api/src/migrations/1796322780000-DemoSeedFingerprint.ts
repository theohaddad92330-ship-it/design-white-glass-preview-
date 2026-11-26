import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * L'EMPREINTE DU SEMIS DE DÉMO (#3135 en PROD 27/09/2026, GA-372).
 *
 * `demo-seed.service.ts` est idempotent sur la seule PRÉSENCE d'un compte, et
 * une salle COMPLÈTE n'est jamais purgée sous les yeux de son visiteur — deux
 * garanties nécessaires, mais qui laissent un trou : une salle semée AVANT un
 * déploiement qui change le jeu de données ou la logique de semis reste
 * complète, donc jamais réparée, et son bail se renouvelle indéfiniment. Le
 * 27/09/2026, l'API portait déjà #3135 (commit 8cb4ed5e) mais une salle
 * ouverte après coup ne montrait aucune de ses nouveautés.
 *
 * Une colonne, NULLABLE et sans défaut : NULL décrit exactement les salles
 * existantes (semées avant ce correctif), qui sont donc lues comme PÉRIMÉES
 * dès le prochain bail — comportement voulu, voir `demo-reset.service.ts`.
 * Additive et sans effet hors démo : NULL sur tout workspace réel.
 */
export class DemoSeedFingerprint1796322780000 implements MigrationInterface {
  public name = 'DemoSeedFingerprint1796322780000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS demo_seed_fingerprint text`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE workspaces DROP COLUMN IF EXISTS demo_seed_fingerprint`)
  }
}
