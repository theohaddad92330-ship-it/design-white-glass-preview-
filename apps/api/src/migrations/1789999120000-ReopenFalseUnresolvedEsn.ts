import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Rendre leur chance aux ESN que la limite de débit avait condamnées.
 *
 * Mesuré en production le 23/08/2026 : le registre renvoyait des « 429 Too Many
 * Requests » en rafale pendant le remplissage du référentiel. Le code repliait
 * chaque 429 en « aucun résultat », et le résolveur en tirait le verdict
 * « Aucune entité du registre français ne correspond à ce nom ». Des sociétés
 * qui existent — Cognizant, Comarch, Computacenter, Conserto… — sont donc
 * marquées introuvables, et `resolution_status = 'unresolved'` n'est jamais
 * reconsidéré.
 *
 * Le correctif de code empêche que ça se reproduise. Il ne répare pas les
 * lignes déjà écrites : elles portent un verdict faux, et le référentiel
 * annonce une couverture qu'il n'a pas.
 *
 * ⚠️ On ne remet en file QUE le motif exact produit par ce chemin. Les
 * `unresolved` portant une AUTRE raison — et les `ambiguous`, les `foreign` —
 * sont des verdicts que quelqu'un ou quelque chose a réellement tranchés :
 * les rouvrir en masse ferait re-interroger le registre pour des noms dont on
 * connaît déjà la réponse, ce qui est précisément ce qui a causé les 429.
 */
export class ReopenFalseUnresolvedEsn1789999120000 implements MigrationInterface {
  name = 'ReopenFalseUnresolvedEsn1789999120000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    const reopened = await queryRunner.query(`
      UPDATE esn_directory
         SET resolution_status = 'pending',
             resolution_reason = NULL,
             updated_at = now()
       WHERE resolution_status = 'unresolved'
         AND resolution_reason = 'Aucune entité du registre français ne correspond à ce nom.'
      RETURNING id
    `)
    const count = Array.isArray(reopened) ? (Array.isArray(reopened[0]) ? reopened[0].length : reopened.length) : 0
    // Journalisé : six mois plus tard, « pourquoi ces lignes ont-elles été
    // rouvertes ? » doit avoir une réponse ailleurs que dans un diff.
    console.info(`[migration] ${count} ESN remises en file après la rafale de 429 du 23/08/2026`)
  }

  public async down(): Promise<void> {
    // Irréversible par nature, et sans dommage : le balayage horaire les
    // reprendra et écrira le verdict que le registre donnera réellement. Les
    // remettre en `unresolved` réinstallerait le mensonge.
  }
}
