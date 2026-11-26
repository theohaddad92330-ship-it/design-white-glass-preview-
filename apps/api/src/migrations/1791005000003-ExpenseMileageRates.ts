import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `expense_mileage_rates` — le BARÈME KILOMÉTRIQUE, SAISI (31/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE TABLE EST VIDE À LA LIVRAISON, ET DOIT L'ÊTRE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le lot précédent avait ÉCARTÉ l'indemnité kilométrique, et il avait raison sur
 * le fond : la vérifier suppose un barème par puissance fiscale, aucun n'existe
 * dans ce dépôt, et un barème pré-rempli — recopié de mémoire, non daté, jamais
 * revérifié — serait une donnée fictive présentée comme une règle officielle.
 * Le jour où l'URSSAF révise ses coefficients, l'ESN rembourserait sur un
 * chiffre que personne n'a mis à jour, en croyant appliquer le texte.
 *
 * La sortie n'est donc pas de LE FOURNIR, c'est de le faire SAISIR : cette
 * table naît vide, l'ESN y met SON barème (puissance fiscale → centimes par
 * kilomètre, avec sa date d'effet), et tant qu'elle ne l'a pas fait, une ligne
 * `mileage` reste « non vérifiée » — jamais « conforme ». Une garantie ne se
 * déduit pas d'un silence, et c'est déjà la règle que tient
 * `expense_policy_caps.cap_cents IS NULL`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `effective_from` EST OBLIGATOIRE ICI — contrairement aux plafonds
 * ─────────────────────────────────────────────────────────────────────────────
 * `expense_policy_caps.effective_from` est nullable, parce que des plafonds
 * existaient AVANT la date d'effet et qu'il aurait fallu leur en inventer une.
 * Ici, aucune ligne n'existe : toute ligne naît d'une saisie, et une saisie sans
 * date d'effet n'a pas de sens pour un barème révisé chaque année. Ce qui
 * distingue les deux, ce n'est pas le goût, c'est l'existence d'un historique à
 * ne pas travestir.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `fiscal_horsepower` : la PUISSANCE DU VÉHICULE, pas une donnée de personne
 * ─────────────────────────────────────────────────────────────────────────────
 * À dire, parce que la question se pose à chaque colonne qui touche à un
 * déplacement : la puissance fiscale décrit un VÉHICULE. Elle n'ordonne aucune
 * personne, n'entre dans aucun classement, et ne relève donc pas de la doctrine
 * des critères protégés. Elle borne le remboursement, comme un plafond de repas.
 *
 * Bornée à 50 CV : au-delà, ce n'est plus une voiture particulière, et une
 * saisie à 500 par glissement de doigt multiplierait le remboursement par dix
 * sans que rien ne le dise.
 */
export class ExpenseMileageRates1791005000003 implements MigrationInterface {
  public name = 'ExpenseMileageRates1791005000003'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS expense_mileage_rates (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        policy_id uuid NOT NULL REFERENCES expense_policies(id) ON DELETE CASCADE,
        workspace_id uuid NOT NULL,
        fiscal_horsepower integer NOT NULL CHECK (fiscal_horsepower > 0 AND fiscal_horsepower <= 50),
        cents_per_km bigint NOT NULL CHECK (cents_per_km > 0),
        effective_from date NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `)
    // Un tarif par (politique, puissance, date d'effet) : deux lignes identiques
    // rendraient le tarif appliqué dépendant de l'ordre de lecture, exactement
    // ce que l'index unique des plafonds empêche déjà.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS expense_mileage_rates_policy_hp_from_key
        ON expense_mileage_rates (policy_id, fiscal_horsepower, effective_from)
    `)
    // La purge de démonstration efface par `WHERE workspace_id = $1`.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS expense_mileage_rates_workspace_idx ON expense_mileage_rates (workspace_id)`,
    )
    await queryRunner.query(`
      COMMENT ON TABLE expense_mileage_rates IS
        'Bareme kilometrique SAISI par l''ESN (31/08/2026) : puissance fiscale -> centimes par kilometre, avec sa date d''effet. Naît VIDE a dessein - un bareme pre-rempli serait une donnee fictive presentee comme une regle officielle. Sans saisie, une ligne mileage reste NON VERIFIEE, jamais conforme.'
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS expense_mileage_rates`)
  }
}
