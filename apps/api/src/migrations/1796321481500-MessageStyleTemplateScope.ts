import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2369.6 (épopée #2768, LOT j1 26/09/2026) — LA MÉMOIRE À QUATRE NIVEAUX,
 * tranchée sans Louis « étendre `memory/` existant plutôt que nouveau modèle »
 * (GA-26). `memory_pinned_facts.scope` connaît déjà les quatre valeurs
 * (`1795204871293-MemoryScopeTeamAndConversation`) : cette migration les
 * REPREND à l'identique sur `message_style_templates`, plutôt qu'un second
 * enum qui dirait la même chose autrement.
 *
 * ⚠️ « équipe » DÉSIGNE `business_unit` (même colonne, même table
 * `business_unit_members` — pas de second objet « équipe »). « campagne »
 * DÉSIGNE `conversation` (`conversation_id` en TEXTE, même clé que
 * `memory_pinned_facts` : le fil par défaut `general`, un fil de compte
 * `account:<uuid>`) — `c74_campagne_etiquette_mono_contact` a déjà fermé la
 * porte à un objet Campagne séparé.
 *
 * GA-11/GA-12 : la contrainte connaît les QUATRE valeurs AVANT que le code
 * n'en écrive une. Additive et idempotente : `ADD COLUMN IF NOT EXISTS` avec
 * un DÉFAUT `'workspace'` — tout template posé avant ce lot reste visible à
 * tout l'espace, rien ne change en silence pour l'existant. `down` non
 * supporté (convention du dépôt).
 */
export class MessageStyleTemplateScope1796321481500 implements MigrationInterface {
  public name = 'MessageStyleTemplateScope1796321481500'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE message_style_templates
        ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'workspace',
        ADD COLUMN IF NOT EXISTS business_unit_id uuid,
        ADD COLUMN IF NOT EXISTS conversation_id text
    `)

    // 1. La contrainte de portée — copie exacte des quatre valeurs déjà
    //    posées par `1795204871293-MemoryScopeTeamAndConversation`.
    await queryRunner.query(
      `ALTER TABLE message_style_templates DROP CONSTRAINT IF EXISTS message_style_templates_scope_check`,
    )
    await queryRunner.query(`
      ALTER TABLE message_style_templates
        ADD CONSTRAINT message_style_templates_scope_check
        CHECK (scope IN ('user', 'workspace', 'business_unit', 'conversation'))
    `)

    // 2. Une portée qui DÉSIGNE quelqu'un exige sa désignation, en base et pas
    //    seulement au DTO — même raison que #1918.2/.5.
    await queryRunner.query(`
      ALTER TABLE message_style_templates
        DROP CONSTRAINT IF EXISTS message_style_templates_business_unit_scope_requires_id_check
    `)
    await queryRunner.query(`
      ALTER TABLE message_style_templates
        ADD CONSTRAINT message_style_templates_business_unit_scope_requires_id_check
        CHECK (scope <> 'business_unit' OR business_unit_id IS NOT NULL)
    `)
    await queryRunner.query(`
      ALTER TABLE message_style_templates
        DROP CONSTRAINT IF EXISTS message_style_templates_conversation_scope_requires_id_check
    `)
    await queryRunner.query(`
      ALTER TABLE message_style_templates
        ADD CONSTRAINT message_style_templates_conversation_scope_requires_id_check
        CHECK (scope <> 'conversation' OR conversation_id IS NOT NULL)
    `)

    // 3. La résolution (`resolveMessageStyleTemplate`) lit « les templates
    //    actifs de cet objectif/canal » puis filtre par portée en mémoire :
    //    un index sert cette première coupe, la plus sélective.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS ix_message_style_templates_active_lookup
        ON message_style_templates (workspace_id, objective, channel)
        WHERE status = 'active'
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
