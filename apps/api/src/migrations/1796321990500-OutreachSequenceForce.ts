import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2380.67 — LE FORÇAGE d'une collision de séquence (#1935.17).
 *
 * `outreach_sequences.forced_over_sequence_id` / `.force_justification` —
 * quand une séquence est créée alors qu'une autre était déjà ACTIVE sur le
 * même contact, le refus (`OutreachService.collisionRefusal`) se lève sur un
 * motif écrit non vide, mais ne le CONTOURNE pas : l'ancienne séquence passe
 * en pause, jamais deux cadences actives sur la même personne à la fois — la
 * raison même de ce refus.
 *
 * Auto-référencée (`outreach_sequences(id)`) : la séquence forcée et celle
 * qu'elle a mise en pause vivent dans la même table. `ON DELETE SET NULL` —
 * on archive, on ne supprime pas, mais si une ligne disparaissait un jour, la
 * trace de la nouvelle ne doit pas partir avec elle.
 *
 * NULLABLE sans backfill : `NULL` = créée sans collision, l'état honnête de
 * toutes les lignes existantes — jamais un forçage deviné rétroactivement.
 * Les deux colonnes vivent ou restent NULL ensemble (le service ne pose
 * jamais l'une sans l'autre), donc aucune contrainte croisée n'est nécessaire
 * ici : rien d'écrit avant elles ne les lira jamais séparément.
 *
 * GA-11/GA-12 : la colonne arrive AVANT le code qui l'écrit — service et
 * contrat suivent dans le même lot, jamais avant elle.
 */
export class OutreachSequenceForce1796321990500 implements MigrationInterface {
  public name = 'OutreachSequenceForce1796321990500'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE outreach_sequences
        ADD COLUMN IF NOT EXISTS forced_over_sequence_id uuid REFERENCES outreach_sequences(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS force_justification text
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE outreach_sequences
        DROP COLUMN IF EXISTS forced_over_sequence_id,
        DROP COLUMN IF EXISTS force_justification
    `)
  }
}
