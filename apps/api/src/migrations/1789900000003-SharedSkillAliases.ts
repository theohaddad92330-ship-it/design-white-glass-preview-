import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * La bibliothèque d'alias PARTAGÉE entre espaces (PDF 3, D18 — réouverte par
 * Louis le 21/08).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI EST PARTAGÉ, ET CE QUI NE L'EST JAMAIS
 * ─────────────────────────────────────────────────────────────────────────────
 * Un couple de TERMES techniques : « ReactJS » → « react ». Rien d'autre. Ni
 * l'espace d'origine, ni un profil, ni un client. Un alias de compétence n'est
 * pas une donnée d'entreprise, c'est du vocabulaire de métier — et c'est
 * précisément ce qui rend le partage tenable.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ET SURTOUT : UN ALIAS PARTAGÉ N'EST JAMAIS APPLIQUÉ D'OFFICE
 * ─────────────────────────────────────────────────────────────────────────────
 * Il arrive chez les autres espaces comme une PROPOSITION, avec le nombre
 * d'espaces qui l'ont déjà validé. Le vocabulaire d'une ESN cyber n'est pas
 * celui d'une ESN data : « ELK » veut dire autre chose chez l'une et chez
 * l'autre, et imposer un rapprochement ferait remonter des profils sur un mot
 * qu'ils n'ont jamais écrit — exactement ce que la règle des alias approuvés
 * existe pour empêcher.
 *
 * `workspaces_approved` n'est donc pas une statistique : c'est l'argument qu'on
 * montre à celui qui décide.
 */
export class SharedSkillAliases1789900000003 implements MigrationInterface {
  name = 'SharedSkillAliases1789900000003'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS skill_alias_library (
        raw_term text PRIMARY KEY,
        canonical_term text NOT NULL,
        workspaces_approved integer NOT NULL DEFAULT 1,
        first_seen_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_skill_alias_library_popular
         ON skill_alias_library (workspaces_approved DESC)`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS skill_alias_library`)
  }
}
