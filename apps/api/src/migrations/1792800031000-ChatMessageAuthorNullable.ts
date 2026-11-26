import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `chat_messages.user_id` peut valoir NULL — l'anonymisation d'un compte
 * supprimé (#1939, RGPD art. 17).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE CONSTAT
 * ─────────────────────────────────────────────────────────────────────────────
 * `PrivacyDeletionService.deleteAccount` anonymise le profil, les contacts, le
 * vivier, la mémoire RAG et les activités — jamais les échanges avec Laura : un
 * compte supprimé laissait ses messages en base, attribués pour toujours à
 * `user_id`. La colonne est `NOT NULL REFERENCES auth.users(id) ON DELETE
 * CASCADE` depuis `1783600000000-ChatMessages`, mais cette CASCADE ne joue
 * jamais ici : l'effacement en libre-service n'efface JAMAIS la ligne
 * `auth.users` — il ANONYMISE `profiles` en place.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI RETIRER L'AUTEUR ET NON LE CONTENU
 * ─────────────────────────────────────────────────────────────────────────────
 * Un fil de discussion est un fil PARTAGÉ DE L'ESPACE — `ChatMessagesService`
 * lit `listThread`/`listHistory` par `workspace_id`, jamais par `user_id`. Le
 * scruber comme un corps d'activité couperait l'historique de tous les
 * collègues qui le lisent encore. Ce que le droit à l'effacement retire ici,
 * c'est le lien vers LA PERSONNE : le texte reste lisible par l'équipe,
 * personne ne peut plus dire qui l'a écrit.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE MIGRATION VIENT D'ABORD
 * ─────────────────────────────────────────────────────────────────────────────
 * « Une valeur qui voyage du code vers la base voit sa contrainte SQL élargie
 * AVANT le code qui l'écrit » (GA-11, GA-12 ; gardée ici par
 * `nullable-column-was-relaxed-in-sql.spec.ts`, GA-129). Écrire `user_id: null`
 * avant ce `DROP NOT NULL` ferait tomber la PREMIÈRE suppression de compte en
 * erreur de driver.
 *
 * ⚠️ Un autre écrivain ajoute en parallèle une colonne `turn_id` à
 * `chat_messages` : cette migration ne touche QUE la nullabilité de `user_id`.
 */
export class ChatMessageAuthorNullable1792800031000 implements MigrationInterface {
  public name = 'ChatMessageAuthorNullable1792800031000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Idempotent en PostgreSQL : rejouer sur une colonne déjà nullable ne
    // produit rien.
    await queryRunner.query(`ALTER TABLE chat_messages ALTER COLUMN user_id DROP NOT NULL`)
  }

  public async down(): Promise<void> {
    // Reboucher suppose de reboucher les trous : les lignes anonymisées depuis
    // n'ont plus de VRAIE valeur pour `user_id`, et il n'en existe aucune à
    // deviner. Même convention que `1783600000000-ChatMessages` pour cette
    // table : pas de `down` qui inventerait une identité.
    throw new Error('down migration not supported — chat_messages.user_id may hold anonymised (NULL) rows')
  }
}
