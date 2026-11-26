import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2105.53 (correctif, épopée #2946) — l'identité de la carte du brief dont
 * une tâche vient, pour que `BriefingService.allActions` puisse la comparer
 * SANS traduire (le serveur n'a pas de dictionnaire de traduction, voir
 * `briefing-labels.spec.ts` — matcher le TEXTE affiché y aurait obligé
 * l'API à en gagner un, une seconde vérité GA-26).
 *
 * Texte libre, nullable, sans CHECK — même convention que `expected_result`
 * (migration `TaskSourceAndExpectedResult1796001512041`) : ce n'est pas une
 * énumération, et jamais affichée à l'écran.
 *
 * ⚠️ Avant cette tranche, la garde de dédup (#2105.53) ne comparait que côté
 * client (`briefingActionHasOpenTask`, texte traduit) : une carte déjà
 * transformée restait dans la liste du serveur, seulement annotée « déjà
 * transformée » au rendu. Cette colonne est ce que le PRODUCTEUR du brief lit
 * pour la retirer lui-même de la liste — aucun appelant ne la pose encore
 * (`TasksService.create` le fera dans cette même tranche, `ActionsBlock.tsx`
 * dans la foulée) : pas une capacité fantôme, la fondation posée AVANT le
 * code qui l'écrit et la lit, comme `related_action_run_id` l'a déjà été.
 */
export class TaskSourceLabelKey1796321400417 implements MigrationInterface {
  public name = 'TaskSourceLabelKey1796321400417'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS source_label_key text`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE tasks DROP COLUMN IF EXISTS source_label_key`)
  }
}
