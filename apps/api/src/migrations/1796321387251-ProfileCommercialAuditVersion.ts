import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2908 (#2011.4) — `commercial_audit_version` : la version du dossier
 * d'audit commercial en EMPREINTE DE CONTENU (`commercialAuditVersionOf`,
 * packages/contracts), pas un compteur. `profiles.profile_context_version`
 * existait déjà mais bouge à chaque génération réussie, MÊME quand le
 * contenu produit est identique — la régénération ciblée par section
 * (#2010.16, #2011.10) a besoin de savoir si le CONTENU a changé.
 *
 * Additive et nullable : `NULL` tant qu'aucune génération n'a encore posé
 * d'empreinte, comportement d'avant inchangé.
 */
export class ProfileCommercialAuditVersion1796321387251 implements MigrationInterface {
  public name = 'ProfileCommercialAuditVersion1796321387251'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE profiles ADD COLUMN IF NOT EXISTS commercial_audit_version text;
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
