import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Le CINQUIÈME canal d'une mission : le portage.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI MANQUAIT, ET CE QUE SON ABSENCE COÛTAIT
 * ─────────────────────────────────────────────────────────────────────────────
 * La source du pilotage nomme cinq canaux — direct, partenaire, sous-traitance,
 * **portage**, et le canal non renseigné. La contrainte en portait quatre.
 *
 * Une mission en portage n'était donc pas « mal rangée » : elle tombait en
 * `unknown`, la seule valeur que la contrainte acceptait pour elle. Or `unknown`
 * est la ligne dont le produit dit qu'elle ne mesure rien — celle qu'on ne range
 * JAMAIS avec le direct, précisément pour ne pas fausser la comparaison. Le
 * portage était donc versé dans le seau des absences, et « la marge par canal »
 * — ce que la source appelle l'indicateur le plus stratégique, celui sur lequel
 * on lance ou non un chantier de référencement — comptait comme « non
 * renseignées » des missions dont le chemin était parfaitement connu.
 *
 * Un canal manquant ne se voit pas : il se lit comme une équipe qui remplit mal
 * ses fiches.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE MIGRATION PART AVANT LE CODE
 * ─────────────────────────────────────────────────────────────────────────────
 * **Une valeur qui voyage du code vers la base voit sa contrainte SQL élargie
 * AVANT le code qui l'écrit** (gardes GA-11 et GA-12). L'ordre inverse ne casse
 * pas au déploiement — il casse à la première saisie, et le symptôme est un
 * formulaire qui refuse d'enregistrer sans dire pourquoi. C'est ce que
 * `account_vocabulary.kind` a coûté le 21/07, et `accounts.status = 'prospect'`
 * le 22/08.
 *
 * Les quatre valeurs existantes sont recopiées EN TÊTE et DANS LEUR ORDRE :
 * `portage` s'ajoute en fin, même discipline que GA-08 côté TypeScript. Une
 * liste retapée depuis une migration périmée est ce qui a abandonné un
 * déploiement le 21/08.
 *
 * ⚠️ `unknown` reste la DERNIÈRE valeur SÉMANTIQUE, pas la dernière valeur de la
 * liste — et c'est voulu. L'ordre d'une énumération gelée n'est pas un classement
 * de lecture : c'est un historique. `portage` arrivant après `unknown` est le
 * prix de l'additivité, et l'écran, lui, ordonne ses lignes comme il l'entend.
 */
export class MissionChannelPortage1790700016001 implements MigrationInterface {
  name = 'MissionChannelPortage1790700016001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE mission_commercial_terms DROP CONSTRAINT IF EXISTS mission_terms_channel_check`,
    )
    await queryRunner.query(`
      ALTER TABLE mission_commercial_terms ADD CONSTRAINT mission_terms_channel_check CHECK (
        channel IN ('direct', 'partner', 'subcontracting', 'unknown', 'portage')
      )
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // On RAMÈNE les lignes en portage vers `unknown` avant de resserrer.
    //
    // Deux raisons, et la seconde est la vraie : une contrainte qu'on remet sans
    // nettoyer échoue sur les données existantes, et la migration inverse
    // devient injouable au moment précis où l'on en a besoin ; surtout,
    // `unknown` est l'état HONNÊTE d'une valeur qu'on ne sait plus nommer. La
    // repousser vers `direct` — le cas le plus fréquent — inventerait un chemin
    // commercial, et c'est exactement ce que le canal existe pour ne pas faire.
    await queryRunner.query(`UPDATE mission_commercial_terms SET channel = 'unknown' WHERE channel = 'portage'`)

    await queryRunner.query(
      `ALTER TABLE mission_commercial_terms DROP CONSTRAINT IF EXISTS mission_terms_channel_check`,
    )
    await queryRunner.query(`
      ALTER TABLE mission_commercial_terms ADD CONSTRAINT mission_terms_channel_check CHECK (
        channel IN ('direct', 'partner', 'subcontracting', 'unknown')
      )
    `)
  }
}
