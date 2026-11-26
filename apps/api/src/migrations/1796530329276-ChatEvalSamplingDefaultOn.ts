import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #4173 (retour bêta 14/10/2026) — L'ÉCHANTILLONNAGE DE CONVERSATIONS DE LAURA POUR
 * LES ÉVALS, PASSE PAR DÉFAUT À ALLUMÉ.
 *
 * Revirement ASSUMÉ, 3 jours après #2899 (décision Louis 11/10/2026, « éteint par
 * défaut ») : « faut que ce soit par défaut sur tous les espaces activés ». Posé
 * ici, pas dans le code seul, parce que les espaces EXISTANTS doivent aussi en
 * profiter (doctrine #2543 : un correctif de collecte rattrape l'existant) — mais
 * JAMAIS un espace où un propriétaire ou administrateur a déjà tranché, dans un
 * sens ou dans l'autre (une correction humaine gagne toujours, quelle que soit sa
 * date). `chat_eval_sampling_enabled` seul ne distingue pas « jamais touché » de
 * « explicitement décoché » : ce lot ajoute `chat_eval_sampling_chosen_at`
 * (horodatage du dernier PATCH explicite, posé par le code AU-DESSUS de cette
 * migration) et ne bascule que les lignes où il est resté NULL.
 *
 * ⚠️ Limite honnête : la colonne n'existait pas avant CETTE migration, donc TOUTE
 * ligne existante y lit NULL aujourd'hui — y compris un espace qui aurait décoché
 * dans les 3 jours entre #2899 et ce lot. Cette fenêtre n'a laissé aucune trace
 * ailleurs (pas de journal d'activité sur ce réglage) : au-delà de ce lot, le
 * suivi devient fiable ; en-deçà, il n'y avait rien à lire.
 *
 * ⚠️ La salle de DÉMONSTRATION (`workspaces.is_demo`) est EXCLUE du bascule : le
 * service documente « rien n'est échantillonné en salle de démonstration »
 * (`ChatEvalSamplingService`) — ce n'était vrai QUE parce que le défaut était
 * éteint. Le rester y exige de l'exclure explicitement ici.
 *
 * Contrainte élargie AVANT le code qui écrit (GA-11/GA-12) : `chat_eval_sampling_service.ts`
 * (même lot) commence à poser `chat_eval_sampling_chosen_at` seulement une fois
 * cette colonne là.
 */
export class ChatEvalSamplingDefaultOn1796530329276 implements MigrationInterface {
  name = 'ChatEvalSamplingDefaultOn1796530329276'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS chat_eval_sampling_chosen_at timestamptz NULL`,
    )
    await queryRunner.query(`ALTER TABLE workspaces ALTER COLUMN chat_eval_sampling_enabled SET DEFAULT true`)
    await queryRunner.query(`
      UPDATE workspaces
      SET chat_eval_sampling_enabled = true
      WHERE chat_eval_sampling_chosen_at IS NULL
        AND chat_eval_sampling_enabled = false
        AND is_demo = false
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE workspaces ALTER COLUMN chat_eval_sampling_enabled SET DEFAULT false`)
    await queryRunner.query(`ALTER TABLE workspaces DROP COLUMN IF EXISTS chat_eval_sampling_chosen_at`)
  }
}
