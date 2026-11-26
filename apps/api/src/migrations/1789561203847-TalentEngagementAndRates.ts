import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Les quatre natures de talent, ses coordonnées et ses trois TJM (PDF 3 §2 et §8).
 *
 * Trois décisions portées par cette migration :
 *
 * 1. **`engagement_kind` est un champ SÉPARÉ de `kind`** (décision D16 du
 *    20/08). `kind` dit ce qu'une personne EST au regard du droit — candidat
 *    (donnée personnelle bornée à deux ans) ou consultant (donnée d'entreprise
 *    justifiée par un contrat). `engagement_kind` dit comment on la MOBILISE, ce
 *    qui décide qui paie qui. Les fusionner rendrait « un freelance qu'on suit
 *    encore comme candidat » inexprimable, et ferait dépendre la politique de
 *    rétention du mode de facturation.
 * 2. **Le coût chargé et le TJM d'achat sont deux colonnes**, pas une (§2,
 *    règle 2). Un salarié coûte un salaire chargé ; un freelance coûte un prix
 *    d'achat. Les confondre rendrait la marge fausse pour l'une des deux
 *    natures — et personne ne saurait laquelle.
 * 3. **Les montants nouveaux sont en CENTIMES.** `consultants.tjm` reste en
 *    euros : il est saisi et lu partout, et le migrer casserait des écrans qui
 *    marchent. Tout ce qui s'ajoute suit l'unité du reste du domaine financier
 *    (`loaded_daily_cost_cents`, `project_needs.target_tjm_cents`).
 *
 * La contrainte de `contract_type` est ÉLARGIE avant que la moindre valeur
 * neuve ne puisse être écrite — leçon de `account_vocabulary.kind`.
 */
export class TalentEngagementAndRates1789561203847 implements MigrationInterface {
  public name = 'TalentEngagementAndRates1789561203847'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Le cadre contractuel accepte deux valeurs de plus ────────────────────
    // La contrainte d'origine était déclarée EN LIGNE sur la colonne : Postgres
    // l'a donc nommée `consultants_contract_type_check`, pas du nom qu'on lui
    // aurait donné. On retire les deux graphies — se tromper de nom laisserait
    // l'ancienne contrainte en place et l'écriture d'un `cdd` échouerait en
    // production, pas en CI.
    await queryRunner.query(`ALTER TABLE consultants DROP CONSTRAINT IF EXISTS consultants_contract_type_check`)
    await queryRunner.query(`ALTER TABLE consultants DROP CONSTRAINT IF EXISTS consultants_contract_check`)
    await queryRunner.query(`
      ALTER TABLE consultants ADD CONSTRAINT consultants_contract_check
        CHECK (contract_type IN ('cdi', 'freelance', 'portage', 'inconnu', 'cdd', 'sous_traitance'))
    `)

    // ── Comment on mobilise la personne ──────────────────────────────────────
    await queryRunner.query(
      `ALTER TABLE consultants ADD COLUMN IF NOT EXISTS engagement_kind text NOT NULL DEFAULT 'inconnu'`,
    )
    await queryRunner.query(`ALTER TABLE consultants DROP CONSTRAINT IF EXISTS consultants_engagement_check`)
    await queryRunner.query(`
      ALTER TABLE consultants ADD CONSTRAINT consultants_engagement_check
        CHECK (engagement_kind IN ('salarie', 'freelance', 'portage', 'sous_traitance', 'inconnu'))
    `)

    // Reprise depuis le cadre contractuel déjà saisi : un `cdi` connu vaut
    // `salarie`, un `freelance` vaut `freelance`. Ce qui n'est pas déductible
    // reste `inconnu` — deviner ferait apparaître des coûts d'achat sur des
    // salariés.
    await queryRunner.query(`
      UPDATE consultants SET engagement_kind = CASE contract_type
        WHEN 'cdi' THEN 'salarie'
        WHEN 'freelance' THEN 'freelance'
        WHEN 'portage' THEN 'portage'
        ELSE 'inconnu'
      END
      WHERE engagement_kind = 'inconnu'
    `)

    // Le partenaire qui porte un sous-traitant. `SET NULL` et non `CASCADE` :
    // retirer un partenaire du CRM ne doit pas effacer la fiche d'une personne.
    await queryRunner.query(`
      ALTER TABLE consultants ADD COLUMN IF NOT EXISTS partner_account_id uuid
        REFERENCES accounts(id) ON DELETE SET NULL
    `)

    // ── Coordonnées (décision D20 du 20/08) ──────────────────────────────────
    await queryRunner.query(`ALTER TABLE consultants ADD COLUMN IF NOT EXISTS email text`)
    await queryRunner.query(`ALTER TABLE consultants ADD COLUMN IF NOT EXISTS phone text`)
    await queryRunner.query(`ALTER TABLE consultants ADD COLUMN IF NOT EXISTS public_profile_url text`)

    // ── Les deux TJM manquants du §8.1, en centimes ──────────────────────────
    await queryRunner.query(`ALTER TABLE consultants ADD COLUMN IF NOT EXISTS min_tjm_cents bigint`)
    await queryRunner.query(`ALTER TABLE consultants ADD COLUMN IF NOT EXISTS cost_rate_cents bigint`)
    await queryRunner.query(`ALTER TABLE consultants ADD COLUMN IF NOT EXISTS purchase_tjm_cents bigint`)

    // ── Masquage des coordonnées par espace (D20) ────────────────────────────
    // Défaut `false` : aucun espace existant ne voit son vivier changer. Une
    // ESN qui veut cloisonner le coche, comme le cloisonnement de portefeuille.
    await queryRunner.query(
      `ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS hide_talent_contacts_from_sales boolean NOT NULL DEFAULT false`,
    )

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS consultants_engagement_idx
        ON consultants (workspace_id, engagement_kind)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS consultants_engagement_idx`)
    await queryRunner.query(`ALTER TABLE workspaces DROP COLUMN IF EXISTS hide_talent_contacts_from_sales`)
    await queryRunner.query(`ALTER TABLE consultants DROP COLUMN IF EXISTS purchase_tjm_cents`)
    await queryRunner.query(`ALTER TABLE consultants DROP COLUMN IF EXISTS cost_rate_cents`)
    await queryRunner.query(`ALTER TABLE consultants DROP COLUMN IF EXISTS min_tjm_cents`)
    await queryRunner.query(`ALTER TABLE consultants DROP COLUMN IF EXISTS public_profile_url`)
    await queryRunner.query(`ALTER TABLE consultants DROP COLUMN IF EXISTS phone`)
    await queryRunner.query(`ALTER TABLE consultants DROP COLUMN IF EXISTS email`)
    await queryRunner.query(`ALTER TABLE consultants DROP COLUMN IF EXISTS partner_account_id`)
    await queryRunner.query(`ALTER TABLE consultants DROP CONSTRAINT IF EXISTS consultants_engagement_check`)
    await queryRunner.query(`ALTER TABLE consultants DROP COLUMN IF EXISTS engagement_kind`)
    await queryRunner.query(`ALTER TABLE consultants DROP CONSTRAINT IF EXISTS consultants_contract_check`)
    await queryRunner.query(`
      ALTER TABLE consultants ADD CONSTRAINT consultants_contract_check
        CHECK (contract_type IN ('cdi', 'freelance', 'portage', 'inconnu'))
    `)
  }
}
