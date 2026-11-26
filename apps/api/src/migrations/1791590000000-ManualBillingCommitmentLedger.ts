import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * L'ENGAGEMENT SORT DES NOTES, ET LES FACTURES DEVIENNENT DES LIGNES (02/09/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT
 * ─────────────────────────────────────────────────────────────────────────
 * Un client vendu « 3 mois d'engagement, 119 € par mois » était enregistré
 * ainsi : une ligne de conditions portant UNE référence de facture, UN statut
 * de paiement, et une PHRASE dans `notes` — « engagement 3 mois, à suspendre à
 * la main fin novembre ». Le commentaire de l'entité l'assumait : « descriptive
 * et jamais lue par une garde ».
 *
 * Conséquence : rien ne pouvait dire que l'engagement était échu, ni qu'aucune
 * facture n'avait été émise depuis deux cycles. Une phrase ne se relit pas
 * toute seule, et un client parfaitement à jour ressemble EXACTEMENT, en base,
 * à un client qu'on a oublié de facturer depuis trois mois : c'est la même
 * ligne, inchangée.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE LA MIGRATION FAIT
 * ─────────────────────────────────────────────────────────────────────────
 *  1. `commitment_months` sur les conditions — la durée devient un NOMBRE.
 *     `NULL` veut dire « aucun engagement enregistré », jamais `0` : le CHECK
 *     refuse `0` pour que personne ne puisse écrire « un contrat qui se termine
 *     le jour où il commence » et le lire ensuite comme « pas d'engagement ».
 *     La date de FIN n'est pas stockée — elle se dérive en UN endroit
 *     (`commitmentEndOf`) ; deux colonnes à tenir cohérentes finissent par
 *     diverger.
 *  2. `billed_to_name` / `billed_to_kind` / `billing_email` / `billing_phone` —
 *     le destinataire réel de la facture. Un bêta-testeur facturé à titre
 *     PARTICULIER pendant qu'il travaille dans une ESN est un cas courant, et
 *     c'était une phrase dans `notes`.
 *  3. `manual_billing_invoices` — une ligne PAR facture émise, avec la période
 *     qu'elle couvre. C'est ce qui rend la question « et octobre ? »
 *     répondable.
 *  4. La reprise des lignes existantes, puis le retrait de
 *     `payment_status` des conditions : le paiement appartient désormais à la
 *     FACTURE. Deux endroits qui portent le même fait finissent par se
 *     contredire, et c'est celui du bas qui a raison.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE N'INVENTE PAS
 * ─────────────────────────────────────────────────────────────────────────
 *  · `issued_on` reste `NULL` sur les lignes reprises : la date d'émission
 *    n'a jamais été saisie. La déduire de `start_date` serait un fait faux
 *    écrit avec l'autorité d'une colonne.
 *  · `paid_on` reste `NULL` même quand `payment_status = 'paid'` : on sait que
 *    c'est encaissé, on ne sait pas QUAND. La dérivation lit le statut.
 *  · Une ligne de conditions SANS référence ne produit aucune facture. Sa
 *    première période apparaîtra donc « facture manquante » — ce qui est vrai :
 *    aucune facture n'est enregistrée.
 *  · `commitment_months` n'est backfillé nulle part. Les durées vendues vivent
 *    dans des phrases hétérogènes ; les relire au motif qu'on est passé par là
 *    produirait des engagements devinés. L'écran les affiche « non renseigné »
 *    tant qu'un humain n'a pas tranché.
 *
 * ⚠️ Aucune garde ne SUSPEND quoi que ce soit à l'échéance. Le produit n'a
 * jamais eu de porte de fin de contrat et cette migration n'en pose pas : elle
 * rend l'échéance VISIBLE, la décision reste humaine.
 */
