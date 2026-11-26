import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `person_erasures` — « cette personne a exercé son droit à l'effacement »
 * (#2297, RGPD art. 17, décision Louis du 19/09/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LA TABLE PORTE, ET SURTOUT CE QU'ELLE NE PORTE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * L'effacement SUPPRIME la fiche et tout ce qui la nomme — la seule exception
 * à « on archive, on ne supprime pas » (doctrine `c67`). Mais une suppression
 * sèche serait défaite à la prochaine analyse : le registre ou le fournisseur
 * rendrait la même personne, et elle réapparaîtrait comme si de rien n'était.
 *
 * On garde donc une trace, et elle ne contient AUCUNE donnée de la personne :
 *   - `erased_by` / `erased_at` : QUI a effacé et QUAND (un membre de
 *     l'espace, pas la personne effacée) ;
 *   - `fingerprints` : des HMAC-SHA-256 (#2297.51, clé dédiée) de ses clés d'identité, par
 *     l'espace (`person-erasure-fingerprint.ts`). Ils servent à UNE question —
 *     « cette personne entrante a-t-elle été effacée ? » — posée à l'entrée de
 *     la collecte et de l'enrichissement. Un condensat ne se relit pas en nom.
 *
 * La contrainte `person_erasures_fingerprints_check` fait tenir la promesse par
 * la BASE : une valeur qui ne serait pas un condensat hexadécimal de 64
 * caractères — un e-mail en clair glissé par erreur — est refusée à l'écriture.
 *
 * Pas de `contact_id` : la ligne qu'il désignerait n'existe plus, et un
 * identifiant qui pointe vers le vide invite à « retrouver » ce qu'il
 * désignait.
 */
export class PersonErasures1789811614640 implements MigrationInterface {
  public name = 'PersonErasures1789811614640'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS person_erasures (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        erased_by uuid NULL,
        erased_at timestamptz NOT NULL DEFAULT now(),
        fingerprints text[] NOT NULL,
        CONSTRAINT person_erasures_fingerprints_check CHECK (cardinality(fingerprints) >= 1 AND array_to_string(fingerprints, ',') ~ '^[0-9a-f]{64}(,[0-9a-f]{64})*$')
      )
    `)
    // La question posée à chaque collecte : « une de ces empreintes est-elle
    // déjà effacée dans cet espace ? » — un recouvrement de tableaux.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS person_erasures_fingerprints_idx ON person_erasures USING gin (fingerprints)`,
    )
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS person_erasures_workspace_idx ON person_erasures (workspace_id)`,
    )
    await queryRunner.query(`ALTER TABLE person_erasures ENABLE ROW LEVEL SECURITY`)
    await queryRunner.query(
      `COMMENT ON TABLE person_erasures IS 'Effacements RGPD art. 17 : qui, quand, empreintes non réversibles. Aucune donnée de la personne.'`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS person_erasures`)
  }
}
