import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2777 — LA MÉMOIRE DU COMPTE (sortie 9 de la cascade compte rendu).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI MANQUAIT
 * ─────────────────────────────────────────────────────────────────────────────
 * `learnings` (une objection entendue, un engagement pris) rendait toujours
 * `blocked` / « il manque : la mémoire du compte » : aucune table, aucun
 * service ne portait cette capacité. `memory.service.ts` existe déjà, mais
 * c'est la mémoire CONVERSATIONNELLE de Laura — pas un fait tenu par le
 * compte lui-même, relisible depuis sa fiche.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * BANDE `n4_bounded_auto` — POURQUOI CETTE TABLE S'ÉCRIT SANS FILE DE VALIDATION
 * ─────────────────────────────────────────────────────────────────────────────
 * `MEETING_OUTPUT_AUTOMATION_LEVEL.learnings` (`meeting-notes.ts`) vaut
 * `n4_bounded_auto` : le copilote agit seul, dans ses bornes, parce qu'il ne
 * touche rien d'EXTÉRIEUR — ni CRM, ni ERP, ni personne. Le clic de validation
 * du lot (la carte « apprentissages », sur l'écran de cascade) EST le geste
 * utilisateur qui autorise l'écriture, exactement comme `contacts` : aucune
 * porte BEL-INT-603 ne s'applique ici, elle ne gouverne que les écritures
 * CRM/ERP.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ON ARCHIVE, ON NE SUPPRIME PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Aucune colonne de suppression : rien dans ce lot ne réécrit ni ne retire une
 * ligne, donc aucun état à nommer pour un geste qui n'existe pas encore
 * (YAGNI) — une future capacité de correction ajoutera sa propre colonne, à ce
 * moment-là.
 */
export class AccountMemory1796321340147 implements MigrationInterface {
  name = 'AccountMemory1796321340147'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS account_memory (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        account_id uuid NOT NULL,
        user_id uuid NOT NULL,
        kind text NOT NULL,
        content text NOT NULL,
        -- D'où vient cet apprentissage. 'meeting' aujourd'hui — même
        -- vocabulaire que contacts.source (#2777, MeetingContactSource) —
        -- nullable pour une future origine non tracée, jamais un défaut deviné.
        source text,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT account_memory_kind_check CHECK (kind IN ('objection', 'commitment'))
      )
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS account_memory_account_idx
        ON account_memory (workspace_id, account_id, created_at DESC)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS account_memory`)
  }
}
