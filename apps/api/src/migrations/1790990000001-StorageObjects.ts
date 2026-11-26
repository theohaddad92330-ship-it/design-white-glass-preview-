import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `storage_objects` — LE registre des fichiers rangés (31/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE MANQUE, MESURÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * Trois écrans livrés la veille montraient une pièce jointe qu'on ne pouvait
 * pas ouvrir. `expense_report_attachments.download_url` valait `NULL` partout,
 * démo comprise, et son docblock l'écrivait noir sur blanc : « ce dépôt n'a pas
 * de stockage de fichiers branché sur ce domaine ». Il en a un maintenant.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE TABLE CENTRALE PLUTÔT QU'UNE COLONNE PAR DOMAINE
 * ─────────────────────────────────────────────────────────────────────────────
 * Deux domaines déposent déjà (un justificatif de note de frais, une pièce
 * d'affaire), et il y en aura d'autres. Trois choses ne peuvent pas se
 * dupliquer sans diverger :
 *
 *  1. **le CHEMIN**, qui porte le cloisonnement par espace — deux constructions
 *     de chemin, c'est un jour où l'une oublie le préfixe d'espace ;
 *  2. **le QUOTA**, qui se compte par ESPACE : « combien cet espace occupe-t-il »
 *     n'a de réponse que si tous les octets sont comptés au même endroit ;
 *  3. **l'ÉCHÉANCE**, que la routine de purge doit pouvoir balayer d'une seule
 *     requête. Répartie sur N tables, une purge en oublie une, et la retrouve
 *     trois ans plus tard.
 *
 * Les tables consommatrices portent donc une simple référence
 * (`storage_object_id`), et rien d'autre du stockage.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI EST `NOT NULL` ICI, ET POURQUOI CE N'EST PAS LA MÊME DÉCISION
 * QU'AILLEURS
 * ─────────────────────────────────────────────────────────────────────────────
 * `expense_report_attachments.byte_size` est NULLABLE, à dessein : une pièce
 * peut y être RÉFÉRENCÉE sans qu'on ait jamais vu ses octets, et « non mesuré »
 * n'est pas « 0 ». Ici c'est l'inverse et pour la même raison : un objet de
 * cette table a été ÉCRIT par nous, donc ses octets ont été COMPTÉS en passant.
 * `byte_size NOT NULL CHECK (> 0)` n'est pas une rigueur gratuite — c'est
 * l'affirmation qu'une ligne de cette table correspond à des octets réels.
 *
 * `content_type NOT NULL` pour la même raison : le type est décidé par nous à
 * l'écriture (sur l'EXTENSION, jamais sur ce que le navigateur déclare), donc
 * il est toujours connu.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `object_path` EST UNIQUE — et ce n'est pas une commodité
 * ─────────────────────────────────────────────────────────────────────────────
 * Deux lignes qui pointent le même chemin, c'est une purge qui efface les
 * octets sous les pieds de l'autre. L'unicité en BASE est le seul rempart qui
 * tienne quand deux dépôts concurrents tirent le même identifiant (improbable)
 * ou qu'une reprise rejoue une insertion (fréquent).
 *
 * ⚠️ `domain` est un texte CONTRAINT, pas un enum PostgreSQL : la leçon GA-08
 * coûte cher à chaque ajout, alors qu'un `CHECK` se réécrit sans toucher aux
 * lignes existantes. Il est inscrit au `MAPPING` de GA-12 en face de
 * `STORAGE_DOMAINS`.
 */
export class StorageObjects1790990000001 implements MigrationInterface {
  public name = 'StorageObjects1790990000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS storage_objects (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        domain text NOT NULL,
        object_path text NOT NULL,
        file_name text NOT NULL,
        content_type text NOT NULL,
        byte_size bigint NOT NULL CHECK (byte_size > 0),
        retention_until date NOT NULL,
        uploaded_by uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT storage_objects_domain_check CHECK (domain IN ('expense_receipt', 'need_document'))
      )
    `)
    // Deux lignes sur le même chemin = une purge qui efface les octets de
    // l'autre. L'unicité tient quand le code ne tient pas.
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS storage_objects_path_idx ON storage_objects (object_path)`,
    )
    // « Combien cet espace occupe-t-il » est la question du quota, posée à
    // CHAQUE dépôt : sans cet index elle scannerait tous les espaces.
    // La purge de démonstration efface par `WHERE workspace_id = $1`.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS storage_objects_workspace_idx ON storage_objects (workspace_id)`,
    )
    // « Que faut-il encore garder » est la question de la routine de purge.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS storage_objects_retention_idx ON storage_objects (retention_until)`,
    )
    await queryRunner.query(`
      COMMENT ON TABLE storage_objects IS
        'Le registre des fichiers ranges (31/08/2026). object_path porte le cloisonnement par espace et un identifiant tire au hasard : un chemin ne se devine pas depuis un autre. byte_size et content_type sont NOT NULL parce qu''un objet de cette table a ete ECRIT par nous - ses octets ont ete comptes en passant. retention_until est calculee UNE fois au depot, jamais recalculee.'
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS storage_objects`)
  }
}
