import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * UNE DÉPENSE NE SE RÉSERVE QU'UNE FOIS — la contrainte qui rend vraie une
 * promesse jusqu'ici écrite en commentaire.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT
 * ─────────────────────────────────────────────────────────────────────────────
 * `CreditReservationService.reserve()` se dit « idempotent par référence »
 * depuis sa première ligne, et son code est un `findOne` suivi d'un `save`.
 * Entre les deux, rien ne tient : deux appels simultanés — un rejeu de la file
 * BullMQ, un double clic, deux répliques Railway — lisent tous les deux une
 * table vide, et écrivent tous les deux. La table portait alors DEUX
 * réservations vivantes pour la MÊME dépense, et le solde annoncé retranchait
 * deux fois le même coût : un commercial avec huit crédits en poche se serait
 * vu refuser un run parce qu'on lui en gelait seize.
 *
 * Un index unique PARTIEL est la seule forme correcte ici. `UNIQUE (reference)`
 * tout court interdirait de réserver à nouveau après un solde — or une
 * référence rejouée après libération est un cas normal, pas une anomalie. La
 * contrainte ne porte donc que sur l'état `reserved` : au plus UNE promesse
 * vivante par (espace, référence), autant d'archives qu'on veut.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN DÉDOUBLONNAGE AVANT
 * ─────────────────────────────────────────────────────────────────────────────
 * La course décrite ci-dessus a pu se produire depuis que la table existe.
 * Créer l'index sur une table qui porte déjà un doublon échouerait — et une
 * migration qui échoue au démarrage arrête le déploiement entier. Les doublons
 * sont donc soldés d'abord, en gardant la PREMIÈRE ligne (celle qui a gagné la
 * course) et en libérant les suivantes.
 *
 * `released` et non `expired` : ces lignes n'ont pas atteint leur échéance,
 * elles n'auraient jamais dû exister. Et on les SOLDE plutôt que de les
 * supprimer — on archive, on ne supprime pas : la trace de la course reste
 * lisible dans la table.
 *
 * Additif : aucune colonne n'est ajoutée, aucune donnée n'est perdue.
 */
export class CreditReservationLiveReferenceUnique1790739000007 implements MigrationInterface {
  public name = 'CreditReservationLiveReferenceUnique1790739000007'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Garde la plus ANCIENNE des réservations vivantes d'une même référence.
    // `created_at` peut être identique à la microseconde près sur deux inserts
    // concurrents : `id` départage, pour que le choix soit déterministe et non
    // dépendant de l'ordre de balayage.
    await queryRunner.query(`
      UPDATE credit_reservations AS duplicate
      SET state = 'released', settled_at = now()
      WHERE duplicate.state = 'reserved'
        AND EXISTS (
          SELECT 1
          FROM credit_reservations AS winner
          WHERE winner.state = 'reserved'
            AND winner.workspace_id = duplicate.workspace_id
            AND winner.reference = duplicate.reference
            AND (winner.created_at, winner.id) < (duplicate.created_at, duplicate.id)
        )
    `)

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS credit_reservations_live_reference_idx
      ON credit_reservations (workspace_id, reference)
      WHERE state = 'reserved'
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Les lignes soldées par le dédoublonnage ne sont pas ressuscitées : elles
    // étaient le défaut, pas une donnée.
    await queryRunner.query(`DROP INDEX IF EXISTS credit_reservations_live_reference_idx`)
  }
}
