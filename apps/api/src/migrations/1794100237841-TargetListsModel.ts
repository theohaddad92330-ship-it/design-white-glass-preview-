import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2156.5 à .48 — le MODÈLE d'une cible commerciale (« Mes cibles »).
 *
 * `1793700400000-TargetLists` a posé les deux tables et le fait qu'un élément
 * RÉFÉRENCE une fiche. Cette migration-ci pose le reste du modèle, et rien
 * d'autre : porte « ajout seulement », aucune colonne retirée, aucune valeur
 * d'énumération perdue.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ELLE PASSE AVANT LE CODE QUI ÉCRIT (GA-11 / GA-12)
 * ─────────────────────────────────────────────────────────────────────────────
 * Les quatre statuts d'élément ajoutés (#2156.42 / .43 / .45 / .46) sont
 * contraints ICI, dans une migration antérieure au service qui les écrira. Le
 * défaut inverse a déjà coûté un déploiement : une contrainte qui ignore une
 * valeur rejette l'écriture en fin de course, et l'utilisateur lit « impossible »
 * sans que rien ne dise pourquoi.
 *
 * Les cinq valeurs de `work_status` déjà écrites en base gardent leur place et
 * leur rang — `to_review` reste le défaut (GA-08). Les quatre nouvelles vont EN
 * FIN de liste. `contacted` n'est pas dans les huit statuts demandés par #2156 :
 * elle reste quand même, parce que des lignes la portent (démo comprise) et
 * qu'une valeur écrite ne se retire pas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES DÉFAUTS SONT CHOISIS POUR NE RIEN CHANGER AUX LIGNES EXISTANTES
 * ─────────────────────────────────────────────────────────────────────────────
 * · `visibility` → `'workspace'` : c'est EXACTEMENT ce que fait le service
 *   aujourd'hui (il filtre par espace). Poser `'private'` par défaut ferait
 *   disparaître des listes partagées sous les yeux de leur espace.
 * · `status` → `'draft'` : une liste dont personne n'a jamais posé le statut
 *   n'est pas « en cours » — on ne sait pas, et « brouillon » est l'entrée du
 *   parcours, pas une affirmation sur son avancement.
 * · `source` → `'manual'` : les listes existantes ont toutes été créées à la
 *   main depuis l'écran.
 *
 * `removed_at` / `removal_reason` (#2156.31) sont la doctrine « on archive, on
 * ne supprime pas » descendue dans le modèle : retirer un élément d'une liste
 * pose une date et un motif, la ligne reste. C'est pourquoi les deux index
 * uniques sont recréés en ignorant les éléments retirés — sans quoi la même
 * fiche ne pourrait plus jamais revenir dans la liste dont on l'a sortie.
 *
 * `prospecting_session_id` (#2156.22) n'a PAS de clé étrangère : aucune table de
 * session de prospection n'existe encore dans ce dépôt. La contrainte se posera
 * avec la table ; inventer la référence maintenant ferait échouer la migration.
 */
export class TargetListsModel1794100237841 implements MigrationInterface {
  name = 'TargetListsModel1794100237841'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── La liste (#2156.9 à .22) ───────────────────────────────────────────
    await queryRunner.query(`ALTER TABLE target_lists ADD COLUMN IF NOT EXISTS owner_user_id uuid NULL`)
    await queryRunner.query(`ALTER TABLE target_lists ADD COLUMN IF NOT EXISTS team text NULL`)
    await queryRunner.query(
      `ALTER TABLE target_lists ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'workspace'`,
    )
    await queryRunner.query(`ALTER TABLE target_lists ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual'`)
    await queryRunner.query(`ALTER TABLE target_lists ADD COLUMN IF NOT EXISTS source_query jsonb NULL`)
    await queryRunner.query(`ALTER TABLE target_lists ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft'`)
    await queryRunner.query(`ALTER TABLE target_lists ADD COLUMN IF NOT EXISTS next_action text NULL`)
    await queryRunner.query(
      `ALTER TABLE target_lists ADD COLUMN IF NOT EXISTS sequence_id uuid NULL REFERENCES outreach_sequences(id) ON DELETE SET NULL`,
    )
    await queryRunner.query(`ALTER TABLE target_lists ADD COLUMN IF NOT EXISTS prospecting_session_id uuid NULL`)

    await queryRunner.query(`ALTER TABLE target_lists DROP CONSTRAINT IF EXISTS target_lists_status_check`)
    await queryRunner.query(`
      ALTER TABLE target_lists ADD CONSTRAINT target_lists_status_check
        CHECK (status IN ('draft', 'to_qualify', 'ready', 'in_progress', 'paused', 'done', 'archived'))
    `)
    await queryRunner.query(`ALTER TABLE target_lists DROP CONSTRAINT IF EXISTS target_lists_visibility_check`)
    await queryRunner.query(`
      ALTER TABLE target_lists ADD CONSTRAINT target_lists_visibility_check
        CHECK (visibility IN ('workspace', 'private'))
    `)
    await queryRunner.query(`ALTER TABLE target_lists DROP CONSTRAINT IF EXISTS target_lists_source_check`)
    await queryRunner.query(`
      ALTER TABLE target_lists ADD CONSTRAINT target_lists_source_check
        CHECK (source IN ('manual', 'discover', 'import', 'analysis', 'saved_search'))
    `)

    // ── L'élément (#2156.24 à .33) ─────────────────────────────────────────
    await queryRunner.query(`ALTER TABLE target_list_items ADD COLUMN IF NOT EXISTS selection_reason text NULL`)
    await queryRunner.query(`ALTER TABLE target_list_items ADD COLUMN IF NOT EXISTS refreshed_at timestamptz NULL`)
    await queryRunner.query(`ALTER TABLE target_list_items ADD COLUMN IF NOT EXISTS removed_at timestamptz NULL`)
    await queryRunner.query(`ALTER TABLE target_list_items ADD COLUMN IF NOT EXISTS removal_reason text NULL`)
    await queryRunner.query(`ALTER TABLE target_list_items ADD COLUMN IF NOT EXISTS notes text NULL`)

    // ── Les huit statuts d'élément (#2156.41 à .48) ────────────────────────
    await queryRunner.query(
      `ALTER TABLE target_list_items DROP CONSTRAINT IF EXISTS target_list_items_work_status_check`,
    )
    await queryRunner.query(`
      ALTER TABLE target_list_items ADD CONSTRAINT target_list_items_work_status_check
        CHECK (work_status IN ('to_review', 'in_progress', 'contacted', 'done', 'dropped',
                               'to_enrich', 'ready_to_contact', 'replied', 'to_follow_up'))
    `)

    // Un élément RETIRÉ reste en base (#2156.31) : il ne doit plus interdire le
    // ré-ajout de la même fiche dans la même liste.
    await queryRunner.query(`DROP INDEX IF EXISTS target_list_items_list_account_uniq`)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS target_list_items_list_account_uniq
        ON target_list_items (target_list_id, account_id)
        WHERE account_id IS NOT NULL AND removed_at IS NULL
    `)
    await queryRunner.query(`DROP INDEX IF EXISTS target_list_items_list_contact_uniq`)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS target_list_items_list_contact_uniq
        ON target_list_items (target_list_id, contact_id)
        WHERE contact_id IS NOT NULL AND removed_at IS NULL
    `)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS target_list_items_live_idx ON target_list_items (target_list_id) WHERE removed_at IS NULL`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Le `down` ne retire QUE ce que ce `up` a ajouté, et laisse les deux tables
    // en place : elles appartiennent à la migration précédente.
    for (const column of [
      'owner_user_id',
      'team',
      'visibility',
      'source',
      'source_query',
      'status',
      'next_action',
      'sequence_id',
      'prospecting_session_id',
    ]) {
      await queryRunner.query(`ALTER TABLE target_lists DROP COLUMN IF EXISTS ${column}`)
    }
    for (const column of ['selection_reason', 'refreshed_at', 'removed_at', 'removal_reason', 'notes']) {
      await queryRunner.query(`ALTER TABLE target_list_items DROP COLUMN IF EXISTS ${column}`)
    }
  }
}
