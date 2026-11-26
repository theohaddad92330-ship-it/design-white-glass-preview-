import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * LE DOSSIER DE FACTURATION D'UN CLIENT — la moitié STRUCTURELLE de
 * « peut-on facturer ce compte ? » (maquette « Comptes vus par le delivery »,
 * 26/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI SUR `account_entities` ET NON SUR `accounts`
 * ─────────────────────────────────────────────────────────────────────────────
 * Une facture part à une PERSONNE MORALE, pas à un périmètre commercial. Le
 * compte « EDF » n'a ni SIREN ni conditions de règlement ; « EDF SA » en a. Le
 * dépôt porte déjà cette distinction — `account_entities` EST la subdivision
 * juridique du client, et elle porte déjà `siren` — donc le dossier de
 * facturation se pose là, sur l'entité DÉSIGNÉE comme payeur.
 *
 * ⚠️ À NE PAS CONFONDRE AVEC `legal_entities`, et l'erreur a déjà été commise
 * une fois (analyse du 28/08) : `legal_entities` porte les sociétés DE L'ESN —
 * qui ÉMET la facture, nous. `account_entities` porte celles du CLIENT — qui la
 * REÇOIT. Les cinq colonnes ci-dessous décrivent le RECEVEUR.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CES COLONNES NE PORTENT PAS, ET CE N'EST PAS UN OUBLI
 * ─────────────────────────────────────────────────────────────────────────────
 *  · **Aucune coordonnée bancaire, aucun IBAN.** « Bellum ne signe rien, ne
 *    paie rien et ne stocke aucun IBAN » est écrit trois fois dans le dépôt
 *    (`packages/contracts/src/schemas/admin-docs.ts:8`, la migration
 *    `1788900000005-AdminDocsConnections.ts:15`, `tool-catalog.ts:129`). La
 *    « domiciliation » de la maquette n'a donc pas de colonne ici.
 *  · **Aucun KYC, aucun document de conformité.** La fiche de lecture de la
 *    maquette jette explicitement le contrôle réglementaire, et le dépôt n'a
 *    aucune notion de conformité : une table vide aurait affiché « 0 document
 *    manquant » sur des dossiers que personne n'a ouverts.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROIS `NULL` QUI VEULENT DIRE « PERSONNE N'A RÉPONDU », JAMAIS « ZÉRO »
 * ─────────────────────────────────────────────────────────────────────────────
 *  · `payment_terms_days` — `NULL` = inconnu (un BLOQUEUR nommé, puisque sans
 *    lui aucune échéance n'est calculable, donc aucun retard, donc aucune
 *    relance). `0` est une valeur SAISIE et légitime : paiement comptant. La
 *    contrainte interdit le négatif, jamais le zéro.
 *  · `contract_expires_on` — `NULL` = aucune échéance connue, ce qui est le cas
 *    NORMAL d'un contrat-cadre sans terme. Ce n'est PAS « expiré » : le compter
 *    ainsi aurait fait rougir tout le portefeuille le jour du déploiement.
 *  · `legal_name` — `NULL` = la raison sociale n'a jamais été saisie. Aucun
 *    repli sur `name` : « EDF DSI Groupe » est un nom d'usage, et le présenter
 *    comme une raison sociale ferait passer une supposition pour un fait.
 *
 * `is_billing` est le seul à porter un défaut, et il est FAUX : aucune entité
 * n'est payeuse tant que quelqu'un ne l'a pas désignée. En désigner une
 * d'office (la première, ou celle par défaut) aurait affiché un SIREN qui n'est
 * pas celui du payeur — le genre de chiffre qui part sur un document.
 */
export class AccountBillingProfile1790972000001 implements MigrationInterface {
  public name = 'AccountBillingProfile1790972000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE account_entities ADD COLUMN IF NOT EXISTS is_billing boolean NOT NULL DEFAULT false`,
    )
    await queryRunner.query(`ALTER TABLE account_entities ADD COLUMN IF NOT EXISTS legal_name text`)
    await queryRunner.query(`ALTER TABLE account_entities ADD COLUMN IF NOT EXISTS payment_terms_days integer`)
    await queryRunner.query(`ALTER TABLE account_entities ADD COLUMN IF NOT EXISTS contract_expires_on date`)
    await queryRunner.query(`ALTER TABLE account_entities ADD COLUMN IF NOT EXISTS billing_contact_id uuid`)

    // Un délai de règlement négatif n'a aucun sens ; `0` (comptant) en a un.
    // Ce n'est PAS une énumération : GA-11 / GA-12 / GA-177 ne comptent que les
    // contraintes à liste de valeurs, et celle-ci n'en est pas une. Nommée
    // quand même, parce que c'est la convention du dépôt.
    await queryRunner.query(
      `ALTER TABLE account_entities DROP CONSTRAINT IF EXISTS account_entities_payment_terms_days_check`,
    )
    await queryRunner.query(`
      ALTER TABLE account_entities ADD CONSTRAINT account_entities_payment_terms_days_check
        CHECK (payment_terms_days IS NULL OR payment_terms_days >= 0)
    `)

    // Le contact de facturation est un contact du CLIENT. `ON DELETE SET NULL`
    // et non `CASCADE` : supprimer un interlocuteur ne doit pas supprimer
    // l'entité qui reçoit la facture — le bloqueur « pas de contact de
    // facturation » doit RÉAPPARAÎTRE, ce qui est précisément le signal utile.
    await queryRunner.query(
      `ALTER TABLE account_entities DROP CONSTRAINT IF EXISTS account_entities_billing_contact_fk`,
    )
    await queryRunner.query(`
      ALTER TABLE account_entities ADD CONSTRAINT account_entities_billing_contact_fk
        FOREIGN KEY (billing_contact_id) REFERENCES contacts(id) ON DELETE SET NULL
    `)

    // AU PLUS UNE entité payeuse par compte. L'unicité est portée par un index
    // PARTIEL et non par le code, exactement comme `is_default` juste à côté :
    // deux entités payeuses se partageraient silencieusement le SIREN affiché
    // sur la ligne, et rien ne dirait laquelle a gagné.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS account_entities_one_billing_per_account_idx
        ON account_entities (account_id) WHERE is_billing
    `)

    await queryRunner.query(`
      COMMENT ON COLUMN account_entities.is_billing IS
        'Cette entite du CLIENT est celle qui RECOIT la facture (26/08/2026). Au plus une par compte. Ne pas confondre avec legal_entities, qui porte les societes de l ESN, celles qui EMETTENT.'
    `)
    await queryRunner.query(`
      COMMENT ON COLUMN account_entities.payment_terms_days IS
        'Delai de reglement en jours. NULL = personne ne l a saisi, et c est un bloqueur nomme (sans lui aucune echeance n est calculable). 0 = comptant, une valeur saisie et legitime.'
    `)
    await queryRunner.query(`
      COMMENT ON COLUMN account_entities.contract_expires_on IS
        'Echeance du contrat-cadre. NULL = aucune echeance connue (cas normal d un contrat sans terme), JAMAIS expire.'
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS account_entities_one_billing_per_account_idx`)
    await queryRunner.query(
      `ALTER TABLE account_entities DROP CONSTRAINT IF EXISTS account_entities_billing_contact_fk`,
    )
    await queryRunner.query(
      `ALTER TABLE account_entities DROP CONSTRAINT IF EXISTS account_entities_payment_terms_days_check`,
    )
    await queryRunner.query(`ALTER TABLE account_entities DROP COLUMN IF EXISTS billing_contact_id`)
    await queryRunner.query(`ALTER TABLE account_entities DROP COLUMN IF EXISTS contract_expires_on`)
    await queryRunner.query(`ALTER TABLE account_entities DROP COLUMN IF EXISTS payment_terms_days`)
    await queryRunner.query(`ALTER TABLE account_entities DROP COLUMN IF EXISTS legal_name`)
    await queryRunner.query(`ALTER TABLE account_entities DROP COLUMN IF EXISTS is_billing`)
  }
}
