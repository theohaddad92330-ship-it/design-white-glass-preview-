import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Le compte qu'on a analysé devient le compte dont on est RESPONSABLE — #1408.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT
 * ─────────────────────────────────────────────────────────────────────────
 * Deux écrans répondaient à « mes comptes » et ne répondaient pas la même
 * chose : le cockpit personnel filtrait sur le CRÉATEUR (`accounts.user_id`),
 * la liste des comptes sur le RESPONSABLE (`accounts.assigned_to`). Un mot,
 * deux populations — la famille « même nom, forme différente », celle qui a
 * produit au lot 6 une tuile annonçant 2 devant un filtre rendant zéro ligne.
 *
 * La cause n'était dans aucun des deux écrans. Elle était dans la CRÉATION :
 * `AccountsService.create()` — le chemin de l'analyse, donc l'immense majorité
 * des comptes — posait `user_id` et jamais `assigned_to`. Analyser une
 * entreprise ne rendait personne responsable d'elle. Seul « Ajouter au
 * portefeuille » attribuait, et il est arrivé bien plus tard.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE MIGRATION FAIT, ET CE QU'ELLE NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────
 * Elle reprend le STOCK : tout compte sans responsable est attribué à celui qui
 * l'a créé. C'est la seule attribution que la base puisse justifier — elle ne
 * DEVINE personne, elle recopie un fait déjà écrit.
 *
 * ⚠️ Elle ne touche AUCUNE ligne déjà attribuée. Une correction humaine gagne
 * toujours, quelle que soit sa date : un compte qu'un manager a réassigné à
 * quelqu'un d'autre garde son responsable, même si le créateur est un autre.
 * C'est la clause `WHERE assigned_to IS NULL`, et c'est tout ce qu'elle
 * protège.
 *
 * ⚠️ Elle ne touche pas non plus les comptes supprimés : les ressusciter dans
 * un portefeuille serait un effet de bord que personne n'a demandé.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI ELLE PASSE AVANT LE CODE QUI LIT (GA-11 / GA-12)
 * ─────────────────────────────────────────────────────────────────────────
 * Le cockpit bascule sur `assigned_to` dans le même lot. Déployer ce code sur
 * une base non reprise viderait le portefeuille de tout le monde : chaque
 * compte né d'une analyse aurait `assigned_to IS NULL`. L'ordre n'est donc pas
 * une précaution de style, c'est la différence entre un écran juste et un écran
 * vide.
 *
 * Effet de bord VOULU, côté équipe : le cockpit manager cesse de compter comme
 * « zone blanche » (#1460) des comptes qu'un commercial travaille visiblement
 * depuis des semaines. Le chiffre des comptes sans responsable devient enfin
 * une mesure de ce qu'il prétend mesurer.
 *
 * Pas de `down` qui défait l'attribution : on ne peut pas distinguer, après
 * coup, une ligne reprise ici d'une ligne attribuée à la main le lendemain.
 * Remettre `NULL` partout détruirait le travail humain qui a suivi — et « une
 * correction humaine gagne toujours » vaut aussi contre un rollback.
 */
export class BackfillAccountAssignedTo1791608123457 implements MigrationInterface {
  public name = 'BackfillAccountAssignedTo1791608123457'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE accounts
          SET assigned_to = user_id
        WHERE assigned_to IS NULL
          AND user_id IS NOT NULL
          AND status <> 'deleted'`,
    )
  }

  public async down(): Promise<void> {
    // Volontairement vide — voir l'en-tête : rien ne distingue une ligne reprise
    // ici d'une attribution humaine postérieure, et les annuler toutes détruirait
    // la seconde.
  }
}
