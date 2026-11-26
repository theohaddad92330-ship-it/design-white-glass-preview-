import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `outbound_write_requests.state` accepte `superseded` — une demande REMPLACÉE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN ÉTAT DE PLUS, ET PAS `rejected`
 * ─────────────────────────────────────────────────────────────────────────────
 * Le retour #1498 demande un bouton « Modifier » sur une demande d'écriture en
 * attente. La règle qui rend cette file sûre l'interdit tel quel : *la
 * prévisualisation est FIGÉE, on approuve exactement ce qu'on a lu*. Modifier
 * en place ferait approuver autre chose que ce qui a été gelé.
 *
 * Louis a tranché le 05/09 : modifier crée une NOUVELLE demande figée, qui
 * remplace l'ancienne. L'ancienne n'est donc ni approuvée ni refusée — elle est
 * remplacée, et l'écrire `rejected` dirait que quelqu'un a dit non. Sur une file
 * qu'on relit pour comprendre qui a autorisé quoi, c'est un mensonge à peu de
 * frais.
 *
 * ⚠️ La contrainte SQL s'élargit AVANT le code qui écrit la valeur (GA-11/GA-12).
 * Et l'énumération ne perd aucune valeur et n'en insère aucune au milieu (GA-08).
 */
export class OutboundWriteSuperseded1791620000000 implements MigrationInterface {
  public name = 'OutboundWriteSuperseded1791620000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE outbound_write_requests
        DROP CONSTRAINT IF EXISTS outbound_write_requests_state_check
    `)
    await queryRunner.query(`
      ALTER TABLE outbound_write_requests
        ADD CONSTRAINT outbound_write_requests_state_check
        CHECK (state IN ('pending', 'approved', 'rejected', 'expired', 'failed', 'written', 'superseded'))
    `)
  }

  /**
   * ⚠️ Le retour arrière REFUSE les demandes remplacées.
   *
   * Il ne peut pas faire mieux : rétrécir la contrainte sur une colonne qui
   * porte `superseded` échoue. `rejected` est le moins faux des états restants —
   * une demande remplacée n'a effectivement pas été exécutée. Le `down` est là
   * pour être exécutable, pas pour être exécuté.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE outbound_write_requests SET state = 'rejected' WHERE state = 'superseded'`)
    await queryRunner.query(`
      ALTER TABLE outbound_write_requests
        DROP CONSTRAINT IF EXISTS outbound_write_requests_state_check
    `)
    await queryRunner.query(`
      ALTER TABLE outbound_write_requests
        ADD CONSTRAINT outbound_write_requests_state_check
        CHECK (state IN ('pending', 'approved', 'rejected', 'expired', 'failed', 'written'))
    `)
  }
}
