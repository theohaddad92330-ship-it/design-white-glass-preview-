import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2424.6 — CE QUE la preuve montre, pas d'où elle vient (`source`, colonne
 * existante, `1793700241517-ProofEvidenceFields`).
 *
 * Huit valeurs nommées (`PROOF_CONTENT_TYPES`), tranchées sans Louis faute de
 * la liste exacte du document source (doctrine §3c, voir le commentaire de
 * `packages/contracts/src/schemas/proof.ts`) : `livrable`, `resultat_chiffre`,
 * `certification`, `methode`, `etude_de_cas`, `reference_technique`,
 * `reconnaissance`, `logo_client`.
 *
 * `null` = pas encore classée — tout l'historique écrit avant cette colonne,
 * et toute preuve dont personne n'a pris le temps de trancher. Jamais un type
 * deviné depuis le texte libre de `claim`.
 *
 * Additive uniquement (GA-11 / GA-12) : `proofs_content_type_check` naît AVEC
 * sa colonne, donc aucune ligne existante ne peut la violer.
 */
export class ProofContentType1796000123457 implements MigrationInterface {
  name = 'ProofContentType1796000123457'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE proofs ADD COLUMN IF NOT EXISTS content_type text`)
    await queryRunner.query(
      `ALTER TABLE proofs DROP CONSTRAINT IF EXISTS proofs_content_type_check,
       ADD CONSTRAINT proofs_content_type_check CHECK (content_type IS NULL OR content_type IN (
         'livrable', 'resultat_chiffre', 'certification', 'methode', 'etude_de_cas',
         'reference_technique', 'reconnaissance', 'logo_client'
       ))`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE proofs DROP CONSTRAINT IF EXISTS proofs_content_type_check`)
    await queryRunner.query(`ALTER TABLE proofs DROP COLUMN IF EXISTS content_type`)
  }
}
