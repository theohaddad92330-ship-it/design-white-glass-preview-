import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2124.49 à .55 — les champs de preuve (décision de Louis du 14/09/2026).
 *
 * « Laura les propose, l'humain valide. » Sept points du registre demandaient
 * qu'une preuve AFFICHE le problème traité, le résultat obtenu, l'expertise
 * mobilisée, l'autorisation de citation, sa source, sa date et sa version. Six
 * n'existaient nulle part ; la date était en base (`created_at`) sans être
 * jamais rendue.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * D'OÙ VIENT CETTE DONNÉE ?
 * ─────────────────────────────────────────────────────────────────────────────
 * D'une PROPOSITION que l'humain valide — pas d'une saisie sèche (personne ne
 * remplit cinq champs de plus après une mission), pas d'un import ATS (l'ATS ne
 * sait pas ce qu'on a prouvé). Le producteur est PUR et en lecture seule
 * (`proposeProofFields`, contrats) ; l'écriture part d'un clic, et de lui seul.
 *
 * `citation_allowed` est NULLABLE à trois valeurs, et c'est délibéré : `null` =
 * personne n'a tranché. Un booléen à deux valeurs aurait fait dire « citation
 * refusée » à une absence de décision, ou pire l'inverse.
 *
 * Additive uniquement — porte « ajout seulement » (GA-11 / GA-12) : des colonnes
 * neuves, aucun renommage, aucune contrainte resserrée sur une colonne
 * existante. `proofs_source_check` naît AVEC sa colonne, donc aucune ligne
 * existante ne peut la violer, et il couvre exactement `PROOF_SOURCES`.
 */
export class ProofEvidenceFields1793700241517 implements MigrationInterface {
  name = 'ProofEvidenceFields1793700241517'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE proofs ADD COLUMN IF NOT EXISTS problem text`)
    await queryRunner.query(`ALTER TABLE proofs ADD COLUMN IF NOT EXISTS result text`)
    await queryRunner.query(`ALTER TABLE proofs ADD COLUMN IF NOT EXISTS expertise text[] NOT NULL DEFAULT '{}'`)
    await queryRunner.query(`ALTER TABLE proofs ADD COLUMN IF NOT EXISTS citation_allowed boolean`)
    await queryRunner.query(`ALTER TABLE proofs ADD COLUMN IF NOT EXISTS source text`)
    await queryRunner.query(`ALTER TABLE proofs ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1`)
    await queryRunner.query(
      `ALTER TABLE proofs ADD COLUMN IF NOT EXISTS field_provenance jsonb NOT NULL DEFAULT '{}'::jsonb`,
    )
    await queryRunner.query(`ALTER TABLE proofs ADD COLUMN IF NOT EXISTS validated_by uuid`)
    await queryRunner.query(
      `ALTER TABLE proofs DROP CONSTRAINT IF EXISTS proofs_source_check,
       ADD CONSTRAINT proofs_source_check CHECK (source IS NULL OR source IN ('mission','need','rex','testimonial','manual'))`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE proofs DROP CONSTRAINT IF EXISTS proofs_source_check`)
    await queryRunner.query(`ALTER TABLE proofs DROP COLUMN IF EXISTS validated_by`)
    await queryRunner.query(`ALTER TABLE proofs DROP COLUMN IF EXISTS field_provenance`)
    await queryRunner.query(`ALTER TABLE proofs DROP COLUMN IF EXISTS version`)
    await queryRunner.query(`ALTER TABLE proofs DROP COLUMN IF EXISTS source`)
    await queryRunner.query(`ALTER TABLE proofs DROP COLUMN IF EXISTS citation_allowed`)
    await queryRunner.query(`ALTER TABLE proofs DROP COLUMN IF EXISTS expertise`)
    await queryRunner.query(`ALTER TABLE proofs DROP COLUMN IF EXISTS result`)
    await queryRunner.query(`ALTER TABLE proofs DROP COLUMN IF EXISTS problem`)
  }
}
