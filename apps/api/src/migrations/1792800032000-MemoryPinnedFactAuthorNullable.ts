import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `memory_pinned_facts.user_id` peut valoir NULL — l'anonymisation d'un
 * compte supprimé (#1939, RGPD art. 17).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT CORRIGÉ (relecture orchestrateur du 12/09, sur 548e55051)
 * ─────────────────────────────────────────────────────────────────────────────
 * La première version de `PrivacyDeletionService.anonymizeMemoryFacts`
 * (alors `scrubMemoryFacts`) rédigeait le TEXTE (`fact = '[supprimé]'`),
 * suivant le même geste que `contacts.full_name`. Mais `memory_pinned_facts`
 * n'est pas une donnée personnelle scrutée par son seul auteur : c'est une
 * mémoire PARTAGÉE de l'espace — `MemoryService.listFacts`, l'UNIQUE lecture
 * (carte « Mémoire » ET `ChatContextService.loadMemory` → prompt du modèle),
 * filtre par `workspace_id` SEUL, jamais par `user_id`
 * (`memory.service.ts:365-375`). Rédiger le texte aurait donc fait
 * apparaître « [supprimé] » aux collègues ET l'aurait envoyé au modèle comme
 * un fait métier réel — l'inverse de ce qu'un fait épinglé doit rester.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI RETIRER L'AUTEUR ET NON LE CONTENU (même raisonnement que
 * `1792800031000-ChatMessageAuthorNullable`)
 * ─────────────────────────────────────────────────────────────────────────────
 * Un fait épinglé est un geste DÉLIBÉRÉ de partage vers l'équipe
 * (`memory.service.ts`, doc de `MemoryService`). Ce que le droit à
 * l'effacement retire ici, c'est le lien vers LA PERSONNE ; le texte reste
 * lisible par l'équipe et par le modèle, exactement comme un fil de
 * discussion partagé.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE MIGRATION VIENT D'ABORD
 * ─────────────────────────────────────────────────────────────────────────────
 * « Une valeur qui voyage du code vers la base voit sa contrainte SQL élargie
 * AVANT le code qui l'écrit » (GA-11, GA-12 ; gardée par
 * `nullable-column-was-relaxed-in-sql.spec.ts`, GA-129).
 */
export class MemoryPinnedFactAuthorNullable1792800032000 implements MigrationInterface {
  public name = 'MemoryPinnedFactAuthorNullable1792800032000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Idempotent en PostgreSQL : rejouer sur une colonne déjà nullable ne
    // produit rien.
    await queryRunner.query(`ALTER TABLE memory_pinned_facts ALTER COLUMN user_id DROP NOT NULL`)
  }

  public async down(): Promise<void> {
    // Même convention que `1792800031000-ChatMessageAuthorNullable` pour la
    // même raison : reboucher suppose une VRAIE identité à reposer, et il
    // n'en existe aucune pour une ligne déjà anonymisée.
    throw new Error('down migration not supported — memory_pinned_facts.user_id may hold anonymised (NULL) rows')
  }
}
