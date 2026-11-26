import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * LE LIEN BESOIN → MISSION (`missions.need_id`) — arbitrage de Louis, 31/08/2026.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'IL FERME
 * ─────────────────────────────────────────────────────────────────────────────
 * Le bandeau « Staffing » d'une fiche besoin porte quatre chiffres (dossier du
 * 26/08, image 02). Trois se dérivaient déjà des positionnements ; le
 * quatrième — « mission attribuée » — était rendu « non mesuré », et la raison
 * écrite dans `need-staffing.ts` était JUSTE : une mission ne portait que
 * `opportunity_id`, c'est-à-dire l'identité du PROJET. Or un projet porte
 * souvent plusieurs rôles. Compter les missions du projet sous UN besoin aurait
 * attribué à un rôle précis un chiffre qui appartient à l'affaire entière.
 *
 * Louis a tranché : plutôt que de garder un « non mesuré » définitif, on POSE le
 * lien manquant. La colonne est le MOYEN ; le reste du lot est ce qui la
 * remplit (`ProjectsController.applyStageActions`, geste `create_mission`) et ce
 * qui la lit (`OpenNeedsService.list`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NULLABLE, ET ELLE LE RESTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Trois populations distinctes portent `NULL`, et aucune ne vaut « zéro
 * mission » :
 *
 *  1. **les missions déjà créées** — elles sont nées avant ce lien. Aucune
 *     reprise ne peut le deviner : rien en base ne dit LEQUEL des rôles d'une
 *     affaire cette mission a pourvu, et le deviner à partir du seul besoin
 *     ouvert au moment de la conversion serait une donnée inventée ;
 *  2. **les missions d'un projet qui porte PLUSIEURS besoins** — le geste
 *     `create_mission` ne remplit le lien que lorsque l'affaire ne porte qu'un
 *     seul rôle, parce que c'est le seul cas où la réponse est certaine ;
 *  3. **les missions créées à la main** (`POST /missions`), où personne n'a
 *     désigné de besoin.
 *
 * L'écran DIT cette différence : « aucune mission liée » (un vrai zéro) et
 * « des missions existent sur l'affaire, aucune ne porte l'identité d'un rôle »
 * (non mesuré) sont deux phrases distinctes — voir `deriveNeedStaffingBand`.
 *
 * `ON DELETE SET NULL` : supprimer un besoin ne supprime pas la mission qui en
 * est née. La mission redevient « rôle d'origine inconnu », un état honnête ;
 * la faire disparaître effacerait une facturation en cours.
 *
 * ⚠️ Aucune contrainte `CHECK` ici — `need_id` est une référence, pas une
 * énumération. Il n'y a donc rien à inscrire au `MAPPING` de
 * `check-constraints-cover-enums.spec.ts`.
 */
export class MissionNeedLink1791001000001 implements MigrationInterface {
  public name = 'MissionNeedLink1791001000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE missions
        ADD COLUMN IF NOT EXISTS need_id uuid REFERENCES project_needs(id) ON DELETE SET NULL
    `)
    // L'index sert la lecture du bandeau : « combien de missions portent CE
    // besoin » est posée une fois par fiche ouverte, et une fois par ligne de la
    // liste des besoins ouverts. Sans index, c'est un balayage de `missions` par
    // ligne affichée.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_missions_need_id ON missions (need_id)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_missions_need_id`)
    await queryRunner.query(`ALTER TABLE missions DROP COLUMN IF EXISTS need_id`)
  }
}
