import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2407.4 (suite) — l'affectation porte son CONSENTEMENT, ses DOCUMENTS et ses
 * RISQUES DÉCLARÉS.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI ÉTAIT CADRÉ À PART
 * ─────────────────────────────────────────────────────────────────────────────
 * La première tranche de #2407.4 (migration `AssignmentRateLocationRemote`,
 * decisions-louis-22-09-soir.md §1) livrait taux/lieu/remote — trois colonnes
 * simples — et cadrait consentement/documents/risques à part : chacun
 * impliquait un sous-système (qui consent, sur quoi ; un stockage de
 * documents ; un modèle de risque). Reco appliquée ici (même décision §1,
 * version minimale) : DÉCLARATIF, comme les jalons de forfait (#2417.3) et le
 * retainer (#2417.4) — un champ saisi, jamais un sous-système construit.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE MIGRATION AJOUTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Cinq colonnes NULLABLES, additives — une affectation existante n'a rien de
 * saisi, et `NULL` le dit, jamais un défaut inventé (GA-18/GA-19) :
 *
 *  - `consent_given` (oui/non) et `consent_date` — la date n'a de sens QUE si
 *    un consentement (oui ou non) a été déclaré : `assignment_consent_date_check`
 *    le tient EN BASE, avant le code qui l'écrit (GA-11/GA-12).
 *  - `documents_expected` / `documents_received` — DÉCLARATIFS, du texte libre
 *    (« Casier judiciaire, habilitation sécurité site client »), jamais une
 *    liste structurée : construire un sous-système de suivi documentaire est
 *    précisément ce que la décision §1 a écarté pour cette tranche.
 *  - `declared_risks` — DÉCLARATIF, du texte libre. Aucun score, aucune
 *    probabilité (doctrine : « aucune PROBABILITÉ, refusé six fois ») — un
 *    risque déclaré est une phrase, pas un chiffre.
 */
export class AssignmentConsentDocumentsRisks1795999539557 implements MigrationInterface {
  public name = 'AssignmentConsentDocumentsRisks1795999539557'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE mission_assignments
        ADD COLUMN IF NOT EXISTS consent_given boolean NULL,
        ADD COLUMN IF NOT EXISTS consent_date date NULL,
        ADD COLUMN IF NOT EXISTS documents_expected text NULL,
        ADD COLUMN IF NOT EXISTS documents_received text NULL,
        ADD COLUMN IF NOT EXISTS declared_risks text NULL
    `)
    await queryRunner.query(`
      ALTER TABLE mission_assignments
        DROP CONSTRAINT IF EXISTS assignment_consent_date_check,
        ADD CONSTRAINT assignment_consent_date_check
          CHECK (consent_date IS NULL OR consent_given IS NOT NULL),
        DROP CONSTRAINT IF EXISTS assignment_documents_expected_check,
        ADD CONSTRAINT assignment_documents_expected_check
          CHECK (documents_expected IS NULL OR char_length(documents_expected) BETWEEN 1 AND 2000),
        DROP CONSTRAINT IF EXISTS assignment_documents_received_check,
        ADD CONSTRAINT assignment_documents_received_check
          CHECK (documents_received IS NULL OR char_length(documents_received) BETWEEN 1 AND 2000),
        DROP CONSTRAINT IF EXISTS assignment_declared_risks_check,
        ADD CONSTRAINT assignment_declared_risks_check
          CHECK (declared_risks IS NULL OR char_length(declared_risks) BETWEEN 1 AND 2000)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE mission_assignments
        DROP CONSTRAINT IF EXISTS assignment_declared_risks_check,
        DROP CONSTRAINT IF EXISTS assignment_documents_received_check,
        DROP CONSTRAINT IF EXISTS assignment_documents_expected_check,
        DROP CONSTRAINT IF EXISTS assignment_consent_date_check,
        DROP COLUMN IF EXISTS declared_risks,
        DROP COLUMN IF EXISTS documents_received,
        DROP COLUMN IF EXISTS documents_expected,
        DROP COLUMN IF EXISTS consent_date,
        DROP COLUMN IF EXISTS consent_given
    `)
  }
}
