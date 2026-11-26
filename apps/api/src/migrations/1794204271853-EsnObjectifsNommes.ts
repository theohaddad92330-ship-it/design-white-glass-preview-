import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Les objectifs commerciaux NOMMÉS — #2052 (lot L19).
 *
 * UNE colonne ADDITIVE sur `esn_profiles`. Rien n'est retiré, rien n'est
 * renommé, aucune contrainte n'est resserrée (GA-11/GA-12) : le code qui
 * tourne pendant le déploiement ne voit aucune différence, et `monthly_target`
 * reste exactement où il était (#2052.1 — on archive, on ne supprime pas).
 *
 * `jsonb NOT NULL DEFAULT '[]'::jsonb`, comme `org_declared_people` et
 * `org_rejected_items` sur `accounts` : un tableau vide n'est pas un objectif
 * inventé, c'est l'absence de déclaration — jamais NULL, pour ne pas avoir à
 * distinguer « pas encore migré » de « déclaré vide » dans le code qui lit.
 */
export class EsnObjectifsNommes1794204271853 implements MigrationInterface {
  name = 'EsnObjectifsNommes1794204271853'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS esn_objectives jsonb NOT NULL DEFAULT '[]'::jsonb;
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE esn_profiles DROP COLUMN IF EXISTS esn_objectives;
    `)
  }
}
