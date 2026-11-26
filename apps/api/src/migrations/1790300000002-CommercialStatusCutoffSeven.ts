import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * D44 (Louis, 28/08/2026) — LE TRI COMMERCIAL COUPE OÙ LA BANDE DE SCORE COUPE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI ÉTAIT FAUX
 * ─────────────────────────────────────────────────────────────────────────────
 * Le pré-classement commercial coupait à 7,5 (`markCompleted` et le backfill de
 * `1784900100000-CommercialStatus`) là où la bande de score coupe à 7
 * (`ACCOUNT_SCORE_GO_MIN`). Les deux nombres avaient la même origine ; l'un a
 * bougé sans l'autre. Ce que l'utilisateur VOYAIT : un compte noté 7 affiché
 * « GO » et rangé « À suivre ».
 *
 * Louis a aligné sur 7, parce que la bande est ce que l'utilisateur voit. Le
 * code lie désormais `COMMERCIAL_OPPORTUNITY_SCORE_MIN`, qui EST
 * `ACCOUNT_SCORE_GO_MIN` — plus deux nombres, un seul.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE MIGRATION, ET PAS SEULEMENT DU CODE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le nouveau code ne s'applique qu'aux runs FUTURS : `markCompleted` ne
 * repasse jamais sur un compte déjà terminé. Sans ce reclassement, les comptes
 * déjà analysés resteraient rangés selon l'ancienne coupure et la base
 * démentirait l'écran — exactement le défaut qu'on corrige, mais figé.
 *
 * `commercial_status` est une colonne `text` SANS contrainte CHECK et
 * `'opportunity'` y est déjà écrit tous les jours : rien à élargir avant
 * d'écrire (la règle « la contrainte s'élargit AVANT le code » ne mord pas ici,
 * faute de contrainte).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI BASCULE, EXACTEMENT
 * ─────────────────────────────────────────────────────────────────────────────
 * `commercial_status = 'watching'` ET score dans [7 ; 7,5[ → `'opportunity'`.
 * C'est, mot pour mot, la population que l'ANCIENNE règle rangeait en bas et
 * que la NOUVELLE range en haut. `priority_score` est une colonne `INTEGER`
 * (`1767225600000-Init`) : dans les faits, cet intervalle ne contient qu'une
 * valeur, **7**. La borne est écrite en intervalle quand même — elle dit la
 * règle, pas le type de la colonne du jour.
 *
 * Aucune autre case ne bouge : `inbox`, `customer` et `archived` sont des états
 * que personne ne dérive d'un score. `merged_previous_commercial_status` n'est
 * PAS touchée non plus : c'est l'état ENREGISTRÉ d'un compte absorbé, que le
 * détachement restitue tel quel — le réécrire rendrait au commercial un statut
 * choisi par nous.
 *
 * ⚠️ CE QUE CETTE MIGRATION NE PEUT PAS SAVOIR — et c'est assumé (Louis) :
 * rien n'enregistre QUI a rangé un compte en « À suivre ». Un compte noté 7 que
 * le commercial avait lui-même redescendu depuis « Opportunité » est
 * indiscernable d'un compte que l'ancienne coupure y avait mis. Il remontera.
 * C'est le prix du réalignement, il est annoncé, et le `down()` le rejoue à
 * l'envers.
 *
 * Le nombre de comptes déplacés est JOURNALISÉ : dans six mois, « pourquoi ce
 * compte a-t-il changé de colonne ? » doit avoir une réponse ailleurs que dans
 * un diff.
 */
export class CommercialStatusCutoffSeven1790300000002 implements MigrationInterface {
  name = 'CommercialStatusCutoffSeven1790300000002'

  public async up(queryRunner: QueryRunner): Promise<void> {
    const moved = await queryRunner.query(`
      UPDATE accounts
         SET commercial_status = 'opportunity'
       WHERE commercial_status = 'watching'
         AND priority_score >= 7
         AND priority_score < 7.5
      RETURNING id
    `)
    console.info(`[migration] D44 — ${rowCount(moved)} compte(s) passent de « À suivre » à « Opportunité »`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const moved = await queryRunner.query(`
      UPDATE accounts
         SET commercial_status = 'watching'
       WHERE commercial_status = 'opportunity'
         AND priority_score >= 7
         AND priority_score < 7.5
      RETURNING id
    `)
    console.info(`[migration] D44 (down) — ${rowCount(moved)} compte(s) reviennent à « À suivre »`)
  }
}

/**
 * Compte les lignes d'un `UPDATE … RETURNING`.
 *
 * ⚠️ Le pilote rend tantôt les lignes, tantôt le COUPLE `[lignes, nbAffectées]`
 * selon le chemin (transaction, driver). Un `result.length` naïf compte alors
 * `2` — un tableau truthy qui ne dit rien. Défaut déjà payé dans ce dépôt.
 */
function rowCount(result: unknown): number {
  if (!Array.isArray(result)) return 0
  return Array.isArray(result[0]) ? result[0].length : result.length
}
