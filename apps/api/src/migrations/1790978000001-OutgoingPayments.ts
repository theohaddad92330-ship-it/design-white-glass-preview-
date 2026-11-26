import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `outgoing_payments` — l'argent qui SORT vers le consultant (31/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE MANQUE MESURÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * `consultant_payment` / `supplier_payment` / `freelance_payment` : ZÉRO
 * occurrence dans `apps/api/src` et `packages/contracts/src` avant ce lot. Le
 * dépôt savait tout de l'argent qui RENTRE du client (`invoice_readiness`,
 * l'écran `/missions/encaissements`) et rien de ce qu'on DOIT à la personne qui
 * a fait le travail. Les deux moitiés ne partagent aucune colonne, et c'est
 * pour ça qu'elles ne partagent pas une table.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * AUCUN IBAN, AUCUN ORDRE DE VIREMENT — ET CE N'EST PAS UN OUBLI
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ Cette table n'a AUCUNE colonne bancaire, et elle n'en aura pas. Le refus
 * est déjà écrit trois fois dans le dépôt, dans ces mots — « Bellum ne signe
 * rien, ne paie rien et ne stocke aucun IBAN » (`admin-docs.ts`, la migration
 * `1788900000005-AdminDocsConnections`, le catalogue d'outils du copilote). Ce
 * lot livre le SUIVI du paiement, jamais son déclenchement : `paid_on` est ce
 * qu'un humain CONSTATE, exactement comme `invoice_readiness.paid_at` côté
 * client, et jamais ce qu'un système a fait partir.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA MAILLE — mission × consultant × mois, celle du RELEVÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * C'est exactement la maille de `mission_timesheets` (une ligne par mission ET
 * par consultant), et c'est voulu : le relevé VALIDÉ est ce qui autorise le
 * paiement, et une maille différente aurait rendu la jointure impossible — le
 * défaut que `CollectionsPage.tsx` nomme encore aujourd'hui (« la validation du
 * relevé n'est jamais jointe à la ligne de facturation »).
 *
 * ⚠️ `consultant_id` est NULLABLE (une mission peut n'avoir aucune affectation
 * lisible sur un mois), et `NULL` est DISTINCT de `NULL` pour un index unique
 * PostgreSQL : l'unicité passe donc par `COALESCE(consultant_id, uuid nul)`,
 * jamais par un `UNIQUE (mission_id, consultant_id, period_month)` qui aurait
 * laissé passer autant de doublons qu'on voulait sur les lignes sans
 * consultant.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LES CONTRAINTES TIENNENT — et pourquoi le code ne suffit pas
 * ─────────────────────────────────────────────────────────────────────────────
 *  - `status` couvre `OUTGOING_PAYMENT_STATUSES` (@bellum/contracts), dans
 *    l'ordre du cycle, posée AVANT le code qui l'écrit (GA-11 / GA-12) ;
 *  - un REJET porte son MOTIF, en base : « rejeté » sans raison ne se relit pas
 *    six mois plus tard, et un contrôle qui n'existe qu'en formulaire est un
 *    contrôle qu'un appel direct contourne ;
 *  - `amount_cents` est NULLABLE et STRICTEMENT POSITIF quand il est là. Un
 *    montant qu'on ne connaît pas vaut `NULL`, jamais `0` — « zéro à payer » et
 *    « on n'a pas la facture » ne se réparent pas de la même façon, et un
 *    décaissement de 0 € n'est pas un paiement ;
 *  - `paid_on` est EXIGÉE dès que l'état est `paye`. Un paiement constaté sans
 *    date ne permet de mesurer aucun délai, donc ne sert à rien.
 *
 * `source` reprend `FIELD_SOURCES` (`human` > `connector` > `pipeline` >
 * `model`), comme `mission_expenses` et `supplier_invoices` : une correction
 * humaine gagne toujours, et le seul moyen de le tenir est de savoir d'où vient
 * chaque ligne.
 */
export class OutgoingPayments1790978000001 implements MigrationInterface {
  public name = 'OutgoingPayments1790978000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS outgoing_payments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
        consultant_id uuid,
        period_month date NOT NULL,
        supplier_invoice_id uuid REFERENCES supplier_invoices(id) ON DELETE SET NULL,
        amount_cents bigint,
        settled_amount_cents bigint,
        status text NOT NULL DEFAULT 'non_genere',
        scheduled_on date,
        paid_on date,
        reminders_sent integer NOT NULL DEFAULT 0,
        last_reminder_at timestamptz,
        validated_at timestamptz,
        validated_by uuid,
        rejected_at timestamptz,
        rejection_reason text,
        entered_by uuid NOT NULL,
        source text NOT NULL DEFAULT 'human',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT outgoing_payments_status_check
          CHECK (status IN ('non_genere', 'a_valider', 'valide', 'paye', 'rejete')),
        CONSTRAINT outgoing_payments_source_check
          CHECK (source IN ('human', 'connector', 'pipeline', 'model')),
        -- Un montant absent est absent ; un montant présent est un vrai dû.
        CONSTRAINT outgoing_payments_amount_check
          CHECK (amount_cents IS NULL OR amount_cents > 0),
        -- Ce qui est SORTI, distinct du dû : l'écart EST l'information. Même
        -- règle — absent tant que rien n'est constaté, jamais zéro.
        CONSTRAINT outgoing_payments_settled_amount_check
          CHECK (settled_amount_cents IS NULL OR settled_amount_cents > 0),
        CONSTRAINT outgoing_payments_reminders_check
          CHECK (reminders_sent >= 0),
        -- Le motif est OBLIGATOIRE au rejet, et la base le tient — pas seulement
        -- le formulaire.
        CONSTRAINT outgoing_payments_rejection_reason_check
          CHECK (status <> 'rejete' OR (rejection_reason IS NOT NULL AND btrim(rejection_reason) <> '')),
        -- « Payé » sans date ne mesure aucun délai. On refuse l'état, pas la date.
        CONSTRAINT outgoing_payments_paid_on_check
          CHECK (status <> 'paye' OR paid_on IS NOT NULL)
      )
    `)

    // L'unicité de la MAILLE. `COALESCE` parce qu'en SQL deux `NULL` ne sont pas
    // égaux : sans lui, une mission sans affectation aurait accepté autant de
    // paiements qu'on voulait sur le même mois.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS outgoing_payments_slot_idx
        ON outgoing_payments (
          mission_id,
          COALESCE(consultant_id, '00000000-0000-0000-0000-000000000000'::uuid),
          period_month
        )
    `)
    // L'écran interroge par ESPACE et par MOIS : c'est sa seule lecture chaude.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS outgoing_payments_workspace_month_idx
        ON outgoing_payments (workspace_id, period_month DESC)
    `)
    // La purge de démonstration efface par `WHERE workspace_id = $1`.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS outgoing_payments_workspace_idx ON outgoing_payments (workspace_id)`,
    )

    await queryRunner.query(`
      COMMENT ON TABLE outgoing_payments IS
        'Paiements SORTANTS vers le consultant (31/08/2026) - le miroir de invoice_readiness, qui suit l''argent ENTRANT du client. Maille mission x consultant x mois, celle de mission_timesheets : le releve VALIDE autorise le paiement, la facture entrante (supplier_invoices) le justifie. AUCUNE colonne bancaire, AUCUN ordre de virement : Bellum SUIT le paiement, il ne le declenche pas. paid_on est ce qu''un humain CONSTATE. Reserve a finance:read (lecture) et finance:write (changement d''etat).'
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS outgoing_payments`)
  }
}
