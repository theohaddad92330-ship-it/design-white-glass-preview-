import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Les alias de compétences par espace (PDF 3 §5.3, ticket BEL-ATS-204).
 *
 * « React.js », « ReactJS » et « React 18 » sont trois compétences distinctes
 * pour le matching, et un besoin React ne trouve pas le profil qui a écrit
 * « ReactJS ». C'est un faux négatif SILENCIEUX — le pire défaut possible pour
 * un vivier, parce que personne ne peut le voir.
 *
 * Le référentiel d'alias vit en CODE (37 entrées) et couvre le vocabulaire
 * courant. Ce que cette table ajoute, c'est ce que le code ne peut pas savoir :
 * le vocabulaire PROPRE à une ESN, appris de ses corrections.
 *
 * Deux règles portées par le schéma :
 *
 *  - une correction crée une **PROPOSITION**, pas un alias. Un alias appliqué
 *    seul rapprocherait deux compétences que personne n'a validées, et le
 *    matching remonterait des profils sur un mot qu'ils n'ont jamais écrit ;
 *  - un terme INCONNU du référentiel est enregistré tel quel, sans cible. C'est
 *    la file d'enrichissement du §5.3 : aujourd'hui `canonicalSkill()` rend
 *    `null` en silence, et personne ne sait jamais quels mots le produit ne
 *    comprend pas.
 */
export class SkillAliases1789576428391 implements MigrationInterface {
  public name = 'SkillAliases1789576428391'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS skill_alias_proposals (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        -- Le terme tel qu'il a été écrit, en minuscules pour la comparaison.
        raw_term text NOT NULL,
        -- Le terme canonique visé. NULL = terme inconnu, à trancher par un
        -- humain : c'est la file d'enrichissement du catalogue.
        canonical_term text,
        status text NOT NULL DEFAULT 'pending',
        -- Combien de fois le terme a été rencontré : un mot vu quinze fois
        -- mérite d'être tranché avant un mot vu une fois.
        occurrences integer NOT NULL DEFAULT 1,
        proposed_by uuid,
        decided_by uuid,
        decided_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT skill_alias_status_check CHECK (status IN ('pending', 'approved', 'rejected'))
      )
    `)
    // Un terme ne se propose qu'une fois par espace : la deuxième rencontre
    // incrémente le compteur au lieu d'empiler des doublons dans la file.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS skill_alias_proposals_unique_idx
        ON skill_alias_proposals (workspace_id, raw_term)
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS skill_alias_proposals_pending_idx
        ON skill_alias_proposals (workspace_id, occurrences DESC) WHERE status = 'pending'
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS skill_alias_proposals_pending_idx`)
    await queryRunner.query(`DROP INDEX IF EXISTS skill_alias_proposals_unique_idx`)
    await queryRunner.query(`DROP TABLE IF EXISTS skill_alias_proposals`)
  }
}
