import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * La PREUVE qu'une capacité de connecteur fonctionne (PDF 7 §1, §2 et §6.2).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE TABLE POUR ÇA
 * ─────────────────────────────────────────────────────────────────────────────
 * Le registre savait dire « connecté » et « dernière activité ». Ni l'un ni
 * l'autre ne prouve qu'une lecture MARCHE : le 16/08/2026, le compte Google
 * était connecté, les portées accordées, `/agenda/status` répondait
 * « lecture : oui » — et l'API Agenda n'avait jamais été activée sur le projet.
 * L'agenda était vide depuis des semaines et rien, nulle part, ne pouvait le
 * dire.
 *
 * La règle du PDF est donc : « `sain` n'est jamais déclaré. Il est dérivé des
 * portées accordées ET d'un test réel. » Cette table est ce test réel, gardé.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ON GARDE, ET CE QU'ON NE GARDE JAMAIS
 * ─────────────────────────────────────────────────────────────────────────────
 * `last_proof_sample` porte le NOM d'un objet réel — « Perso, Équipe, Client
 * EDF ». C'est ce qui rend la preuve crédible : « 10 agendas » sans les nommer
 * pourrait être un compteur qui ment. Ce n'est JAMAIS le contenu d'un message
 * ni d'un fichier ; le PDF trace la ligne explicitement, et une preuve n'a pas
 * besoin d'aller plus loin qu'un titre.
 *
 * `last_error_code` emploie le vocabulaire fermé de `connector-error.ts`. Un
 * message d'erreur brut du fournisseur contiendrait des identifiants de projet
 * et des URL de console : il appartient aux journaux, pas à une table lue par
 * l'écran.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA MAILLE
 * ─────────────────────────────────────────────────────────────────────────────
 * (espace, fournisseur, capacité). Pas l'utilisateur : une preuve porte sur la
 * CONNEXION, et une connexion CRM est celle de l'espace. Pour la messagerie et
 * l'agenda — qui redeviennent personnels — la preuve suit la connexion de son
 * propriétaire via `user_id`, laissé nullable tant que les deux régimes
 * coexistent.
 */
export class ConnectorCapabilityProbes1789910000001 implements MigrationInterface {
  name = 'ConnectorCapabilityProbes1789910000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS connector_capability_probes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        user_id uuid,
        provider text NOT NULL,
        capability text NOT NULL,
        last_proof_at timestamptz,
        last_proof_sample text,
        last_error_code text,
        last_error_at timestamptz,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `)
    // Une preuve par (espace, outil, capacité) : la dernière écrase la
    // précédente. Un historique n'apprendrait rien de plus — ce qui compte est
    // « est-ce que ça marchait il y a quatre minutes », pas la courbe.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS connector_capability_probes_uidx
        ON connector_capability_probes (workspace_id, provider, capability)
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS connector_capability_probes_workspace_idx
        ON connector_capability_probes (workspace_id)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS connector_capability_probes`)
  }
}
