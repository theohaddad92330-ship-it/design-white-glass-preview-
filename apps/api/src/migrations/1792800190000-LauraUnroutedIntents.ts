import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #1949.23 — décision Louis 13/09 batch 12 : LA TRACE ANONYME DES DEMANDES QUE
 * LAURA N'A PAS SU ROUTER.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA DÉCISION, ET CE QU'ELLE LÈVE
 * ─────────────────────────────────────────────────────────────────────────────
 * La règle 2 de `c64_analytique_produit` (« aucun contenu ») interdisait
 * d'écrire ce qu'une personne a saisi. Louis la lève pour CE SEUL usage, contre
 * la recommandation, avant la relecture juridique RGPD (toujours due). Le reste
 * de c64 tient — et la forme de cette table en est la preuve.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LA TABLE N'A PAS, À DESSEIN
 * ─────────────────────────────────────────────────────────────────────────────
 *  - AUCUN `user_id`, AUCUN `workspace_id` : retirer le MOYEN, pas la
 *    permission. Au plus `workspace_day_hash`, un hash d'(espace, jour) tourné à
 *    24 h (`hashBehavioralSession`) qui ne sert qu'à compter des occurrences
 *    DISTINCTES pour le plancher de lecture.
 *  - AUCUNE heure : `occurred_on` est un JOUR. Une heure à la seconde se
 *    recouperait avec `chat_messages.created_at`.
 *  - AUCUN texte brut : `text_masked` arrive masqué du moteur IA, et la
 *    contrainte borne sa longueur à 300 caractères.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PORTE « AJOUT SEULEMENT »
 * ─────────────────────────────────────────────────────────────────────────────
 * Création pure : aucune table existante n'est touchée. Les contraintes sont
 * NOMMÉES (GA-177) et posées DÈS LA CRÉATION, avant le code qui écrit (GA-11 /
 * GA-12). Rejouable : chaque instruction tolère d'avoir déjà tourné. `down()`
 * ne fait tomber que ce que `up()` a créé. Aucune colonne `surface` n'a de
 * `CHECK` : sa valeur suit `LAURA_CONTEXT_KINDS` (`@bellum/contracts`), et une
 * nature d'écran ajoutée côté navigateur ferait échouer l'écriture en silence.
 */
export class LauraUnroutedIntents1792800190000 implements MigrationInterface {
  name = 'LauraUnroutedIntents1792800190000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS laura_unrouted_intents (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        occurred_on date NOT NULL,
        surface text NOT NULL,
        language text,
        category text NOT NULL,
        text_masked text NOT NULL,
        text_normalized text NOT NULL,
        workspace_day_hash text NOT NULL
      )
    `)

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'laura_unrouted_intents_text_masked_length'
        ) THEN
          ALTER TABLE laura_unrouted_intents
          ADD CONSTRAINT laura_unrouted_intents_text_masked_length
          CHECK (char_length(text_masked) <= 300);
        END IF;
      END $$;
    `)

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'laura_unrouted_intents_category_check'
        ) THEN
          ALTER TABLE laura_unrouted_intents
          ADD CONSTRAINT laura_unrouted_intents_category_check
          CHECK (category IN ('hors_perimetre', 'capacite_absente', 'intention_incomprise'));
        END IF;
      END $$;
    `)

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'laura_unrouted_intents_language_check'
        ) THEN
          ALTER TABLE laura_unrouted_intents
          ADD CONSTRAINT laura_unrouted_intents_language_check
          CHECK (language IS NULL OR language IN ('fr', 'en'));
        END IF;
      END $$;
    `)

    // La purge RGPD quotidienne lit le JOUR ; la lecture agrégée regroupe par texte.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS laura_unrouted_intents_occurred_on_idx ON laura_unrouted_intents (occurred_on)`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS laura_unrouted_intents_text_normalized_idx ON laura_unrouted_intents (text_normalized)`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS laura_unrouted_intents_text_normalized_idx`)
    await queryRunner.query(`DROP INDEX IF EXISTS laura_unrouted_intents_occurred_on_idx`)
    await queryRunner.query(`DROP TABLE IF EXISTS laura_unrouted_intents`)
  }
}
