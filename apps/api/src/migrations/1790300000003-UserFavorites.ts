import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * LES FAVORIS PERSONNELS, GÉNÉRIQUES — D10 du 28/08/2026 (décision de Louis).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ON MIGRE, ON NE POSE PAS UN SECOND SYSTÈME À CÔTÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * Le favori de CONTACT existait déjà : `user_contact_favorites (user_id,
 * contact_id)`, posée le 1783700000001, lue par la liste de contacts (jointure
 * `favorite.contact_id = contact.id AND favorite.user_id = :userId`) et par
 * l'onglet « Favoris ». Livrer un favori générique à côté aurait donné DEUX
 * favoris qui ne se voient pas l'un l'autre — l'étoile allumée sur la fiche et
 * éteinte dans « Mes favoris ». Pire que zéro.
 *
 * Cette migration crée donc la table générique ET RECOPIE l'existant, dans le
 * même `up()`. Les quatre points de lecture/écriture du service contacts
 * basculent sur la nouvelle table dans le même lot : la table historique cesse
 * d'être écrite, elle n'est pas supprimée (on archive, on ne supprime pas — et
 * une table encore lue par une migration de déduplication ne se jette pas).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA CONTRAINTE D'ABORD, LE CODE ENSUITE (GA-11 / GA-12)
 * ─────────────────────────────────────────────────────────────────────────────
 * `user_favorites_entity_type_check` est NOMMÉE, donc lisible par GA-12, qui la
 * compare à `FAVORITE_ENTITY_TYPES` (`packages/contracts/src/schemas/
 * favorites.ts`). L'ordre est figé : `contact` d'abord — c'est celui qui
 * préexistait —, `account` ensuite. Toute valeur future s'ajoute EN FIN, et
 * dans une migration qui repart de CETTE liste-ci, jamais d'une plus ancienne.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI AUCUNE CLÉ ÉTRANGÈRE SUR `entity_id`
 * ─────────────────────────────────────────────────────────────────────────────
 * Une colonne polymorphe ne peut pas référencer deux tables. Conséquence
 * assumée : supprimer un contact laisse une ligne orpheline. Elle est INERTE —
 * la lecture des favoris hydrate par jointure sur `contacts` / `accounts` et ne
 * rend que ce qui existe encore, dans l'espace actif. Un favori orphelin ne
 * s'affiche donc jamais, et re-poser le même objet est idempotent (conflit sur
 * la clé primaire). C'est le compromis explicite d'un favori générique : on
 * paie quelques lignes mortes pour ne pas dupliquer une table par type d'objet.
 *
 * `user_id` garde, lui, sa clé étrangère `ON DELETE CASCADE` : un UTILISATEUR
 * supprimé emporte ses favoris, exactement comme dans la table historique.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CLOISONNEMENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Un favori est PERSONNEL : aucune colonne `workspace_id`, et la clé primaire
 * commence par `user_id`. Deux membres d'une même ESN ne se voient jamais.
 * C'est la différence avec la veille (`watchlist_rules`), qui est explicitement
 * portée par le workspace et unique par `(workspace_id, kind, value)` : une
 * veille est une affaire d'équipe, un favori ne l'est pas.
 *
 * RLS `auth.uid() = user_id` en défense en profondeur (l'API tourne en
 * service-role, qui la contourne ; la vraie barrière est le `user_id` dans
 * chaque requête du service).
 */
export class UserFavorites1790300000003 implements MigrationInterface {
  public name = 'UserFavorites1790300000003'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS user_favorites (
        user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        entity_type text NOT NULL,
        entity_id   uuid NOT NULL,
        created_at  timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, entity_type, entity_id)
      )
    `)

    // La contrainte est posée SÉPARÉMENT et NOMMÉE : déclarée en ligne dans le
    // `CREATE TABLE`, PostgreSQL lui donnerait un nom généré, et l'élargir plus
    // tard demanderait de deviner ce nom.
    await queryRunner.query(`ALTER TABLE user_favorites DROP CONSTRAINT IF EXISTS user_favorites_entity_type_check`)
    await queryRunner.query(`
      ALTER TABLE user_favorites ADD CONSTRAINT user_favorites_entity_type_check
        CHECK (entity_type IN ('contact', 'account'))
    `)

    // Le chemin de lecture inverse : « qui a mis CET objet en favori » n'est pas
    // exposé (un favori est personnel), mais la jointure d'hydratation part de
    // l'objet, et la clé primaire commence par `user_id`.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS user_favorites_entity_idx
        ON user_favorites (entity_type, entity_id)
    `)

    // La REPRISE de l'existant. Idempotente (`ON CONFLICT DO NOTHING`) et
    // conditionnée à la présence de la table historique : une base neuve, ou
    // une base où la migration a déjà tourné, passe sans rien faire.
    //
    // `created_at` est CONSERVÉ. Écraser la date par `now()` ferait remonter en
    // tête de « Mes favoris » des objets posés il y a six mois — l'écran
    // mentirait sur son propre ordre dès sa première ouverture.
    await queryRunner.query(`
      DO $$
      BEGIN
        IF to_regclass('public.user_contact_favorites') IS NOT NULL THEN
          INSERT INTO user_favorites (user_id, entity_type, entity_id, created_at)
          SELECT f.user_id, 'contact', f.contact_id, f.created_at
          FROM user_contact_favorites f
          ON CONFLICT (user_id, entity_type, entity_id) DO NOTHING;
        END IF;
      END $$;
    `)

    await queryRunner.query(`ALTER TABLE user_favorites ENABLE ROW LEVEL SECURITY`)
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE tablename = 'user_favorites'
            AND policyname = 'Users can manage their own favorites'
        ) THEN
          CREATE POLICY "Users can manage their own favorites"
            ON user_favorites
            FOR ALL
            USING (auth.uid() = user_id)
            WITH CHECK (auth.uid() = user_id);
        END IF;
      END $$;
    `)
  }

  /**
   * La table historique n'a jamais cessé d'exister et n'a pas été vidée : la
   * défaire revient donc à jeter cette table-ci, et les favoris de CONTACT
   * survivent dans `user_contact_favorites`. Ceux de COMPTE, eux, sont perdus —
   * ils n'ont pas d'autre domicile. C'est la seule chose qu'un retour arrière
   * puisse faire honnêtement, et c'est écrit ici pour que personne ne le
   * découvre au moment de le lancer.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS user_favorites`)
  }
}
