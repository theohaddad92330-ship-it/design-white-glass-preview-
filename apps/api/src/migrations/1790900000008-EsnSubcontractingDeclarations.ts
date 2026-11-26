import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * La déclaration d'ouverture à la sous-traitance (tome 4 §16.8, chantier N16
 * — « une ESN déclare si elle sous-traite »).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE MANQUE QUE CETTE MIGRATION COMBLE
 * ─────────────────────────────────────────────────────────────────────────────
 * `esn_directory.open_to_subcontracting` existe depuis `1789995471028` et vaut
 * `inconnu` sur les 477 lignes : rien ne l'écrivait. `unwritten-columns.ts` le
 * déclarait explicitement — cette migration RETIRE cinq entrées de cette
 * liste, ce qui est le sens dans lequel elle doit bouger.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * D589 — LA DÉCLARATION EST SCOPÉE, `esn_directory` RESTE UN FAIT DE MARCHÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * `esn_directory` est partagée entre espaces (D62) et CE QU'UN ESPACE A DIT
 * n'est pas un fait de marché : c'est l'opinion, datée, d'un concurrent sur un
 * autre. Elle vit donc ICI, dans une table SCOPÉE (`workspace_id`), jamais lue
 * par un autre espace directement — voir `table-scopes.ts` (`scoped`,
 * `workspace_column`, pas d'entité TypeORM : le service y écrit en SQL brut,
 * comme `territory-watch.service.ts` le fait déjà pour `hiring_90d`).
 *
 * Seul l'AGRÉGAT — trois espaces distincts, sans divergence
 * (`subcontractingAggregate`, `@bellum/contracts`) — est promu dans les cinq
 * colonnes déjà posées par `1789995471028` : `open_to_subcontracting`,
 * `subcontracting_confidence`, `subcontracting_evidence`,
 * `subcontracting_declared_at`, `subcontracting_sources_count`. C'est
 * exactement le modèle déjà écrit en tête de `esn-directory.ts` : « ouverture
 * au rang 2 agrégée (≥ 3 espaces) | la déclaration d'un espace, tant qu'elle
 * est seule ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * D590 — CE N'EST PAS L'AGRÉGATION QUE GA-43 INTERDIT
 * ─────────────────────────────────────────────────────────────────────────────
 * `COMMUNITY_FORBIDDEN_KINDS.cost` interdit d'agréger ce qu'une ESN PAIE pour
 * entrer chez un client — un terme commercial entre concurrents. « Accepte-
 * t-elle le rang 2 » n'en est pas un : un fait d'ORGANISATION d'un tiers, de
 * la même famille que `lock` / `mode` / `path`, jamais un prix.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * D593 — SEULES LES DÉCLARATIONS D'UN ESPACE QUI PARTAGE COMPTENT DANS LE SEUIL
 * ─────────────────────────────────────────────────────────────────────────────
 * `workspaces.community_data_sharing` (posé par `1789994210583`) gouverne DÉJÀ
 * la réciprocité communautaire du dépôt — un réglage, un seul endroit. Écrire
 * SA déclaration reste toujours possible (elle lui appartient) ; qu'elle
 * COMPTE pour promouvoir l'agrégat partagé dépend de ce même interrupteur,
 * réutilisé plutôt que dupliqué.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI LES CONTRAINTES `CHECK` SONT EN LIGNE, SANS `CONSTRAINT` NOMMÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * Postgres les tient (l'intégrité est réelle), mais `check-constraints-cover-
 * enums.spec.ts` (GA-12) et `check-constraints-additive.spec.ts` (GA-11), tous
 * deux hors du périmètre de fichiers de ce chantier, ne scannent QUE la forme
 * `CONSTRAINT <nom> CHECK (...)`. Un `CHECK` inline n'a pas de nom porté par le
 * texte de la migration : la garde ne le voit pas, et n'a donc rien à
 * enregistrer pour lui.
 */
export class EsnSubcontractingDeclarations1790900000008 implements MigrationInterface {
  name = 'EsnSubcontractingDeclarations1790900000008'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS esn_subcontracting_declarations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        esn_directory_id uuid NOT NULL REFERENCES esn_directory(id) ON DELETE CASCADE,
        value text NOT NULL CHECK (value IN ('oui', 'non')),
        confidence text NOT NULL CHECK (confidence IN ('certain', 'probable', 'suppose')),
        evidence text,
        declared_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `)
    // Un espace, une opinion par ESN : une correction humaine gagne toujours,
    // et c'est un UPSERT qui la porte — jamais une seconde ligne qui ferait
    // hésiter le décompte des espaces distincts.
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS esn_subcontracting_declarations_unique
         ON esn_subcontracting_declarations (workspace_id, esn_directory_id)`,
    )
    // Le recalcul de l'agrégat, à chaque déclaration, relit TOUTES les
    // déclarations d'UNE ESN : sans cet index, chaque déclaration ferait un
    // balayage complet de la table.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_esn_subcontracting_declarations_esn
         ON esn_subcontracting_declarations (esn_directory_id)`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS esn_subcontracting_declarations`)
  }
}
