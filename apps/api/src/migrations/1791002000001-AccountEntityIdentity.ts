import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * L'IDENTITÉ LÉGALE D'UNE ENTITÉ DU CLIENT — le SIRET, et QUI l'a confirmée
 * (arbitrage de Louis du 31/08/2026, maquette « Comptes vus par le delivery »).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN SIRET ALORS QUE LE SIREN EXISTE DÉJÀ
 * ─────────────────────────────────────────────────────────────────────────────
 * Les maquettes affichent quatorze chiffres ; la table n'en portait que neuf.
 * Ce ne sont pas deux graphies du même identifiant : le SIREN désigne la
 * PERSONNE MORALE, le SIRET désigne un ÉTABLISSEMENT de cette personne morale —
 * ses cinq derniers chiffres (le NIC) disent LEQUEL. Une facture qui part au
 * mauvais établissement d'un grand groupe se perd exactement comme si elle
 * portait la mauvaise société.
 *
 * ⚠️ **LE SIRET NE SE DÉDUIT JAMAIS DU SIREN.** Il n'existe aucune règle qui
 * donne le NIC : il est attribué établissement par établissement. Compléter
 * « 420624777 » en « 42062477700001 » parce que « 00001 est souvent le siège »
 * désignerait un établissement qu'on n'a pas vérifié — c'est-à-dire fabriquer
 * une donnée, ce que le dépôt refuse. La colonne est donc SAISISSABLE et
 * strictement nullable, et le code (`normaliseSiret`, `siretBelongsToSiren`)
 * REFUSE un SIRET qui ne commence pas par le SIREN connu au lieu de l'ajuster.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA PASTILLE « VÉRIFIÉ » N'EST PAS UN ORNEMENT — D'OÙ DEUX COLONNES, PAS UNE
 * ─────────────────────────────────────────────────────────────────────────────
 * Un badge bleu à côté d'un nom ne dit rien tant qu'il ne dit pas CE QU'IL
 * VÉRIFIE. Ces deux colonnes portent exactement ce que la primitive
 * `Provenance` réclame partout ailleurs : la SOURCE et la DATE.
 *
 *  · `identity_source` — qui a confirmé. `public_registry` = un registre public
 *    (le nom EST la garantie) ; `human_declared` = quelqu'un de l'espace l'a
 *    saisi et en répond. Deux valeurs, pas trois : « le modèle l'a proposé »
 *    n'est PAS une vérification, et lui donner un nom ici la ferait cocher.
 *  · `identity_checked_on` — QUAND. Une source sans date se périme en silence :
 *    « information de mars 2026, à revérifier » est la formulation que le dépôt
 *    impose déjà aux faits d'accès, et elle vaut ici.
 *
 * Les deux vont ENSEMBLE ou aucune des deux — la contrainte
 * `account_entities_identity_pair_check` le tient en base, pas seulement dans le
 * code : une source sans date afficherait « vérifié » sans qu'on puisse dire
 * quand, et une date sans source afficherait une fraîcheur sans garantie.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE MIGRATION N'AJOUTE PAS, ET CE N'EST PAS UN OUBLI
 * ─────────────────────────────────────────────────────────────────────────────
 *  · **Aucune coordonnée bancaire, aucun IBAN** — refus écrit trois fois dans
 *    le dépôt (`admin-docs.ts`, `1788900000005-AdminDocsConnections.ts`,
 *    `tool-catalog.ts`), reconfirmé le 31/08/2026. La « domiciliation » des
 *    maquettes n'a toujours pas de colonne.
 *  · **Aucun dossier KYC.** Le lot précédent l'a écarté avec la bonne raison —
 *    aucune donnée n'existe, et « 0 document manquant » se lirait « tout va
 *    bien » sur un dossier que personne n'a ouvert. Une date ou un compteur
 *    inventés seraient pires que l'absence. L'écart reste, il est écrit.
 *
 * ⚠️ `account_entities_identity_source_check` est une contrainte à LISTE de
 * valeurs : elle est donc inscrite au `MAPPING` de
 * `check-constraints-cover-enums.spec.ts` (GA-12), en face de
 * `ACCOUNT_ENTITY_IDENTITY_SOURCES`. Les deux autres n'en sont pas (un format,
 * puis une co-présence) et n'y figurent pas — la garde ne compte que les listes.
 */
