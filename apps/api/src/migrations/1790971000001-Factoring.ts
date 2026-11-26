import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * LA CESSION DE CRÉANCE (AFFACTURAGE) — trois tables, 31/08/2026.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE REVIREMENT QUI AUTORISE CETTE MIGRATION
 * ─────────────────────────────────────────────────────────────────────────────
 * Le domaine était REFUSÉ, et le refus était écrit au registre de doctrine
 * (`c29_affacturage`) : « Bellum ne touche jamais au FINANCEMENT d'une
 * créance. » Louis l'a relu le 31/08/2026 et l'a levé, en nommant ce qu'il
 * veut : « objet cession, contrat factor, taux de commission, encours cédé,
 * réconciliation des règlements du factor. » L'entrée du registre a été
 * RÉÉCRITE le même jour — pas supprimée : une décision qui change garde sa
 * trace, sinon elle se re-litigie une troisième fois.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CES TABLES NE PORTENT PAS, ET CE N'EST PAS UN OUBLI
 * ─────────────────────────────────────────────────────────────────────────────
 * **AUCUNE COORDONNÉE BANCAIRE.** Le dépôt porte, écrite trois fois, la
 * décision « Bellum ne signe rien, ne paie rien et ne stocke aucun IBAN ». Ce
 * refus-là n'est PAS levé. Piloter un contrat d'affacturage n'en a pas besoin :
 * ce qu'il faut savoir est QUI rachète, SOUS quelle référence, à QUEL taux et
 * JUSQU'À quel plafond. Le virement part de la banque de l'ESN et n'a jamais
 * transité par ici. Ce n'est pas une convention : c'est l'absence de colonne.
 *
 * Pas de numéro de facture non plus, ni de TVA : la facture est émise dans
 * l'outil comptable, et `invoice_readiness` en consigne déjà la référence, le
 * montant et l'échéance. Une cession pointe la créance par sa clé
 * (`mission_id`, `period_month`), jamais par un document qu'elle recréerait.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI TROIS TABLES ET NON UNE
 * ─────────────────────────────────────────────────────────────────────────────
 *  · `factoring_contracts` — le CONTRAT, qui vit des années et porte le taux
 *    par défaut et le plafond d'encours. Le fondre dans la cession recopierait
 *    le taux sur chaque ligne, et le jour où il change, personne ne saurait
 *    lequel s'appliquait à quoi.
 *  · `receivable_assignments` — LA CESSION, une par créance cédée. Elle porte
 *    son propre taux, NULLABLE : `null` = « celui du contrat », une valeur =
 *    un taux dérogatoire négocié sur cette créance-là.
 *  · `factoring_settlements` — les RÈGLEMENTS reçus du factor. Une table à
 *    part parce qu'un avis de règlement couvre souvent PLUSIEURS cessions, et
 *    parce qu'un règlement arrive parfois avant qu'on sache à quoi le
 *    rattacher : `assignment_id` est donc nullable, et ce `null` est
 *    exactement le travail de réconciliation qui reste à faire.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES CONTRAINTES, ET CE QU'ELLES REFUSENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Toutes les contraintes qui ÉNUMÈRENT des valeurs sont NOMMÉES (GA-177) : une
 * contrainte anonyme ne peut ni s'élargir proprement (GA-11) ni se relier à son
 * énumération TypeScript (GA-12).
 *
 * ⚠️ `amount_cents` d'un règlement n'a AUCUNE contrainte de signe, et c'est
 * délibéré : une créance REPRISE par le factor (`recalled`) produit une ligne
 * NÉGATIVE — de l'argent qui repart. La refuser obligerait à effacer le
 * règlement d'origine, c'est-à-dire à faire disparaître le fait qu'il a eu
 * lieu. On archive, on ne supprime pas.
 *
 * ⚠️ L'unicité de la cession est PARTIELLE, sur les seuls états vivants. Une
 * créance refusée par un factor doit pouvoir être cédée à un autre ; un index
 * unique total l'interdirait, et le geste n'aurait plus aucune porte.
 */
