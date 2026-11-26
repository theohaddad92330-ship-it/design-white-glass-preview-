import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * LE JOURNAL D'AUDIT UNIQUE DU BACK-OFFICE (#1666).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE TABLE DE PLUS, ALORS QUE DEUX JOURNAUX EXISTENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Les deux journaux du dépôt sont MONO-SUJET : `impersonation_audit` ne connaît
 * que les prises d'identité, `backoffice_access_events` (#1671.2) ne connaît
 * que les entrées. Aucun des deux ne sait dire ce qu'un opérateur a fait d'un
 * crédit, d'une offre, d'un bandeau ou d'un compte — c'est-à-dire l'essentiel
 * de ce que la console permet. Il n'y avait donc rien à étendre.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA CATÉGORIE N'EST PAS UNE ÉTIQUETTE : ELLE DÉCIDE DE LA RÉTENTION
 * ─────────────────────────────────────────────────────────────────────────────
 *   ordinaire      24 mois
 *   permission     36 mois
 *   export         36 mois
 *   suppression    PERMANENT
 *   impersonation  36 mois
 *
 * C'est pourquoi elle est CONTRAINTE en base et pas seulement en TypeScript :
 * une valeur inventée par un appelant tomberait dans aucune fenêtre, et une
 * ligne qu'aucune purge ne connaît est une ligne qui vit pour toujours sans que
 * personne l'ait décidé. La liste vit dans
 * `packages/contracts/src/schemas/backoffice-audit.ts`
 * (`BACKOFFICE_AUDIT_CATEGORIES`), et cette contrainte-ci la couvre — GA-12 le
 * vérifie, GA-11 empêche qu'elle rétrécisse.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE TABLE NE PORTE JAMAIS
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ Aucune charge utile brute de requête. `detail` est une note courte écrite
 * par l'appelant ; un `JSON.stringify(req.body)` y porterait un jour un jeton ou
 * un lien de réinitialisation, et le journal d'audit deviendrait le meilleur
 * endroit du produit où aller les chercher.
 *
 * ⚠️ Aucun `updated_at`, et c'est la forme que prend l'interdit dans le schéma :
 * une ligne d'audit ne se corrige pas. La lecture seule ne tient pas à un bouton
 * caché — le service n'expose aucune méthode d'écriture par identifiant, et la
 * route de suppression répond 405.
 *
 * ⚠️ Hors périmètre d'espace, déclarée telle quelle au registre des portées
 * (`packages/contracts/src/schemas/table-scopes.ts`, GA-16 / GA-65) : c'est la
 * plomberie de l'ÉDITEUR. Un espace ne doit ni pouvoir effacer la trace de ce
 * qu'un administrateur y a fait, ni savoir qu'elle existe.
 */
export class BackofficeAuditJournal1791821777001 implements MigrationInterface {
  public name = 'BackofficeAuditJournal1791821777001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS backoffice_audit_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        operation text NOT NULL,
        category text NOT NULL,
        outcome text NOT NULL,
        actor_email text,
        actor_role text,
        subject_type text,
        subject_id text,
        subject_label text,
        status_code integer,
        detail text,
        ip text,
        user_agent text,
        country text,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT backoffice_audit_events_category_check CHECK (category IN (
          'ordinaire',
          'permission',
          'export',
          'suppression',
          'impersonation'
        )),
        CONSTRAINT backoffice_audit_events_outcome_check CHECK (outcome IN (
          'succes',
          'refus',
          'echec'
        ))
      )
    `)

    // La lecture par défaut de l'écran : « les N dernières opérations », toutes
    // catégories confondues, les plus récentes d'abord.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_backoffice_audit_events_recent
        ON backoffice_audit_events (created_at DESC)
    `)

    // La purge de rétention balaie PAR CATÉGORIE (chacune a sa fenêtre), et le
    // filtre de l'écran restreint par catégorie. Sans cet index, les deux
    // parcourraient la table entière.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_backoffice_audit_events_category
        ON backoffice_audit_events (category, created_at DESC)
    `)

    // « Qu'a fait cette personne ? » est la deuxième question qu'on pose à un
    // journal d'audit, juste après « que s'est-il passé hier ? ».
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_backoffice_audit_events_actor
        ON backoffice_audit_events (actor_email, created_at DESC)
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
