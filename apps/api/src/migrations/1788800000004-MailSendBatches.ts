import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * La trace des lots d'envoi.
 *
 * Arbitrage Louis du 03/08 : un lot validé peut PARTIR, pas seulement atterrir
 * en brouillon. C'est la décision la plus risquée du chantier — un mauvais lot
 * part en entier — donc elle vient avec sa table.
 *
 * `batch_id` (choisi par le client) porte l'unicité. L'insertion précède les
 * envois : ré-approuver, recharger la page ou rejouer la requête retrouve le
 * lot déjà traité et ne renvoie rien. Même discipline que `routine_runs` —
 * rater un lot se répare, un lot parti deux fois ne se rattrape pas.
 *
 * Les compteurs sont là pour le support : quand quelqu'un demande « est-ce que
 * mes 30 relances sont parties ? », la réponse est une ligne, pas une fouille
 * dans les logs.
 */
export class MailSendBatches1788800000004 implements MigrationInterface {
  public name = 'MailSendBatches1788800000004'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS mail_send_batches (
        id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id    uuid NOT NULL,
        batch_id   uuid NOT NULL,
        mode       text NOT NULL,
        requested  int NOT NULL DEFAULT 0,
        sent       int NOT NULL DEFAULT 0,
        drafted    int NOT NULL DEFAULT 0,
        skipped    int NOT NULL DEFAULT 0,
        failed     int NOT NULL DEFAULT 0,
        aborted    boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT mail_send_batches_batch UNIQUE (batch_id),
        CONSTRAINT mail_send_batches_mode_check CHECK (mode IN ('draft', 'send'))
      )
    `)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS mail_send_batches_user_idx ON mail_send_batches (user_id)`)
    await queryRunner.query(`ALTER TABLE mail_send_batches ENABLE ROW LEVEL SECURITY`)
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE POLICY mail_send_batches_owner ON mail_send_batches
          USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS mail_send_batches`)
  }
}
