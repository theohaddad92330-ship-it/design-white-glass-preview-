import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2165.24 (filtre Groupe/filiale du rail Découvrir) / #2166.3 (rattachement
 * rendu sur la carte de résultat) / #2165.16 (preset « Filiales accessibles de
 * grands groupes ») — DÉCISION Louis 17/09 midi (QCM Découvrir) : lot
 * d'intégration, liens capitalistiques via le registre déjà branché par clé
 * (Pappers `/v2/entreprise/cartographie`, déjà appelé — sans coût
 * supplémentaire — par la recherche Phase 1), stockés sur le compte.
 *
 * Un fait DATÉ, jamais deviné : `group_role` seul ne suffit pas à dire si le
 * lien tient encore, `group_link_observed_at` porte la date à laquelle il a
 * été VU (un fait périmé redevient inconnu, il ne disparaît pas — doctrine
 * CLAUDE.md). `group_link_source` distingue une future seconde source d'un
 * champ corrigé à la main (`applyFieldUpdates`, ACCOUNT_FIELD_COLUMNS).
 *
 * Contrainte SQL AVANT le code qui écrit (GA-11/12) : seules deux valeurs sont
 * un rôle valide, jamais une troisième devinée.
 *
 * SAFE : quatre colonnes nullables, aucun backfill — les lignes existantes
 * restent NULL (« non renseigné ») jusqu'à leur prochaine analyse.
 */
export class AccountGroupAffiliation1795650000000 implements MigrationInterface {
  public name = 'AccountGroupAffiliation1795650000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE accounts
      ADD COLUMN IF NOT EXISTS group_head_siren text,
      ADD COLUMN IF NOT EXISTS group_role text,
      ADD COLUMN IF NOT EXISTS group_link_source text,
      ADD COLUMN IF NOT EXISTS group_link_observed_at timestamptz
    `)

    await queryRunner.query(`
      ALTER TABLE accounts
      ADD CONSTRAINT accounts_group_role_check
      CHECK (group_role IS NULL OR group_role IN ('groupe', 'filiale'))
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_group_role_check`)
    await queryRunner.query(`
      ALTER TABLE accounts
      DROP COLUMN IF EXISTS group_head_siren,
      DROP COLUMN IF EXISTS group_role,
      DROP COLUMN IF EXISTS group_link_source,
      DROP COLUMN IF EXISTS group_link_observed_at
    `)
  }
}
