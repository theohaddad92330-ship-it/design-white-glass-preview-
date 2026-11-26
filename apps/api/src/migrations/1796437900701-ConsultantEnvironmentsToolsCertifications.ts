import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3935.2a (lot M07, 09/10) — ENVIRONNEMENTS, OUTILS, CERTIFICATIONS d'un consultant.
 *
 * Le modèle LIT ces trois blocs du CV depuis l'origine (`CV_DETECTIONS`), et rien ne
 * les écrivait : aucune colonne ne les portait (mesure du lot Z02, #3935.1). Trois
 * listes de texte, comme `education` (#2784) — leur provenance par champ vit dans
 * `field_provenance` (`entity_type = 'consultant'`, `field` = le nom de colonne), la
 * même que toutes les autres colonnes de la fiche, sans contrainte sur `field` à élargir.
 *
 * ⚠️ NULLABLE, sans défaut, jamais backfillé : `NULL` = NON LU (aucune lecture de CV
 * ne l'a encore produit), distinct d'une liste écrite. Une lecture qui ne trouve rien
 * n'écrit pas `{}` — l'absence dans un CV ne prouve pas l'absence chez la personne.
 */
export class ConsultantEnvironmentsToolsCertifications1796437900701 implements MigrationInterface {
  public name = 'ConsultantEnvironmentsToolsCertifications1796437900701'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE consultants
        ADD COLUMN IF NOT EXISTS environments text[],
        ADD COLUMN IF NOT EXISTS tools text[],
        ADD COLUMN IF NOT EXISTS certifications text[]
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
