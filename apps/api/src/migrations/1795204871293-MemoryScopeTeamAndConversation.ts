import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #1918.2 / #1918.5 — DEUX PORTÉES DE PLUS POUR UN ÉLÉMENT DE MÉMOIRE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE MIGRATION OUVRE, ET CE QU'ELLE N'OUVRE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * `memory_pinned_facts.scope` connaissait deux valeurs (`1792800070000`) :
 * « moi » et « tout l'espace ». Entre les deux il manquait le PÉRIMÈTRE DE
 * TRAVAIL (#1918.2 — « Mon équipe / ma BU »), et en dessous il manquait le FIL
 * (#1918.5 — « une conversation temporaire »).
 *
 * ⚠️ `business_unit` ne s'appuie sur AUCUN libellé déclaratif. Une BU citée
 * dans une réponse de questionnaire (`EsnAnswers`) est un mot, pas un objet qui
 * a des membres : une portée branchée dessus ne filtrerait rien et mentirait
 * sur ce qu'elle promet. Elle s'appuie sur `business_unit_members`
 * (`1793710000000-BusinessUnits`), la SEULE table du dépôt qui dit qui fait
 * partie de quoi — d'où la colonne `business_unit_id` : l'élément DÉSIGNE un
 * périmètre, il ne se contente pas de dire « mon équipe ».
 *
 * ⚠️ `conversation` désigne un fil, avec la MÊME clé que les autres mémoires de
 * fil (`conversation_summaries.conversation_id`, dérivée par `conversationKey`).
 * Un texte, pas un uuid : le fil par défaut s'appelle `general` et un fil de
 * compte `account:<uuid>`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'ORDRE, QUI EST LA SEULE CHOSE QUI NE SE RATTRAPE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * GA-11 / GA-12 : la contrainte connaît les QUATRE valeurs AVANT que le code
 * n'en écrive une. Écrit dans l'autre ordre, la production rejette l'insertion
 * et le défaut n'apparaît qu'en ligne — `migration:run:prod` étant le
 * `preDeployCommand` de Railway, un `ADD CONSTRAINT` qui échoue ABANDONNE le
 * déploiement sans que l'application dise quoi que ce soit.
 *
 * `DROP CONSTRAINT IF EXISTS` puis `ADD` : une contrainte ne se remplace pas
 * en place, et la nouvelle liste est un SUR-ENSEMBLE de l'ancienne (GA-11 le
 * vérifie fichier par fichier).
 *
 * Additive et idempotente : `ADD COLUMN IF NOT EXISTS` sans défaut ni
 * `NOT NULL` — aucune ligne existante n'est réécrite, AUCUN backfill, aucune
 * visibilité changée en silence. `down` non supporté (convention du dépôt).
 */
export class MemoryScopeTeamAndConversation1795204871293 implements MigrationInterface {
  public name = 'MemoryScopeTeamAndConversation1795204871293'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE memory_pinned_facts
        ADD COLUMN IF NOT EXISTS conversation_id text,
        ADD COLUMN IF NOT EXISTS business_unit_id uuid
    `)

    // 1. La contrainte de portée s'élargit — les deux anciennes valeurs restent.
    await queryRunner.query(`ALTER TABLE memory_pinned_facts DROP CONSTRAINT IF EXISTS memory_pinned_facts_scope_check`)
    await queryRunner.query(`
      ALTER TABLE memory_pinned_facts
        ADD CONSTRAINT memory_pinned_facts_scope_check
        CHECK (scope IN ('user', 'workspace', 'business_unit', 'conversation'))
    `)

    // 2. Une portée qui DÉSIGNE quelqu'un exige sa désignation, en base et pas
    //    seulement au DTO : un élément « ce fil » sans fil serait lisible par
    //    personne et effaçable par rien, et un élément « ce périmètre » sans
    //    périmètre serait une portée qui ne filtre rien — exactement ce que
    //    #1918.2 refuse. Même forme que `rag_documents` (`1792800004817`).
    await queryRunner.query(`
      ALTER TABLE memory_pinned_facts
        DROP CONSTRAINT IF EXISTS memory_pinned_facts_conversation_scope_requires_id_check
    `)
    await queryRunner.query(`
      ALTER TABLE memory_pinned_facts
        ADD CONSTRAINT memory_pinned_facts_conversation_scope_requires_id_check
        CHECK (scope <> 'conversation' OR conversation_id IS NOT NULL)
    `)
    await queryRunner.query(`
      ALTER TABLE memory_pinned_facts
        DROP CONSTRAINT IF EXISTS memory_pinned_facts_business_unit_scope_requires_id_check
    `)
    await queryRunner.query(`
      ALTER TABLE memory_pinned_facts
        ADD CONSTRAINT memory_pinned_facts_business_unit_scope_requires_id_check
        CHECK (scope <> 'business_unit' OR business_unit_id IS NOT NULL)
    `)

    // 3. Deux index PARTIELS, légers : seules les lignes de la portée concernée
    //    en portent une entrée. Le premier sert la suppression d'un fil
    //    (`MemoryService.forgetConversation`), le second la lecture d'un membre
    //    de périmètre (`readVisibleFacts`).
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS memory_pinned_facts_conversation_idx
        ON memory_pinned_facts (workspace_id, conversation_id)
        WHERE scope = 'conversation'
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS memory_pinned_facts_business_unit_idx
        ON memory_pinned_facts (workspace_id, business_unit_id)
        WHERE scope = 'business_unit'
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