export class AccountEntityIdentity1791002000001 implements MigrationInterface {
  public name = 'AccountEntityIdentity1791002000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE account_entities ADD COLUMN IF NOT EXISTS siret text`)
    await queryRunner.query(`ALTER TABLE account_entities ADD COLUMN IF NOT EXISTS identity_source text`)
    await queryRunner.query(`ALTER TABLE account_entities ADD COLUMN IF NOT EXISTS identity_checked_on date`)

    // QUATORZE chiffres, ni plus ni moins, et aucun séparateur : la valeur
    // stockée est celle qu'on compare, jamais celle qu'on affiche. Un SIRET
    // saisi « 420 624 777 00034 » est normalisé AVANT d'arriver ici ; s'il
    // arrivait tel quel, la contrainte le refuserait plutôt que de le tronquer.
    await queryRunner.query(`ALTER TABLE account_entities DROP CONSTRAINT IF EXISTS account_entities_siret_check`)
    await queryRunner.query(`
      ALTER TABLE account_entities ADD CONSTRAINT account_entities_siret_check
        CHECK (siret IS NULL OR siret ~ '^[0-9]{14}$')
    `)

    // La liste FERMÉE des sources de vérification. Élargie AVANT tout code qui
    // écrirait une troisième valeur, jamais après (GA-11 / GA-12).
    await queryRunner.query(
      `ALTER TABLE account_entities DROP CONSTRAINT IF EXISTS account_entities_identity_source_check`,
    )
    await queryRunner.query(`
      ALTER TABLE account_entities ADD CONSTRAINT account_entities_identity_source_check
        CHECK (identity_source IS NULL OR identity_source IN ('public_registry', 'human_declared'))
    `)

    // La source et la date vont ensemble. Une pastille « vérifié » sans date
    // ne dit pas ce qu'elle vérifie, et une date sans source ne dit pas par qui.
    await queryRunner.query(
      `ALTER TABLE account_entities DROP CONSTRAINT IF EXISTS account_entities_identity_pair_check`,
    )
    await queryRunner.query(`
      ALTER TABLE account_entities ADD CONSTRAINT account_entities_identity_pair_check
        CHECK ((identity_source IS NULL) = (identity_checked_on IS NULL))
    `)

    await queryRunner.query(`
      COMMENT ON COLUMN account_entities.siret IS
        'Numero d etablissement a 14 chiffres du payeur (31/08/2026). NULL = jamais saisi. Ne se deduit JAMAIS du SIREN : les 5 derniers chiffres (NIC) designent un etablissement precis et ne s inventent pas.'
    `)
    await queryRunner.query(`
      COMMENT ON COLUMN account_entities.identity_source IS
        'Qui a confirme l identite legale : public_registry (un registre public) ou human_declared (une saisie humaine dont quelqu un repond). NULL = personne. Un modele qui propose n est PAS une verification.'
    `)
    await queryRunner.query(`
      COMMENT ON COLUMN account_entities.identity_checked_on IS
        'Quand l identite a ete confirmee. Va TOUJOURS avec identity_source : une source sans date se perime en silence.'
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE account_entities DROP CONSTRAINT IF EXISTS account_entities_identity_pair_check`,
    )
    await queryRunner.query(
      `ALTER TABLE account_entities DROP CONSTRAINT IF EXISTS account_entities_identity_source_check`,
    )
    await queryRunner.query(`ALTER TABLE account_entities DROP CONSTRAINT IF EXISTS account_entities_siret_check`)
    await queryRunner.query(`ALTER TABLE account_entities DROP COLUMN IF EXISTS identity_checked_on`)
    await queryRunner.query(`ALTER TABLE account_entities DROP COLUMN IF EXISTS identity_source`)
    await queryRunner.query(`ALTER TABLE account_entities DROP COLUMN IF EXISTS siret`)
  }
}
