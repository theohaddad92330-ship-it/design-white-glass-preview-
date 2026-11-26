import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2558.1 — UN BESOIN EXISTE SANS PROJET.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE RETOUR, ET POURQUOI IL EST JUSTE
 * ─────────────────────────────────────────────────────────────────────────────
 * François Thomas, call bêta du 17/09/2026 : la majorité des missions d'ESN ne
 * produisent AUCUN signal public. Un besoin qui n'existe qu'attaché à un
 * « projet » force à inventer un projet pour chaque mission de régie —
 * c'est-à-dire à créer de la donnée vide pour satisfaire une contrainte
 * technique. `#2558.2` (créer le projet SANS sortir du parcours, livré le
 * 16/09) ne couvre pas ce cas : il n'y a rien à créer.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI SE JOUE ICI, ET QUI N'EST PAS « UNE COLONNE NULLABLE »
 * ─────────────────────────────────────────────────────────────────────────────
 * `project_needs.project_id` était `uuid NOT NULL REFERENCES opportunities(id)`
 * (`1789344812907-ProjectPivot`). Ce `NOT NULL` ne servait pas qu'à rattacher
 * un besoin à un projet : il portait l'UNIQUE chemin d'un besoin vers son
 * COMPTE, via `opportunities.account_id`. Le relâcher sans rien mettre à la
 * place rendrait des besoins orphelins — joignables par personne, invisibles
 * sur tous les écrans, et invisibles en CI.
 *
 * Donc : on n'enlève pas un invariant, on le DÉPLACE. `account_id` devient le
 * vrai lien, et c'est LUI qui est `NOT NULL`. Un besoin sans compte n'a aucun
 * sens ; un besoin sans projet, si.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'ORDRE, QUI EST LA SEULE CHOSE QUI NE SE RATTRAPE PAS (GA-11 / GA-12)
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. `ADD COLUMN` sans `NOT NULL` — la colonne naît vide ;
 *  2. le REPORT de l'existant depuis `opportunities.account_id` ;
 *  3. `SET NOT NULL` — et pas avant : l'inverse abandonne le déploiement sur
 *     la première ligne existante (`migration:run:prod` est le
 *     `preDeployCommand` de Railway) ;
 *  4. la clé étrangère et l'index ;
 *  5. `project_id DROP NOT NULL` — en DERNIER, quand le chemin de secours est
 *     déjà posé. Aucune requête applicative ne peut écrire un besoin sans
 *     projet avant que ces instructions ne soient passées.
 *
 * Le report est fait ICI, pas dans du code applicatif qui pourrait ne jamais
 * tourner — et il est TOTAL par construction : `opportunities.account_id` est
 * lui-même `uuid NOT NULL` (`1787900000000-Opportunities:31`), et
 * `project_id` était `NOT NULL` avec `ON DELETE CASCADE`. Aucune ligne ne peut
 * rester sans compte, donc le `SET NOT NULL` de l'étape 3 ne peut pas échouer.
 *
 * ⚠️ ON ARCHIVE, ON NE SUPPRIME PAS : rien n'est effacé, aucune colonne n'est
 * retirée, et `project_id` reste RENSEIGNÉ pour tous les besoins qui en
 * avaient un. Cette migration n'enlève aucune information — elle en ajoute une
 * et desserre une contrainte. `down` non supporté (convention du dépôt).
 */
export class NeedWithoutProject1795711263408 implements MigrationInterface {
  public name = 'NeedWithoutProject1795711263408'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Additive et idempotente. Sans `NOT NULL` : la colonne naît vide.
    await queryRunner.query(`
      ALTER TABLE project_needs
        ADD COLUMN IF NOT EXISTS account_id uuid
    `)

    // 2. LE REPORT. Chaque besoin déjà en base reçoit le compte de son projet.
    //    `IS NULL` en garde : la migration se rejoue sans réécrire une valeur
    //    qu'un humain aurait corrigée entre-temps — une correction humaine
    //    gagne toujours, quelle que soit sa date.
    await queryRunner.query(`
      UPDATE project_needs n
        SET account_id = o.account_id
        FROM opportunities o
        WHERE o.id = n.project_id
          AND n.account_id IS NULL
    `)

    // 3. L'INVARIANT QUI REMPLACE CELUI QU'ON RETIRE. Un besoin sans compte
    //    n'a aucun sens : on ne remplace pas une contrainte par rien.
    await queryRunner.query(`
      ALTER TABLE project_needs
        ALTER COLUMN account_id SET NOT NULL
    `)

    // 4. Même forme que `project_id` avant lui : le besoin disparaît avec le
    //    compte, jamais l'inverse. `DROP … IF EXISTS` puis `ADD` — une
    //    contrainte ne se remplace pas en place.
    await queryRunner.query(`
      ALTER TABLE project_needs
        DROP CONSTRAINT IF EXISTS project_needs_account_fk
    `)
    await queryRunner.query(`
      ALTER TABLE project_needs
        ADD CONSTRAINT project_needs_account_fk
        FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    `)

    // L'espace d'abord : toutes les lectures filtrent par `workspace_id` avant
    // de filtrer par compte — c'est la garde, elle doit mener l'index.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS project_needs_account_idx
        ON project_needs (workspace_id, account_id)
    `)

    // 5. ENFIN. Le chemin de secours est posé, le projet peut devenir absent.
    await queryRunner.query(`
      ALTER TABLE project_needs
        ALTER COLUMN project_id DROP NOT NULL
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
