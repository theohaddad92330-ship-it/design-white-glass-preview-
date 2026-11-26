import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * LE CANAL SMS DES ALERTES URGENTES — #1938.4, décision Louis 13/09 batch 13.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LA TABLE PORTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Une ligne par personne (PK `user_id`, comme `user_daily_brief`) : le numéro de
 * mobile qu'elle a saisi, la preuve qu'elle le tient (`phone_verified_at`), la
 * date de son dernier geste de consentement, un opt-in par type d'alerte urgente
 * — jamais coché par défaut — et le code de vérification en attente, dont on ne
 * garde que l'EMPREINTE.
 *
 * Une table à part plutôt que des colonnes de `notification_preferences` : ces
 * préférences sont lues par toute l'application (la barre latérale monte leur
 * requête sur chaque écran, le catalogue de réglages de Laura les décrit au
 * modèle). Un numéro de téléphone n'a rien à faire sur ces chemins-là — il se
 * lit sur `/settings/notifications`, par son propriétaire, et nulle part
 * ailleurs.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LA BASE TIENT ELLE-MÊME
 * ─────────────────────────────────────────────────────────────────────────────
 *  - un numéro au format E.164 (`+` puis 8 à 15 chiffres) ;
 *  - aucun type coché sans numéro vérifié — la règle du service, doublée ici
 *    pour qu'aucun chemin d'écriture futur ne puisse la contourner ;
 *  - un compteur d'essais jamais négatif.
 * Les contraintes sont NOMMÉES (GA-177) et n'énumèrent aucune valeur : GA-12 n'a
 * pas d'énumération TypeScript à leur associer.
 *
 * RLS `auth.uid() = user_id` en défense en profondeur, même patron que
 * `1790300000003-UserFavorites` : l'API tourne avec un rôle qui la contourne,
 * mais un numéro de téléphone ne doit être lisible par personne d'autre que son
 * propriétaire, même depuis un client Supabase mal configuré.
 *
 * Additive, idempotente, et AVANT le code qui écrit (GA-11/12).
 */
export class NotificationSmsChannel1792800210000 implements MigrationInterface {
  public name = 'NotificationSmsChannel1792800210000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS notification_sms_channels (
        user_id uuid PRIMARY KEY,
        phone_e164 text NOT NULL,
        phone_verified_at timestamptz NULL,
        consent_at timestamptz NULL,
        sms_buy_signal boolean NOT NULL DEFAULT false,
        sms_credit_low boolean NOT NULL DEFAULT false,
        sms_action_overdue boolean NOT NULL DEFAULT false,
        verification_code_hash text NULL,
        verification_expires_at timestamptz NULL,
        verification_sent_at timestamptz NULL,
        verification_attempts integer NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT notification_sms_channels_phone_e164_check CHECK (phone_e164 ~ '^[+][1-9][0-9]{7,14}$'),
        CONSTRAINT notification_sms_channels_opt_in_verified_check CHECK (phone_verified_at IS NOT NULL OR NOT (sms_buy_signal OR sms_credit_low OR sms_action_overdue)),
        CONSTRAINT notification_sms_channels_attempts_check CHECK (verification_attempts >= 0)
      )
    `)

    await queryRunner.query(`ALTER TABLE notification_sms_channels ENABLE ROW LEVEL SECURITY`)
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE tablename = 'notification_sms_channels'
            AND policyname = 'Users can manage their own SMS channel'
        ) THEN
          CREATE POLICY "Users can manage their own SMS channel"
            ON notification_sms_channels
            FOR ALL
            USING (auth.uid() = user_id)
            WITH CHECK (auth.uid() = user_id);
        END IF;
      END $$;
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
