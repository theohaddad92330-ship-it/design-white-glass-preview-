import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Le placement en CDI chez le client, déclaré au profil ESN (#1124).
 *
 * « Je propose aussi à mes clients du recrutement de profil IT en fixe chez
 * eux. Donc si tu peux me sortir les annonces de postes comme ça, je suis assez
 * refait. »
 *
 * Une colonne comme toutes les autres réponses du questionnaire — le profil
 * n'a pas de blob : chaque réponse a sa colonne, et l'écriture passe par le
 * `merge` de l'entité. Sans elle, la réponse serait acceptée par le contrat,
 * routée par le service, et perdue à l'écriture.
 *
 * TEXT et non booléen : la réponse porte trois états — `yes`, `no`, et pas de
 * réponse. Un booléen NULLABLE les porterait aussi, mais toutes les réponses
 * voisines sont du texte, et une colonne d'un type différent pour la seule
 * question binaire du questionnaire serait une exception à expliquer à chaque
 * lecture. Aucune contrainte CHECK : c'est le zod du contrat qui borne
 * (`yes`/`no`), et une valeur inconnue y dégrade en `null` plutôt que de faire
 * échouer la lecture d'un profil entier.
 *
 * Additive et idempotente. `NULL` = pas de réponse = comportement d'avant, à
 * l'octet près, pour tous les espaces existants.
 */
export class EsnRecruitsForClients1790127493618 implements MigrationInterface {
  public name = 'EsnRecruitsForClients1790127493618'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS recruits_for_clients text`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE esn_profiles DROP COLUMN IF EXISTS recruits_for_clients`)
  }
}
