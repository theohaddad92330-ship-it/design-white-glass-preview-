import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2542.3 — « non mesuré n'est jamais 0 » (GA-18/GA-19) appliqué à un CV lu
 * PARTIELLEMENT (#1954.16/.30 : une page sans calque texte au milieu d'un
 * dossier autrement numérique). `/cv/extract` calcule déjà ce signal et le
 * rend maintenant dans sa réponse HTTP (`apps/ia/app/routers/cv.py`) — cette
 * colonne est ce qui le fait SURVIVRE au-delà de la requête qui l'a mesuré,
 * jusqu'à l'écran de revue qui l'ouvre potentiellement des jours plus tard.
 *
 * Deux colonnes, même patron que `captured_at` / `cv_captured_at`
 * (`1795660000000-ConsultantDocumentCapturedAt.ts`) : `consultant_documents`
 * porte l'état du DOCUMENT déposé, `consultants` porte l'état du `cv_text`
 * ACTUEL de la fiche — c'est ce second champ que l'écran de revue (`propose`,
 * `cv-parse.service.ts`) lit sans avoir à rejoindre les documents.
 *
 * `boolean NOT NULL DEFAULT false` : tout document déjà en base a été lu par
 * le pipeline d'AVANT ce lot, qui ne connaissait pas la distinction — le
 * considérer comme lu en ENTIER (comportement d'hier, inchangé) est le seul
 * défaut honnête. Pas d'enum, pas de valeur à élargir avant écriture
 * (GA-11/GA-12 ne s'applique pas à un booléen).
 */
export class ConsultantDocumentExtractionPartial1795702850133 implements MigrationInterface {
  public name = 'ConsultantDocumentExtractionPartial1795702850133'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE consultant_documents ADD COLUMN IF NOT EXISTS extraction_partial boolean NOT NULL DEFAULT false`,
    )
    await queryRunner.query(
      `ALTER TABLE consultants ADD COLUMN IF NOT EXISTS cv_extraction_partial boolean NOT NULL DEFAULT false`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE consultants DROP COLUMN IF EXISTS cv_extraction_partial`)
    await queryRunner.query(`ALTER TABLE consultant_documents DROP COLUMN IF EXISTS extraction_partial`)
  }
}
