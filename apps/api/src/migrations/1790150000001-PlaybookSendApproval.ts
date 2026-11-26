import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Un envoi automatique passe par un humain (arbitrage Louis du 26/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LA MIGRATION AJOUTE, ET POURQUOI PAS UNE TABLE DE PLUS
 * ─────────────────────────────────────────────────────────────────────────────
 * `playbook_sends` porte déjà l'index unique `(espace, playbook, cible)`, qui est
 * ce qui rend « une relance maximum par règle » vrai même quand le balayage est
 * rejoué. Une table d'approbation séparée aurait dupliqué cette clé — et deux
 * clés d'idempotence sur le même geste finissent par diverger, après quoi un
 * client reçoit deux fois la même relance.
 *
 * La ligne d'idempotence DEVIENT donc la demande d'approbation. Elle est posée
 * avant que quoi que ce soit parte, exactement comme avant, et elle porte
 * désormais l'état de la décision.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE DEVIENNENT LES LIGNES EXISTANTES
 * ─────────────────────────────────────────────────────────────────────────────
 * Elles valent `sent`, et c'est VRAI : avant aujourd'hui, une ligne de cette
 * table ne pouvait signifier que « c'est parti ». C'est pour cette raison que
 * `sent` est le défaut de la colonne, et non `pending_approval` — qui aurait
 * fait remonter d'anciens envois dans la file à valider, où quelqu'un les aurait
 * approuvés une seconde fois.
 *
 * `dispatched_at` est renseigné à `sent_at` pour ces mêmes lignes : elles sont
 * parties, et le laisser NULL ferait croire qu'elles ne le sont pas.
 *
 * ⚠️ `sent_at` garde son sens de date de CRÉATION de la ligne (c'est un
 * `CreateDateColumn`), et c'est lui que lit le plafond quotidien — le plafond
 * borne ce qu'un espace peut PRÉPARER dans la journée. La date d'envoi réelle
 * vit désormais dans `dispatched_at`, et les deux divergent dès qu'un humain
 * valide le lendemain.
 *
 * Le `CHECK` couvre exactement `PLAYBOOK_SEND_STATES` — GA-12 compare les deux.
 */
export class PlaybookSendApproval1790150000001 implements MigrationInterface {
  name = 'PlaybookSendApproval1790150000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE playbook_sends
        ADD COLUMN IF NOT EXISTS state text NOT NULL DEFAULT 'sent',
        ADD COLUMN IF NOT EXISTS subject text,
        ADD COLUMN IF NOT EXISTS body text,
        ADD COLUMN IF NOT EXISTS owner_id uuid,
        ADD COLUMN IF NOT EXISTS expires_at timestamptz,
        ADD COLUMN IF NOT EXISTS decided_by uuid,
        ADD COLUMN IF NOT EXISTS decided_at timestamptz,
        ADD COLUMN IF NOT EXISTS decision_reason text,
        ADD COLUMN IF NOT EXISTS dispatched_at timestamptz
    `)

    // Les lignes d'avant sont parties : leur date d'envoi est leur date de ligne.
    await queryRunner.query(`
      UPDATE playbook_sends SET dispatched_at = sent_at WHERE dispatched_at IS NULL AND state = 'sent'
    `)

    await queryRunner.query(`ALTER TABLE playbook_sends DROP CONSTRAINT IF EXISTS playbook_sends_state_check`)
    await queryRunner.query(`
      ALTER TABLE playbook_sends
        ADD CONSTRAINT playbook_sends_state_check
        CHECK (state IN ('sent', 'pending_approval', 'approved', 'rejected', 'expired', 'failed'))
    `)

    // La file à valider est lue à chaque ouverture du centre d'actions, par
    // propriétaire : sans cet index, elle balaye toute la table.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS playbook_sends_pending_idx
        ON playbook_sends (owner_id, state) WHERE state = 'pending_approval'
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS playbook_sends_pending_idx`)
    await queryRunner.query(`ALTER TABLE playbook_sends DROP CONSTRAINT IF EXISTS playbook_sends_state_check`)
    await queryRunner.query(`
      ALTER TABLE playbook_sends
        DROP COLUMN IF EXISTS state,
        DROP COLUMN IF EXISTS subject,
        DROP COLUMN IF EXISTS body,
        DROP COLUMN IF EXISTS owner_id,
        DROP COLUMN IF EXISTS expires_at,
        DROP COLUMN IF EXISTS decided_by,
        DROP COLUMN IF EXISTS decided_at,
        DROP COLUMN IF EXISTS decision_reason,
        DROP COLUMN IF EXISTS dispatched_at
    `)
  }
}
