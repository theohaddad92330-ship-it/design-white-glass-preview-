import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2123.46 — le responsable SAISI au formulaire du plan devient une colonne.
 *
 * L'action ajoutée depuis le plan vivait dans `raw_analysis.user_plan_actions`,
 * un objet JSON qui portait `text` ET `responsable`. En ramenant l'action sur
 * la ligne qui porte son statut (`action_plan_items`), ce champ n'avait aucune
 * colonne où atterrir : le passer à `assigned_to` aurait été faux (celui-là est
 * l'identifiant d'un MEMBRE de l'espace, il ouvre des droits et alimente « Mes
 * relances »), et le laisser tomber aurait perdu en silence ce que quelqu'un
 * avait écrit — le défaut que ce dépôt a déjà payé (« lire et écrire dans deux
 * tables différentes »).
 *
 * En AJOUT SEULEMENT, nullable et sans défaut : aucune ligne existante ne
 * change de sens, et `NULL` veut dire « aucun responsable saisi », ce qui n'est
 * pas une chaîne vide (GA-11 / GA-12 — la colonne existe avant le code qui
 * l'écrit).
 */
export class PlanActionOwnerName1794100592374 implements MigrationInterface {
  public name = 'PlanActionOwnerName1794100592374'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE action_plan_items ADD COLUMN IF NOT EXISTS owner_name text`)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
