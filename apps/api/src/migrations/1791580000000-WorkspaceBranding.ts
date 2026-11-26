import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * LA MARQUE D'UN ESPACE — le socle du marque blanche (palier P2, 01/09/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CES COLONNES PERMETTENT, ET CE QU'ELLES NE PERMETTENT PAS
 * ─────────────────────────────────────────────────────────────────────────
 * Elles portent ce qu'un client voit de SA marque : le nom du produit, le nom
 * de son copilote, son logo, sa couleur d'accent, et le domaine sur lequel il
 * sert l'application. Elles ne portent NI hiérarchie, NI facturation déléguée :
 * un espace reste un espace, et `workspaces` reste une table PLATE. La revente
 * à deux niveaux (palier P3) demanderait un `parent_workspace_id` et la reprise
 * de toutes les portées — ce n'est pas ce lot, et l'écrire ici sans l'utiliser
 * serait une colonne lue par personne.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * TOUT EST NULLABLE, ET C'EST LA DÉCISION
 * ─────────────────────────────────────────────────────────────────────────
 * `NULL` ne veut pas dire « vide », il veut dire **« la marque Bellum »**. Un
 * défaut posé en SQL (`DEFAULT 'Bellum'`) figerait notre propre nom dans la
 * base de chaque client, et la première fois qu'on renommerait le produit il
 * faudrait un backfill sur toutes les lignes. Le repli vit dans UN seul endroit
 * du code (`resolveBrand`), donc il se change en un point.
 *
 * ⚠️ `custom_domain` est UNIQUE, en minuscules, et sans schéma.
 *
 * Unique parce que deux espaces qui revendiqueraient `app.acme.com` rendraient
 * la résolution par `Host` ambiguë — et une résolution ambiguë de TENANT est
 * une fuite de données entre clients, pas un bug d'affichage. La contrainte
 * refuse le second en écriture plutôt que de laisser l'arbitrage à un `LIMIT 1`
 * dont personne ne connaît l'ordre.
 *
 * En minuscules parce qu'un nom d'hôte est insensible à la casse côté DNS mais
 * pas côté Postgres : `App.Acme.com` et `app.acme.com` passeraient tous deux la
 * contrainte d'unicité tout en désignant le même hôte. Le CHECK impose la forme
 * normalisée à l'écriture, ce qui rend la lecture par `Host` exacte sans
 * `LOWER()` (et donc sans perdre l'index).
 */
export class WorkspaceBranding1791580000000 implements MigrationInterface {
  name = 'WorkspaceBranding1791580000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE workspaces
        ADD COLUMN IF NOT EXISTS brand_name text,
        ADD COLUMN IF NOT EXISTS brand_logo_url text,
        ADD COLUMN IF NOT EXISTS brand_accent text,
        ADD COLUMN IF NOT EXISTS copilot_name text,
        ADD COLUMN IF NOT EXISTS custom_domain text,
        ADD COLUMN IF NOT EXISTS brand_email_from text
    `)

    /*
     * La couleur d'accent : un hexadécimal à six chiffres, ou rien.
     *
     * Elle voyage jusqu'à une variable CSS (`--bellum-primary-500`) : une
     * valeur mal formée n'y produit pas d'erreur, elle produit une règle
     * IGNORÉE — donc un bouton qui garde silencieusement la couleur de
     * quelqu'un d'autre. Le CHECK refuse à l'écriture ce que le navigateur
     * refuserait sans le dire.
     */
    await queryRunner.query(`
      ALTER TABLE workspaces
        DROP CONSTRAINT IF EXISTS workspaces_brand_accent_check
    `)
    await queryRunner.query(`
      ALTER TABLE workspaces
        ADD CONSTRAINT workspaces_brand_accent_check
        CHECK (brand_accent IS NULL OR brand_accent ~ '^#[0-9a-f]{6}$')
    `)

    /*
     * Le domaine : minuscules, sans schéma ni chemin, et un point au moins.
     *
     * ⚠️ Cette contrainte est une garde de SÉCURITÉ autant que de forme. Le
     * domaine sert à résoudre le tenant depuis l'en-tête `Host` : y laisser
     * entrer `https://app.acme.com/` ou `APP.ACME.COM` ferait échouer la
     * comparaison en silence, et l'espace tomberait sur le repli — c'est-à-dire
     * sur la marque Bellum, chez un client qui a payé pour la sienne.
     */
    await queryRunner.query(`
      ALTER TABLE workspaces
        DROP CONSTRAINT IF EXISTS workspaces_custom_domain_check
    `)
    await queryRunner.query(`
      ALTER TABLE workspaces
        ADD CONSTRAINT workspaces_custom_domain_check
        CHECK (custom_domain IS NULL OR custom_domain ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$')
    `)

    /*
     * L'unicité est PARTIELLE (`WHERE custom_domain IS NOT NULL`) : sans le
     * filtre, un index unique classerait tous les espaces sans domaine comme
     * distincts sous Postgres — ce qui marche — mais coûterait une entrée par
     * ligne pour rien. Le filtre garde l'index à la taille du nombre réel de
     * domaines, qui restera petit longtemps.
     */
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS workspaces_custom_domain_uidx
        ON workspaces (custom_domain) WHERE custom_domain IS NOT NULL
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS workspaces_custom_domain_uidx`)
    await queryRunner.query(`ALTER TABLE workspaces DROP CONSTRAINT IF EXISTS workspaces_custom_domain_check`)
    await queryRunner.query(`ALTER TABLE workspaces DROP CONSTRAINT IF EXISTS workspaces_brand_accent_check`)
    await queryRunner.query(`
      ALTER TABLE workspaces
        DROP COLUMN IF EXISTS brand_name,
        DROP COLUMN IF EXISTS brand_logo_url,
        DROP COLUMN IF EXISTS brand_accent,
        DROP COLUMN IF EXISTS copilot_name,
        DROP COLUMN IF EXISTS custom_domain,
        DROP COLUMN IF EXISTS brand_email_from
    `)
  }
}
