import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3914 — LE PONT MANQUANT ENTRE DÉCOUVRIR ET L'ANALYSE.
 *
 * « Ce que tu me remontes et l'analyse pure et dure, ça peut différer. »
 * (call bêta 08/10/2026) : un compte remonté par Découvrir SANS raison
 * mesurée persistée, puis analysé en profondeur, concluait « mettre en
 * veille » sans jamais dire SUR QUOI Découvrir l'avait fait remonter —
 * `origin` (migration `1789993128471`) nommait QUE le compte venait de
 * Découvrir, jamais SUR QUOI.
 *
 * `suggestion_reason` (la raison calculée côté Découvrir — angle, signal daté
 * ou facteurs de score, `discover-analyze.ts`) traversait déjà
 * `POST /analysis/start` sans qu'aucune colonne ne la reçoive : la seule
 * attribution honnête que l'écran de compte peut lire ensuite.
 *
 * NULLABLE, additive : un compte créé hors Découvrir, ou antérieur à ce lot,
 * n'a rien à nommer — jamais une raison devinée.
 */
export class AccountDiscoverOriginReason1796437712847 implements MigrationInterface {
  name = 'AccountDiscoverOriginReason1796437712847'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE accounts ADD COLUMN IF NOT EXISTS discover_origin_reason text
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE accounts DROP COLUMN IF EXISTS discover_origin_reason`)
  }
}
