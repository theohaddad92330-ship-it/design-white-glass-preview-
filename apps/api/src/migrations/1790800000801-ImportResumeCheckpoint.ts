import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Le point de reprise d'un import — angle mort n°6 du tome 8 §33.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI SE PASSAIT AVANT, MESURÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * `ImportService.writeSession` écrit les lignes une par une puis appelle
 * `markApplied` À LA FIN. Une exception à la ligne 4 000 sur 17 000 remontait
 * jusqu'au contrôleur, et `markApplied` n'était jamais atteint. Conséquences,
 * toutes simultanées :
 *
 *  · les 4 000 lignes restaient EN BASE, sans qu'aucune colonne le dise ;
 *  · `snapshot` restait `NULL` — l'instantané vivait dans une variable locale
 *    perdue avec la pile, donc **l'annulation devenait impossible** pour le cas
 *    exact où elle est faite (§12 du PDF 9, « un import détruit trois ans de
 *    données CRM ») ;
 *  · `created_count` restait à son DÉFAUT, `0` — et l'écran d'historique
 *    affichait « 0 créé » pour un import qui en avait créé 4 000. C'est le
 *    « non mesuré affiché zéro » que tout le dépôt combat, appliqué à une
 *    panne ;
 *  · `state` restait `simulated`, donc le bouton « Annuler cet import »
 *    n'apparaissait même pas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE MIGRATION PART AVANT LE CODE
 * ─────────────────────────────────────────────────────────────────────────────
 * **Une valeur qui voyage du code vers la base voit sa contrainte SQL élargie
 * AVANT le code qui l'écrit** (GA-11 / GA-12). `partial` est cette valeur. Les
 * cinq existantes sont recopiées EN TÊTE et DANS LEUR ORDRE — une liste retapée
 * depuis une migration périmée est ce qui a abandonné un déploiement le 21/08.
 *
 * ⚠️ `failed` figurait dans la contrainte et dans la taxonomie depuis le
 * 21/08/2026 et **n'a jamais été écrit par personne** : déclaré, jamais émis.
 * Il l'est à partir d'aujourd'hui, pour l'échec qui n'a rien laissé derrière
 * lui ; `partial` nomme celui qui a laissé quelque chose.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI `processed_rows` EST NULLABLE SANS DÉFAUT
 * ─────────────────────────────────────────────────────────────────────────────
 * Parce que « on ne sait pas combien de lignes ont été écrites » et « zéro
 * ligne a été écrite » sont deux faits différents, et que le second autorise
 * une reprise depuis la première ligne quand le premier l'interdit. Un
 * `DEFAULT 0` transformerait l'ignorance en certitude, et la reprise
 * redoublonnerait tout ce qui n'a pas de clé — un contact sans adresse, par
 * exemple, que `writeContacts` ne sait dédupliquer que par e-mail.
 */
export class ImportResumeCheckpoint1790800000801 implements MigrationInterface {
  name = 'ImportResumeCheckpoint1790800000801'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Le nombre de lignes du fichier réellement DURABLES en base. NULL = on ne
    // sait pas. Jamais 0 par défaut : voir le docblock.
    await queryRunner.query(`ALTER TABLE import_sessions ADD COLUMN IF NOT EXISTS processed_rows integer`)
    // La ligne sur laquelle l'écriture s'est arrêtée, et ce qu'on sait de son
    // sort : `failed` (rien n'est parti, rejouable) ou `unknown` (la requête est
    // partie sans réponse — la reprise automatique s'arrête).
    await queryRunner.query(`ALTER TABLE import_sessions ADD COLUMN IF NOT EXISTS failed_at_row integer`)
    await queryRunner.query(`ALTER TABLE import_sessions ADD COLUMN IF NOT EXISTS resume_outcome text`)
    // L'empreinte du fichier qui a été écrit. Sans elle, « reprendre à la ligne
    // 4 000 » n'a pas de sens : un numéro de ligne ne veut rien dire hors de son
    // fichier, et sauter 4 000 lignes d'un AUTRE fichier en perdrait 4 000, en
    // silence.
    await queryRunner.query(`ALTER TABLE import_sessions ADD COLUMN IF NOT EXISTS content_fingerprint text`)
    // Le nombre de lignes que le fichier portait. Il permet de dire « arrêté à
    // la 4 000e sur 17 000 » plutôt que « arrêté ».
    await queryRunner.query(`ALTER TABLE import_sessions ADD COLUMN IF NOT EXISTS total_rows integer`)

    await queryRunner.query(`ALTER TABLE import_sessions DROP CONSTRAINT IF EXISTS import_sessions_state_check`)
    await queryRunner.query(`
      ALTER TABLE import_sessions ADD CONSTRAINT import_sessions_state_check CHECK (
        state IN ('draft', 'simulated', 'applied', 'rolled_back', 'failed', 'partial')
      )
    `)
    await queryRunner.query(`
      ALTER TABLE import_sessions ADD CONSTRAINT import_sessions_resume_outcome_check CHECK (
        resume_outcome IS NULL OR resume_outcome IN ('failed', 'unknown')
      )
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // ⚠️ On RAMÈNE les sessions interrompues vers `failed` avant de resserrer.
    // Les resserrer sans les déplacer laisserait des lignes qui violent la
    // contrainte qu'on vient de reposer — et une session interrompue rangée en
    // `failed` reste plus vraie qu'une session supprimée : on archive, on ne
    // supprime pas.
    await queryRunner.query(`UPDATE import_sessions SET state = 'failed' WHERE state = 'partial'`)
    await queryRunner.query(
      `ALTER TABLE import_sessions DROP CONSTRAINT IF EXISTS import_sessions_resume_outcome_check`,
    )
    await queryRunner.query(`ALTER TABLE import_sessions DROP CONSTRAINT IF EXISTS import_sessions_state_check`)
    await queryRunner.query(`
      ALTER TABLE import_sessions ADD CONSTRAINT import_sessions_state_check CHECK (
        state IN ('draft', 'simulated', 'applied', 'rolled_back', 'failed')
      )
    `)
    await queryRunner.query(`ALTER TABLE import_sessions DROP COLUMN IF EXISTS total_rows`)
    await queryRunner.query(`ALTER TABLE import_sessions DROP COLUMN IF EXISTS content_fingerprint`)
    await queryRunner.query(`ALTER TABLE import_sessions DROP COLUMN IF EXISTS resume_outcome`)
    await queryRunner.query(`ALTER TABLE import_sessions DROP COLUMN IF EXISTS failed_at_row`)
    await queryRunner.query(`ALTER TABLE import_sessions DROP COLUMN IF EXISTS processed_rows`)
  }
}
