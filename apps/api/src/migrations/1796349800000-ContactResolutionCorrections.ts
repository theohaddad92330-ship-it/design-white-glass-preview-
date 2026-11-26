import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2159.35 — LA CORRECTION DE RAPPROCHEMENT DE CONTACT, VERSIONNÉE PAR L'ESPACE.
 *
 * L'écriture de l'import ne dédoublonne un contact que par E-MAIL
 * (`ImportWriterService.existingKeys`) : une ligne dont l'e-mail matche une
 * fiche déjà en base MET À JOUR cette fiche. Un e-mail générique partagé
 * (`accueil@`, `secretariat@`) peut faire matcher une ligne sur la MAUVAISE
 * personne réelle, import après import, sans qu'aucun humain ne puisse
 * corriger ce rapprochement une fois pour toutes — le trou que #2159.35 nomme.
 *
 * Registre SÉPARÉ de `entity_resolution_corrections` (comptes, #2284.67-.69) :
 * celui-là superpose un verdict CALCULÉ sur des candidats nommés (SIREN,
 * raison sociale) ; celui-ci répond à une question plus étroite — « cette
 * fiche est-elle la bonne pour CETTE clé de rapprochement, à l'import ? » —
 * jamais réutilisé tel quel (tranché : un registre non vérifié pour ce
 * domaine ne se recopie pas, il se répond).
 *
 * Mêmes trois garanties, même forme que son homologue des comptes :
 *  · **versionnée** : une LIGNE PAR GESTE, jamais mise à jour ni supprimée —
 *    la plus haute version gagne (une correction humaine gagne toujours,
 *    quelle que soit sa date), les précédentes restent lisibles (on archive,
 *    on ne supprime pas). L'unicité `(workspace_id, contact_id, version)`
 *    fait échouer deux gestes simultanés plutôt que d'en garder deux sous le
 *    même numéro ;
 *  · **scopée à l'espace** : `workspace_id` NOT NULL — les espaces sont des
 *    ESN concurrentes, la décision de l'une n'est jamais la vérité d'une autre ;
 *  · **pas de confiance** : une décision humaine n'est pas probable, elle est
 *    prise (doctrine « aucune probabilité »).
 *
 * `dedup_key` est figée au moment du geste (comme `target_name`/`target_siren`
 * sur le registre des comptes), jamais recalculée après coup : un e-mail qui
 * change sur la fiche ne réécrit pas silencieusement une décision déjà prise.
 *
 * PORTE « AJOUT SEULEMENT » : création pure, `CHECK` posés DÈS LA CRÉATION —
 * la contrainte précède le code qui écrit la valeur (GA-11 / GA-12).
 */
export class ContactResolutionCorrections1796349800000 implements MigrationInterface {
  name = 'ContactResolutionCorrections1796349800000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS contact_resolution_corrections (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
        version integer NOT NULL,
        decision text NOT NULL,
        dedup_key text NOT NULL,
        note text NULL,
        decided_by uuid NOT NULL,
        decided_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT contact_resolution_corrections_decision_check CHECK (decision IN ('confirmed', 'rejected')),
        CONSTRAINT contact_resolution_corrections_dedup_key_check CHECK (dedup_key <> ''),
        CONSTRAINT contact_resolution_corrections_version_check CHECK (version >= 1)
      )
    `)
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS contact_resolution_corrections_version_unique ON contact_resolution_corrections (workspace_id, contact_id, version)`,
    )
    // #2159.35 — la lecture de l'import (`existingKeys`) filtre les REJETS les
    // plus récents PAR CONTACT sur tout l'espace, à chaque simulation : sans
    // cet index, cette lecture dégraderait en scan complet à mesure que le
    // registre grandit.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS contact_resolution_corrections_workspace_idx ON contact_resolution_corrections (workspace_id, contact_id)`,
    )
    await queryRunner.query(`ALTER TABLE contact_resolution_corrections ENABLE ROW LEVEL SECURITY`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS contact_resolution_corrections`)
  }
}
