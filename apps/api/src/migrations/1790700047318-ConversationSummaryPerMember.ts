import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Un résumé de conversation appartient à la PERSONNE, pas à l'espace.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI ÉTAIT MESURÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * `1784900700000-LongMemory` a créé `conversation_summaries` avec un index
 * unique `(workspace_id, conversation_id)` — donc UNE ligne par espace et par
 * fil. Le web envoie `conversation_id = "general"` pour le fil par défaut
 * (`apps/web/src/features/chat/view/Chat.tsx`, `GENERAL_CONVERSATION_ID`), et
 * la clé dérivée `account:<uuid>` a exactement la même propriété. Dans un
 * espace à plusieurs sièges — une ESN a plusieurs business managers, qui se
 * partagent un portefeuille et parfois se disputent des comptes — tous les
 * membres écrivaient et lisaient LA MÊME ligne. Deux extraits de 200 caractères
 * par échange, à chaque message, réinjectés dans le prompt système de chacun
 * sous « Résumé de la conversation jusqu'ici ».
 *
 * La table se contredisait déjà elle-même : sa POLITIQUE RLS dit
 * `auth.uid() = user_id` — une portée par personne — pendant que son index
 * unique disait « une ligne par espace ». L'API se connecte en service role et
 * ne voit donc jamais la RLS ; c'est l'index qui décrivait le comportement réel.
 * Cette migration aligne l'index sur ce que la RLS déclarait depuis le début.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES LIGNES DÉJÀ ÉCRITES — ARCHIVÉES, PAS SUPPRIMÉES
 * ─────────────────────────────────────────────────────────────────────────────
 * Elles mélangent les mots de plusieurs personnes et RIEN ne dit qui a écrit
 * quoi : `user_id` n'y désigne que le PREMIER auteur, pas les suivants. On ne
 * peut donc ni les redistribuer, ni les rendre à leur auteur.
 *
 * Filtrer la lecture sur `user_id` ne suffirait pas : le premier auteur, lui,
 * continuerait de relire une ligne qui contient les mots de ses collègues.
 * D'où `superseded_at`, posé sur TOUTES les lignes existantes — le contenu
 * reste (on archive, on ne supprime pas), la lecture cesse. Toutes, et pas
 * seulement celles qu'on croit mélangées : on ne sait pas lesquelles le sont,
 * et « non mesuré » n'est pas « mesuré à zéro collègue ».
 *
 * Conséquence assumée : chacun repart d'un résumé vide une fois. Le fil
 * lui-même (`chat_messages`) n'est pas touché et continue d'alimenter
 * l'historique envoyé au modèle — c'est la mémoire ROULANTE qui se réamorce.
 *
 * ⚠️ Mise à jour du 30/08 : une purge automatique existe désormais. Le balayage
 * de rétention (`privacy-retention.service.ts`, 04:17) efface les lignes
 * ARCHIVÉES au-delà de `RETENTION_DAYS_ARCHIVED_SUMMARIES` (90 j par défaut,
 * comptés depuis `superseded_at`), par lots bornés. Ce que la décision parquée
 * **D157** (§12.6 du dossier du 26/08 — et non « D147 », citation corrigée)
 * appelait « les garder trois mois » est donc appliqué ; ce qu'elle appelait
 * « supprimer maintenant » reste à trancher par un humain, avec sa requête
 * exacte, parce qu'une suppression immédiate de tout l'arriéré est un geste
 * destructif qui ne se décide pas en passant.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ORDRE DES INSTRUCTIONS
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. la colonne d'archivage ;
 * 2. l'estampille sur l'existant (avant l'index, pour qu'il naisse sur un
 *    ensemble propre) ;
 * 3. le nouvel index unique PARTIEL — au plus un résumé VIVANT par
 *    (personne, espace, fil) ; les lignes archivées ne sont plus contraintes,
 *    sans quoi la première écriture du premier auteur entrerait en collision
 *    avec sa propre ligne archivée ;
 * 4. l'ancien index, retiré en dernier : tant qu'il existe, la première
 *    écriture d'un SECOND membre est rejetée en 23505.
 *
 * ⚠️ `workspace_id` est NULLABLE et Postgres traite deux NULL comme distincts
 * dans un index unique : la contrainte ne dédoublonne pas les lignes sans
 * espace. C'était déjà vrai de l'index précédent, et ce n'est pas ce qui protège
 * la lecture — c'est le `WHERE` du service. Le chemin d'écriture résout toujours
 * un espace (`resolveActiveWorkspace`) avant d'appeler la mémoire.
 *
 * Additive et idempotente (`ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT
 * EXISTS`, `DROP INDEX IF EXISTS`) : rejouable sans dégât.
 */
export class ConversationSummaryPerMember1790700047318 implements MigrationInterface {
  public name = 'ConversationSummaryPerMember1790700047318'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE conversation_summaries ADD COLUMN IF NOT EXISTS superseded_at timestamptz`)

    // Toute ligne écrite sous l'ancienne portée est retirée de la LECTURE. Elle
    // n'est ni effacée ni réécrite : seule une estampille est posée.
    await queryRunner.query(`
      UPDATE conversation_summaries
        SET superseded_at = now()
        WHERE superseded_at IS NULL
    `)

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS conversation_summaries_owner_uidx
        ON conversation_summaries (user_id, workspace_id, conversation_id)
        WHERE superseded_at IS NULL
    `)

    await queryRunner.query(`DROP INDEX IF EXISTS conversation_summaries_scope_uidx`)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
