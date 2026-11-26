import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #5029.1 — LE CONSULTANT QU'UNE SÉQUENCE PROPOSE (Reverse Market, playbook F
 * `bench_consultant`).
 *
 * `outreach_sequences.consultant_id` — une séquence reste MONO-contact (c74) :
 * elle vise une personne d'un compte ; cette colonne dit QUEL profil en
 * intercontrat elle propose. Elle sert à deux choses : le Reverse Market
 * affiche « déjà proposé à ce compte » (on ne repousse pas le même profil), et
 * une séquence qui la porte reste TOUJOURS manuelle, même sous mandat d'envoi
 * signé (#5029.2 — le dispatcher la relit à chaque envoi).
 *
 * ADDITIVE, NULLABLE, sans backfill : `NULL` = une séquence ordinaire, l'état
 * honnête de toutes les lignes existantes — jamais un rattachement deviné.
 * `ON DELETE SET NULL` : on archive, on ne supprime pas ; si une fiche
 * consultant disparaissait (effacement RGPD c67), la séquence et son journal
 * restent, sans le lien.
 *
 * Index PARTIEL : seules les séquences qui proposent un profil sont lues par
 * consultant (`GET /outreach/sequences?consultant_id=`), dans leur espace.
 *
 * Aucune politique RLS neuve : la table garde les siennes, la colonne n'ouvre
 * aucune ligne de plus.
 *
 * GA-11/GA-12 : la colonne arrive AVANT le code qui l'écrit (même lot).
 */
export class OutreachSequenceConsultant1796610000300 implements MigrationInterface {
  public name = 'OutreachSequenceConsultant1796610000300'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE outreach_sequences
        ADD COLUMN IF NOT EXISTS consultant_id uuid REFERENCES consultants(id) ON DELETE SET NULL
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_outreach_sequences_consultant
        ON outreach_sequences (workspace_id, consultant_id)
        WHERE consultant_id IS NOT NULL
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_outreach_sequences_consultant`)
    await queryRunner.query(`ALTER TABLE outreach_sequences DROP COLUMN IF EXISTS consultant_id`)
  }
}