export class ManualBillingCommitmentLedger1791590000000 implements MigrationInterface {
  name = 'ManualBillingCommitmentLedger1791590000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE manual_billing_terms
        ADD COLUMN IF NOT EXISTS commitment_months integer,
        ADD COLUMN IF NOT EXISTS billed_to_name text,
        ADD COLUMN IF NOT EXISTS billed_to_kind text,
        ADD COLUMN IF NOT EXISTS billing_email text,
        ADD COLUMN IF NOT EXISTS billing_phone text
    `)

    // Un engagement se compte en mois ENTIERS et POSITIFS. Le plafond (120) est
    // là pour qu'une faute de frappe ne crée pas un contrat de mille ans dont
    // l'échéance ne se déclencherait jamais.
    await queryRunner.query(`
      ALTER TABLE manual_billing_terms
        DROP CONSTRAINT IF EXISTS manual_billing_terms_commitment_months_check
    `)
    await queryRunner.query(`
      ALTER TABLE manual_billing_terms
        ADD CONSTRAINT manual_billing_terms_commitment_months_check
        CHECK (commitment_months IS NULL OR (commitment_months >= 1 AND commitment_months <= 120))
    `)

    await queryRunner.query(`
      ALTER TABLE manual_billing_terms
        DROP CONSTRAINT IF EXISTS manual_billing_terms_billed_to_kind_check
    `)
    await queryRunner.query(`
      ALTER TABLE manual_billing_terms
        ADD CONSTRAINT manual_billing_terms_billed_to_kind_check
        CHECK (billed_to_kind IS NULL OR billed_to_kind IN ('person', 'company'))
    `)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS manual_billing_invoices (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        reference text NOT NULL,
        amount_cents integer NOT NULL DEFAULT 0,
        currency text NOT NULL DEFAULT 'EUR',
        period_start date NOT NULL,
        period_end date NOT NULL,
        issued_on date,
        payment_status text NOT NULL DEFAULT 'unpaid',
        paid_on date,
        notes text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT manual_billing_invoices_payment_status_check
          CHECK (payment_status IN ('unpaid', 'paid')),
        CONSTRAINT manual_billing_invoices_period_order_check
          CHECK (period_end >= period_start)
      )
    `)

    // La même facture enregistrée deux fois ferait paraître une période
    // couverte deux fois — et masquerait celle qui manque à côté.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS manual_billing_invoices_workspace_reference_idx
        ON manual_billing_invoices (workspace_id, lower(reference))
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS manual_billing_invoices_workspace_period_idx
        ON manual_billing_invoices (workspace_id, period_start)
    `)

    /*
     * La reprise. Une facture par ligne de conditions PORTANT une référence.
     *
     * La période couverte se déduit de la périodicité vendue — c'est la seule
     * déduction de cette migration, et elle est sûre : la première période d'un
     * contrat commence le jour du contrat, par définition. `one_off` couvre un
     * seul jour, faute de durée connue.
     */
    await queryRunner.query(`
      INSERT INTO manual_billing_invoices
        (workspace_id, reference, amount_cents, currency, period_start, period_end, payment_status, notes)
      SELECT
        t.workspace_id,
        btrim(t.reference),
        t.amount_cents,
        t.currency,
        t.start_date,
        CASE t.period
          WHEN 'monthly'   THEN (t.start_date + interval '1 month'  - interval '1 day')::date
          WHEN 'quarterly' THEN (t.start_date + interval '3 months' - interval '1 day')::date
          WHEN 'yearly'    THEN (t.start_date + interval '1 year'   - interval '1 day')::date
          ELSE t.start_date
        END,
        t.payment_status,
        'Reprise du 02/09/2026 : la ligne de conditions ne portait qu''une référence. La période couverte est déduite de la périodicité ; la date d''émission n''a jamais été saisie.'
      FROM manual_billing_terms t
      WHERE t.reference IS NOT NULL AND btrim(t.reference) <> ''
      ON CONFLICT DO NOTHING
    `)

    // Le paiement vit désormais sur la FACTURE. La contrainte part avec la
    // colonne — sans quoi elle resterait à garder une colonne disparue.
    await queryRunner.query(`
      ALTER TABLE manual_billing_terms
        DROP CONSTRAINT IF EXISTS manual_billing_terms_payment_status_check
    `)
    await queryRunner.query(`
      ALTER TABLE manual_billing_terms
        DROP COLUMN IF EXISTS payment_status
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Le statut de paiement revient sur les conditions, reconstruit depuis la
    // facture la plus RÉCENTE de l'espace — la seule reconstruction fidèle :
    // c'est celle que l'ancien modèle affichait.
    await queryRunner.query(`
      ALTER TABLE manual_billing_terms
        ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid'
    `)
    await queryRunner.query(`
      UPDATE manual_billing_terms t
         SET payment_status = latest.payment_status
        FROM (
          SELECT DISTINCT ON (workspace_id) workspace_id, payment_status
            FROM manual_billing_invoices
           ORDER BY workspace_id, period_start DESC
        ) latest
       WHERE latest.workspace_id = t.workspace_id
    `)
    await queryRunner.query(`
      ALTER TABLE manual_billing_terms
        ADD CONSTRAINT manual_billing_terms_payment_status_check
        CHECK (payment_status IN ('unpaid', 'paid'))
    `)

    await queryRunner.query(`DROP TABLE IF EXISTS manual_billing_invoices`)

    await queryRunner.query(`
      ALTER TABLE manual_billing_terms
        DROP CONSTRAINT IF EXISTS manual_billing_terms_billed_to_kind_check,
        DROP CONSTRAINT IF EXISTS manual_billing_terms_commitment_months_check
    `)
    await queryRunner.query(`
      ALTER TABLE manual_billing_terms
        DROP COLUMN IF EXISTS commitment_months,
        DROP COLUMN IF EXISTS billed_to_name,
        DROP COLUMN IF EXISTS billed_to_kind,
        DROP COLUMN IF EXISTS billing_email,
        DROP COLUMN IF EXISTS billing_phone
    `)
  }
}
