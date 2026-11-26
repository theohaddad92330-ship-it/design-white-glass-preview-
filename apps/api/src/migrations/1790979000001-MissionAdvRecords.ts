import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `mission_adv_records` — les faits d'administration des ventes qu'aucune table
 * ne portait (31/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE MANQUE MESURÉ, AVANT D'ÉCRIRE UNE LIGNE
 * ─────────────────────────────────────────────────────────────────────────────
 * Trois recherches, deux formes chacune (`grep -rn` puis `grep -rnE`, pour ne
 * pas conclure d'un faux zéro), sur `apps/api/src`, `apps/web/src` et
 * `packages/contracts/src` :
 *
 *   - `ADV` / `adv`                       → 0 occurrence
 *   - `payment_terms` / `paymentTerms`    → 0 occurrence
 *   - `billing_reference` / `customer_reference` → 0 occurrence
 *
 * Le dossier ADV réutilise donc tout ce qui EXISTE — le contact de facturation
 * (`missions.billing_contact_id`), le bon de commande
 * (`mission_commercial_terms.requires_po` / `po_number`), les entités clientes
 * (`account_entities.siren`) — et cette table ne porte QUE les trois faits
 * qu'aucune autre ne porte.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE NE PORTERA JAMAIS : UN MOYEN DE PAIEMENT
 * ─────────────────────────────────────────────────────────────────────────────
 * La maquette du 26/08 nomme un motif « RIB manquant ». Le dépôt refuse par
 * écrit, à trois endroits, de stocker un IBAN — « Bellum ne signe rien, ne paie
 * rien et ne stocke aucun IBAN » (`packages/contracts/src/schemas/admin-docs.ts`,
 * la migration `1788900000005-AdminDocsConnections`, `tool-catalog.ts`). Ce
 * refus n'est pas levé par ce lot.
 *
 * `payment_details_transmitted_at` porte donc un ÉTAT et sa DATE, et rien
 * d'autre : « les coordonnées de règlement ont-elles été transmises au client,
 * et quand ». C'est exactement ce dont l'ADV a besoin pour relancer, et cela
 * n'exige de conserver aucun numéro. Il n'y a nulle part, dans cette table, où
 * en ranger un — c'est la contrainte de FORME qui tient la règle, pas une
 * consigne.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES CONTRAINTES, POSÉES AVANT LE CODE QUI ÉCRIT (GA-11 / GA-12)
 * ─────────────────────────────────────────────────────────────────────────────
 *  - `payment_terms_days > 0` : `0` n'est pas une condition de règlement. Le
 *    laisser passer transformerait « personne ne les a saisies » en « règlement
 *    comptant », ce que personne n'a décidé. Le schéma zod le refuse aussi ;
 *    les deux disent la même chose, et la base est celle qui tient.
 *  - `client_billing_reference <> ''` : une chaîne vide se lirait comme une
 *    référence saisie. Un champ absent vaut `NULL`, jamais du blanc.
 *  - une seule ligne par mission (index unique) : un dossier ADV est UN dossier.
 *  - `ON DELETE CASCADE` sur la mission : le dossier n'existe pas sans elle.
 *
 * `client_entity_id` est un `uuid` NU, sans clé étrangère — comme
 * `missions.legal_entity_id`, `missions.site_id` et `missions.billing_contact_id`
 * juste à côté. La raison est la même : une entité cliente peut être fusionnée
 * ou reprise par un autre chantier, et une contrainte dure ferait échouer son
 * ménage sur un dossier ADV qui n'est pas le sujet. Le calcul traite un
 * identifiant qui ne résout plus exactement comme une entité absente — un motif
 * à réparer, pas une erreur.
 */
export class MissionAdvRecords1790979000001 implements MigrationInterface {
  public name = 'MissionAdvRecords1790979000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS mission_adv_records (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
        workspace_id uuid NOT NULL,
        client_billing_reference text,
        payment_terms_days integer,
        payment_details_transmitted_at timestamptz,
        client_entity_id uuid,
        updated_by uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT mission_adv_records_terms_check
          CHECK (payment_terms_days IS NULL OR payment_terms_days > 0),
        CONSTRAINT mission_adv_records_reference_check
          CHECK (client_billing_reference IS NULL OR btrim(client_billing_reference) <> '')
      )
    `)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS mission_adv_records_mission_idx
        ON mission_adv_records (mission_id)
    `)
    // La purge de démonstration efface par `WHERE workspace_id = $1`, comme
    // `mission_commercial_terms` et `mission_expenses`. Sans cet index, chaque
    // reset de salle scannerait la table entière.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS mission_adv_records_workspace_idx ON mission_adv_records (workspace_id)`,
    )
    await queryRunner.query(`
      COMMENT ON TABLE mission_adv_records IS
        'Administration des ventes (31/08/2026) - reference cliente, conditions de reglement, etat de transmission des coordonnees de reglement, entite de facturation cliente. NE PORTE AUCUN MOYEN DE PAIEMENT : Bellum ne stocke aucun IBAN.'
    `)
    await queryRunner.query(`
      COMMENT ON COLUMN mission_adv_records.payment_details_transmitted_at IS
        'QUAND les coordonnees de reglement ont ete transmises au client. Un etat et une date - jamais un numero.'
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS mission_adv_records`)
  }
}
