import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2329.35-.41 (épopée #2948) — le consentement à représenter un talent est
 * GLOBAL sur `consultants` (`consent_given_at`/`consent_expires_at`/
 * `consent_basis`/`consent_restrictions`, migrations `1789583721904` et
 * `1796321350100`) : une seule base légale, une seule échéance, pour TOUS les
 * comptes. Le §7.3 d'origine ne demandait que ça. L'épopée #2948 demande autre
 * chose : la personne peut accepter d'être représentée chez un client et
 * l'exclure chez un autre (« pas chez mon employeur actuel », « pas chez ce
 * concurrent ») — une question par COMPTE, que la colonne globale ne peut pas
 * porter sans écraser les autres comptes à chaque écriture.
 *
 * Table séparée, une ligne par (consultant, compte) — jamais un JSON sur
 * `consultants`, qui rendrait chaque compte illisible sans parser la fiche
 * entière et invisible à un `WHERE` simple depuis la porte G4.
 *
 * Chaque droit est NULLABLE et SANS DÉFAUT : l'absence de ligne, ou un droit
 * `NULL`, veut dire « jamais demandé », qui n'est ni un oui ni un non
 * (GA-18/GA-19). Seul `can_represent = false` REFUSE ; `NULL` avertit sans
 * bloquer, même patron que `consentState === 'none'` dans
 * `submission-preflight.ts`.
 */
export class ConsultantAccountRepresentationConsent1796321402137 implements MigrationInterface {
  name = 'ConsultantAccountRepresentationConsent1796321402137'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS consultant_account_consent (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NULL,
        consultant_id uuid NOT NULL,
        account_id uuid NOT NULL,
        -- #2329.35 — droit de STOCKER les données de la personne pour ce compte.
        can_store boolean NULL,
        -- #2329.36 — droit de CONTACTER la personne au sujet de ce compte.
        can_contact boolean NULL,
        -- #2329.37/.38 — droit de REPRÉSENTER (proposer) la personne CHEZ ce
        -- compte précis. C'est la seule des trois qui BLOQUE la porte G4
        -- quand elle vaut explicitement false (voir submission-preflight.ts).
        can_represent boolean NULL,
        -- #2329.39 — ce que la personne a EXCLU pour ce compte, texte libre :
        -- même raison que consultants.consent_restrictions, une liste fermée
        -- déciderait à la place de la personne.
        restrictions text NULL,
        -- #2329.41 — d'où vient cette autorisation (« confirmé en entretien »,
        -- « écrit dans le mail du 12/09 »). Texte libre : la formulation engage
        -- l'ESN, même patron que consultants.consent_basis.
        source text NULL,
        recorded_at timestamptz NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS consultant_account_consent_pair_idx
        ON consultant_account_consent (consultant_id, account_id)
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS consultant_account_consent_workspace_idx
        ON consultant_account_consent (workspace_id)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS consultant_account_consent`)
  }
}
