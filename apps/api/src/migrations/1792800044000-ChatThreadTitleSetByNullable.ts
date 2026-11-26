import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `chat_thread_titles.set_by` peut valoir NULL — l'anonymisation d'un compte
 * supprimé (#1939, RGPD art. 17), appliquée aux titres de fil (#1911.1).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE CONSTAT (revue d'intégration du lot fils, 13/09/2026)
 * ─────────────────────────────────────────────────────────────────────────────
 * Deux branches écrites en parallèle. L'effacement d'un compte retire l'auteur
 * des messages à Laura (`1792800031000-ChatMessageAuthorNullable`) et des faits
 * épinglés (`1792800032000-MemoryPinnedFactAuthorNullable`) ; pendant ce temps
 * `1792800043517-ChatThreadTitles` créait `set_by uuid NOT NULL` — l'identifiant
 * de la personne qui a saisi un titre, ou dont le tour a déclenché sa rédaction.
 * Réunies, un compte effacé restait attaché pour toujours aux titres des fils
 * de son espace.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI RETIRER L'AUTEUR ET NON LE TITRE
 * ─────────────────────────────────────────────────────────────────────────────
 * Un titre nomme un fil PARTAGÉ de l'espace (`withStoredTitles` lit par
 * `workspace_id`) : le vider ferait perdre leur repère aux collègues. Même geste
 * que `chat_messages` : le texte reste, le lien vers la personne part. La borne
 * des titres rédigés par personne sur 24 h (`capReached`) compte par `set_by` ;
 * une ligne anonymisée n'y compte plus pour personne, ce qui est juste.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE MIGRATION VIENT D'ABORD
 * ─────────────────────────────────────────────────────────────────────────────
 * « Une valeur qui voyage du code vers la base voit sa contrainte SQL élargie
 * AVANT le code qui l'écrit » (GA-11, GA-12 ; gardée par
 * `nullable-column-was-relaxed-in-sql.spec.ts`, GA-129).
 */
export class ChatThreadTitleSetByNullable1792800044000 implements MigrationInterface {
  public name = 'ChatThreadTitleSetByNullable1792800044000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Idempotent en PostgreSQL : rejouer sur une colonne déjà nullable ne
    // produit rien.
    await queryRunner.query(`ALTER TABLE chat_thread_titles ALTER COLUMN set_by DROP NOT NULL`)
  }

  public async down(): Promise<void> {
    // Même convention que `1792800031000-ChatMessageAuthorNullable` : reboucher
    // suppose une VRAIE identité à reposer, et il n'en existe aucune pour une
    // ligne déjà anonymisée.
    throw new Error('down migration not supported — chat_thread_titles.set_by may hold anonymised (NULL) rows')
  }
}
