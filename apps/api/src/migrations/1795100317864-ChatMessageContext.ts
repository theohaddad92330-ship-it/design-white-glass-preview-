import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #1914.14 — le CONTEXTE d'une réponse de Laura, conservé avec son message.
 *
 * Les composants riches d'une réponse (les sources citées, ce qui n'a PAS été
 * consulté, la question de précision et ses options cliquables) ne vivaient que
 * dans la mémoire de l'onglet : `Chat.tsx` disait en toutes lettres, à deux
 * endroits, « le `context` n'est PAS persisté ». Rouvrir un fil rendait du texte
 * nu. Cette colonne est ce qui manquait pour les RE-RENDRE.
 *
 * ADDITIVE ET NULLABLE (GA-11/GA-12) : le schéma s'élargit AVANT le code qui
 * écrit. `NULL` est l'état de tout l'existant et il se lit « aucun contexte
 * gardé » — exactement ce que l'écran fait déjà aujourd'hui (aucun panneau),
 * jamais un rendu cassé. Aucune valeur n'est réécrite ici, aucun enum n'est
 * touché (GA-08 sans objet).
 *
 * ⚠️ Ce qui entre dans cette colonne est une LISTE BLANCHE, tenue à un seul
 * endroit : `persistedChatContext` (`@bellum/contracts`). Trois champs du
 * contexte servi à l'écran n'y entrent JAMAIS — les propositions brutes du
 * modèle (D65 : le corps d'un message ne sort pas), les droits effectifs du
 * lecteur (ils se lisent, ils ne s'archivent pas) et les cartes (déjà
 * persistées côté serveur par leur tour). La raison de chacun est écrite dans
 * l'en-tête de ce fichier-là.
 *
 * Rétention : AUCUN balayage de plus. Le contexte pend de la ligne du message et
 * part avec elle — fil supprimé, compte effacé (RGPD art. 17), salle de
 * démonstration remise à zéro.
 */
export class ChatMessageContext1795100317864 implements MigrationInterface {
  name = 'ChatMessageContext1795100317864'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS context jsonb;
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE chat_messages DROP COLUMN IF EXISTS context;
    `)
  }
}