export class Factoring1790971000001 implements MigrationInterface {
  public name = 'Factoring1790971000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS factoring_contracts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        factor_name text NOT NULL,
        contract_reference text,
        commission_rate_bps integer CHECK (commission_rate_bps >= 0 AND commission_rate_bps <= 10000),
        outstanding_limit_cents bigint CHECK (outstanding_limit_cents >= 0),
        status text NOT NULL DEFAULT 'active',
        started_on date,
        ended_on date,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT factoring_contracts_status_check CHECK (status IN ('active', 'suspended', 'ended'))
      )
    `)
    // La purge de démonstration efface par `WHERE workspace_id = $1`, et
    // l'écran ne lit jamais que les contrats de SON espace.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS factoring_contracts_workspace_idx ON factoring_contracts (workspace_id)`,
    )
    await queryRunner.query(`
      COMMENT ON TABLE factoring_contracts IS
        'Contrat d''affacturage - le tiers qui rachete la creance (31/08/2026). AUCUNE coordonnee bancaire : Bellum ne signe rien, ne paie rien et ne stocke aucun IBAN. Nom, reference, taux, plafond, et rien d''autre.'
    `)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS receivable_assignments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        contract_id uuid NOT NULL REFERENCES factoring_contracts(id) ON DELETE CASCADE,
        mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
        period_month date NOT NULL,
        status text NOT NULL DEFAULT 'prepared',
        assigned_amount_cents bigint CHECK (assigned_amount_cents >= 0),
        commission_rate_bps integer CHECK (commission_rate_bps >= 0 AND commission_rate_bps <= 10000),
        assigned_on date,
        settled_on date,
        decision_reason text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT receivable_assignments_status_check
          CHECK (status IN ('prepared', 'assigned', 'settled', 'rejected', 'recalled')),
        CONSTRAINT receivable_assignments_decision_reason_check
          CHECK (
            status NOT IN ('rejected', 'recalled')
            OR (decision_reason IS NOT NULL AND btrim(decision_reason) <> '')
          )
      )
    `)
    // Une créance ne se cède qu'une fois À LA FOIS. L'index est PARTIEL : une
    // créance refusée ou reprise redevient cessible, sinon le refus d'un factor
    // condamnerait la créance pour toujours.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS receivable_assignments_live_idx
        ON receivable_assignments (mission_id, period_month)
        WHERE status IN ('prepared', 'assigned', 'settled')
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS receivable_assignments_workspace_idx ON receivable_assignments (workspace_id)`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS receivable_assignments_contract_idx ON receivable_assignments (contract_id)`,
    )
    await queryRunner.query(`
      COMMENT ON TABLE receivable_assignments IS
        'Une cession de creance (31/08/2026) - pointe la creance par (mission_id, period_month), jamais par un document. commission_rate_bps NULL = le taux du contrat s''applique ; une valeur = un taux derogatoire negocie sur cette creance.'
    `)

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS factoring_settlements (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        contract_id uuid NOT NULL REFERENCES factoring_contracts(id) ON DELETE CASCADE,
        assignment_id uuid REFERENCES receivable_assignments(id) ON DELETE SET NULL,
        received_on date NOT NULL,
        amount_cents bigint NOT NULL,
        reference text,
        recorded_by uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS factoring_settlements_workspace_idx ON factoring_settlements (workspace_id)`,
    )
    // La lecture qui porte la réconciliation : « les règlements de CETTE
    // cession ». `assignment_id IS NULL` est la file du travail restant, et cet
    // index la sert aussi.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS factoring_settlements_assignment_idx ON factoring_settlements (assignment_id)`,
    )
    await queryRunner.query(`
      COMMENT ON TABLE factoring_settlements IS
        'Reglements recus du factor (31/08/2026). assignment_id NULL = recu et PAS ENCORE rapproche, ce qui est l''objet meme de la reconciliation. amount_cents peut etre NEGATIF : une creance reprise par le factor fait repartir de l''argent.'
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // L'ordre inverse de la création : les règlements référencent les cessions,
    // qui référencent les contrats.
    await queryRunner.query(`DROP TABLE IF EXISTS factoring_settlements`)
    await queryRunner.query(`DROP TABLE IF EXISTS receivable_assignments`)
    await queryRunner.query(`DROP TABLE IF EXISTS factoring_contracts`)
  }
}
