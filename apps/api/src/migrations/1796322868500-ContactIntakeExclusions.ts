import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `contact_intake_exclusions` — #2309.16/.19 : POURQUOI un candidat n'est
 * JAMAIS devenu une fiche, avant même sa création.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE TABLE À PART, ET PAS UNE LIGNE DE `contacts`
 * ─────────────────────────────────────────────────────────────────────────────
 * Le funnel de couverture (#2309) compte des FICHES (`contacts.lifecycle_state`).
 * Un candidat écarté pour identité ambiguë (`ContactsService.createFromCrmPresence`,
 * branche `ambiguous`) ou doublon détecté à l'import (`bulkImportManual`, ligne
 * ignorée) n'a JAMAIS de ligne dans `contacts` — « un candidat jamais créé
 * n'entre dans aucun tally de contacts » (bilan #2934 du 27/09). Sans une trace
 * distincte, ce motif reste invisible du funnel pour toujours, quel que soit le
 * nombre d'imports réalisés.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE VOCABULAIRE
 * ─────────────────────────────────────────────────────────────────────────────
 * Deux raisons seulement, les deux seules que le code sait aujourd'hui détecter
 * SANS deviner : `ambiguous_identity` (plusieurs fiches existantes répondent au
 * même identifiant — `createFromCrmPresence`) et `duplicate_identity` (une
 * fiche, à l'import ou à la création CRM, partage déjà un identifiant sans
 * ambiguïté avec une ligne existante ou une autre ligne du même lot). La
 * contrainte est posée AVANT le code qui écrit ces valeurs (GA-11/GA-12).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * AJOUT SEUL
 * ─────────────────────────────────────────────────────────────────────────────
 * Comme `contact_stops` : on archive un événement daté, on ne le corrige ni ne
 * le retire — le funnel qui le relit fait la somme de ce qui s'est produit,
 * pas l'état courant d'une décision.
 */
export class ContactIntakeExclusions1796322868500 implements MigrationInterface {
  public name = 'ContactIntakeExclusions1796322868500'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS contact_intake_exclusions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        account_id uuid NOT NULL,
        reason text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT contact_intake_exclusions_reason_check CHECK (
          reason IN ('ambiguous_identity', 'duplicate_identity')
        )
      )
    `)
    // La question posée par le funnel : « combien, par raison, sur cet espace ? »
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS contact_intake_exclusions_workspace_idx ON contact_intake_exclusions (workspace_id, reason)`,
    )
    await queryRunner.query(
      `COMMENT ON TABLE contact_intake_exclusions IS 'Candidats jamais devenus une fiche (identité ambiguë / doublon à l’import). Ajout seul.'`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS contact_intake_exclusions`)
  }
}
