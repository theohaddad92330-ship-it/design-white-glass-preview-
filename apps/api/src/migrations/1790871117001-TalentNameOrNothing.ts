import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `consultants.full_name` peut valoir INCONNU (D366).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT
 * ─────────────────────────────────────────────────────────────────────────────
 * Toute fiche du vivier née d'un CV portait le NOM DE SON FICHIER. Pas
 * quelques-unes : toutes. `CvIntakeService` écrivait
 * `full_name: candidateName || input.filename.replace(/\.[a-z0-9]+$/i, '')`,
 * et `candidateName` valait TOUJOURS la chaîne vide — l'écran de dépôt n'a
 * jamais envoyé `fullName`. Le vivier se remplissait de « CV_2024_v3 » et de
 * « Profil_Dupont_VF_relu(2) ».
 *
 * C'est une valeur de REMPLISSAGE, ce que le dépôt s'interdit partout ailleurs :
 * « un champ illisible vaut `null`, jamais une valeur de remplissage ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI LA MIGRATION VIENT D'ABORD
 * ─────────────────────────────────────────────────────────────────────────────
 * « Une valeur qui voyage du code vers la base voit sa contrainte SQL élargie
 * AVANT le code qui l'écrit » (GA-11, GA-12). `full_name` est `NOT NULL` depuis
 * `1788013450112-Consultants`. Livrer d'abord le code qui écrit `null` mettrait
 * chaque dépôt de CV en erreur de driver — lue « 500 », donc lue « le service
 * est tombé », alors que c'est une contrainte qui fait son travail.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE MIGRATION NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle ne VIDE aucune fiche existante. « On archive, on ne supprime pas » : une
 * fiche qui porte aujourd'hui « CV_2024_v3 » garde sa valeur, et c'est l'écran
 * qui la présente honnêtement (lot d'écran, D346). Effacer ces noms d'office
 * ferait disparaître le seul repère dont dispose le recruteur pour retrouver
 * quelle fiche vient de quel fichier — le nom du fichier reste par ailleurs
 * intact dans `consultant_documents.filename`, où il a toujours été écrit.
 *
 * La seule normalisation faite ici porte sur les chaînes VIDES, et elle ne perd
 * rien : `''` et `'   '` ne portent aucune information, ils disent seulement
 * « inconnu » dans un vocabulaire que le reste du produit n'utilise pas. Les
 * ramener à `NULL` est ce qui permet à la contrainte ci-dessous d'exister — et
 * c'est cette contrainte qui empêche qu'on remplace un remplissage par un
 * autre : sans elle, `full_name: ''` serait le prochain « Inconnu ».
 */
export class TalentNameOrNothing1790871117001 implements MigrationInterface {
  public name = 'TalentNameOrNothing1790871117001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Le vocabulaire d'abord : une chaîne vide DIT « inconnu », elle le dit
    //    mal. On la traduit avant de poser la contrainte qui l'interdira.
    await queryRunner.query(`UPDATE consultants SET full_name = NULL WHERE btrim(full_name) = ''`)

    // 2. La contrainte élargie. `DROP NOT NULL` est idempotent en PostgreSQL :
    //    rejouer la migration sur une colonne déjà nullable ne produit rien.
    await queryRunner.query(`ALTER TABLE consultants ALTER COLUMN full_name DROP NOT NULL`)

    // 3. Et l'interdit qui empêche le remplacement d'un remplissage par un
    //    autre : si le nom est absent, il est ABSENT — pas vide, pas blanc.
    await queryRunner.query(`ALTER TABLE consultants DROP CONSTRAINT IF EXISTS consultants_full_name_not_blank`)
    await queryRunner.query(`
      ALTER TABLE consultants ADD CONSTRAINT consultants_full_name_not_blank
        CHECK (full_name IS NULL OR btrim(full_name) <> '')
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE consultants DROP CONSTRAINT IF EXISTS consultants_full_name_not_blank`)
    // Revenir en arrière suppose de reboucher les trous, et il n'existe aucune
    // valeur VRAIE pour les reboucher. On pose une marque explicitement
    // reconnaissable plutôt qu'un nom plausible : si ce `down` est joué un
    // jour, il doit se VOIR, pas se fondre dans le vivier.
    await queryRunner.query(`UPDATE consultants SET full_name = '(nom inconnu)' WHERE full_name IS NULL`)
    await queryRunner.query(`ALTER TABLE consultants ALTER COLUMN full_name SET NOT NULL`)
  }
}
