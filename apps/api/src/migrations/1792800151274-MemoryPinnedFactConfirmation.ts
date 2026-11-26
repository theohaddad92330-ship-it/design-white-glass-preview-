import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Q1 (décision de Louis du 13/09/2026) — UNE NOTE DE LAURA CONFIRMÉE PAR UNE PERSONNE.
 *
 * Une « Note de Laura — à vérifier » (`origin = 'copilot'`) dont une personne
 * réécrit le TEXTE devient « Confirmée par <prénom> » : l'origine est CONSERVÉE
 * (elle a bien été retenue d'une réponse de Laura), et Laura la traite désormais
 * comme un fait déclaré. Changer seulement l'échéance ne confirme rien : une
 * date dit jusqu'à quand un contenu vaut, pas qu'il est vrai.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI DEUX COLONNES, ET PAS L'HISTORIQUE `memory_fact_events`
 * ─────────────────────────────────────────────────────────────────────────────
 * L'historique porte déjà l'auteur de chaque réécriture. Mais la confirmation
 * est lue à CHAQUE tour de Laura (`MemoryService.listFacts` → contexte du
 * modèle) : la dériver du journal ajouterait une sous-requête par tour sur une
 * autre table. Et l'effacement d'un compte remet `actor_user_id` à `null` — une
 * note dont le texte a bel et bien été réécrit par une personne redeviendrait
 * « à vérifier » le jour où cette personne part. `confirmed_at` porte le FAIT
 * (une personne a confirmé, et quand) ; `confirmed_by` porte le NOM, que
 * l'effacement retire (`ON DELETE SET NULL`) sans défaire la confirmation.
 *
 * Porte « ajout seulement » : deux colonnes nullables, aucune ligne réécrite —
 * aucune note existante ne devient confirmée en silence. Migration distincte de
 * `1792800150613` (qui ne crée qu'une table et le vérifie) : une migration, un
 * changement de forme.
 */
export class MemoryPinnedFactConfirmation1792800151274 implements MigrationInterface {
  public name = 'MemoryPinnedFactConfirmation1792800151274'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE memory_pinned_facts ADD COLUMN IF NOT EXISTS confirmed_at timestamptz NULL`)
    await queryRunner.query(
      `ALTER TABLE memory_pinned_facts ADD COLUMN IF NOT EXISTS confirmed_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL`,
    )
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
