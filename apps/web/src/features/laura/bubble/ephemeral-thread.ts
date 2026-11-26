import { createAgentChatMessage } from '@/features/chat/api/agentChatApi'
import { newConversationId } from '@/features/chat/lib/conversation'
import type { PendingChatAction } from '@bellum/contracts'

/**
 * LE FIL ÉPHÉMÈRE DE LA BULLE — pourquoi il ne s'archive pas, et comment il se
 * promeut quand la conversation devient sérieuse.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * « ON ARCHIVE, ON NE SUPPRIME PAS » — ET POURQUOI CETTE EXCEPTION EST ÉCRITE
 * ─────────────────────────────────────────────────────────────────────────────
 * La doctrine du dépôt est nette : un fait périmé redevient inconnu avec sa
 * date, il ne disparaît pas. Ce fil-ci n'est pas un fait — c'est une question
 * posée en passant : « c'est quoi ce chiffre ? », « où je trouve ça ? »,
 * « résume-moi ce compte avant l'appel ». Trente de ces questions par jour dans
 * l'historique de `/chat`, et l'historique cesse d'être relisible : le
 * commercial y cherche la conversation où il a préparé sa proposition, et il
 * traverse un journal de bord.
 *
 * L'exception porte donc sur une CATÉGORIE d'échange, pas sur un genre de
 * donnée, et elle a sa porte de sortie : **tout fil éphémère peut être PROMU**
 * (voir `promoteEphemeralThread`). Sans cette porte, l'éphémère serait une
 * perte, et une perte ne se décide pas à la place de quelqu'un.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * OÙ IL VIT, ET COMBIEN DE TEMPS
 * ─────────────────────────────────────────────────────────────────────────────
 * **Dans la mémoire du composant qui monte la bulle, et rien d'autre.** Ni
 * `localStorage`, ni `sessionStorage`, ni `chat_messages`.
 *
 * La bulle est montée à la RACINE du routeur, à côté de `<Outlet />` : le fil
 * survit donc à un changement de page — y compris pendant qu'une réponse est en
 * vol — et meurt avec l'onglet, un rechargement, ou le geste « effacer ». C'est
 * le comportement qu'on veut, et il découle du point de montage plutôt que
 * d'une règle à faire respecter :
 *
 *  · **changer de page ne coupe pas la réponse.** L'inverse aurait été un piège :
 *    on pose une question sur un écran, on va vérifier autre chose pendant qu'elle
 *    calcule, et on perd la réponse pour l'avoir attendue au mauvais endroit.
 *  · **le CONTEXTE, lui, est figé à l'envoi.** Chaque message porte l'écran
 *    depuis lequel il a été posé, parce qu'une réponse qui parle de la
 *    facturation de mars ne doit pas devenir « la réponse sur le vivier » parce
 *    qu'on a navigué entre-temps. C'est le champ `askedFrom`.
 *  · **un rechargement efface.** Restaurer un fil éphémère au rechargement en
 *    ferait un fil persistant sous un autre nom — et un demi-état persistant est
 *    pire que pas d'état du tout : il ressuscite sans son contexte serveur.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ÉPHÉMÈRE NE VEUT DIRE NI GRATUIT NI INVISIBLE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le tour passe par `askLaura`, donc par `POST /ia/chat`, donc par
 * `assertChatQuota` — qui compte les messages de rôle `user` par UTILISATEUR sur
 * 24 h glissantes, à l'entrée du contrôleur, avant tout appel au modèle. Ne pas
 * persister le fil ne soustrait rien : c'est l'appel qui est compté, pas la
 * ligne écrite. Le budget du tour (90 s, plafond dur 105 s) et la trace
 * d'observabilité s'appliquent à l'identique.
 */

/** Un message du fil éphémère. */
export type EphemeralMessage = {
  role: 'user' | 'assistant'
  content: string
  at: Date
  /**
   * L'écran depuis lequel CE message a été posé, tel qu'il s'affichait.
   *
   * `null` quand aucun écran ne déclarait rien. Il sert à deux choses, et à
   * aucune autre : montrer « posée depuis … » quand la personne a changé de
   * page, et empêcher de relire une réponse comme si elle parlait de l'écran
   * courant.
   */
  askedFrom: string | null
  /**
   * #1901.10 — ce que Laura PROPOSE avec cette réponse (`pending_actions`), tel
   * que le serveur le rend à l'écran `/chat`.
   *
   * La bulle le jetait : « je te propose de le retenir » arrivait sans la carte
   * qui permet de le retenir. Même règle que la page, où le `context` n'est pas
   * persisté non plus : une promotion (« garder ») écrit le TEXTE, jamais une
   * carte qu'on validerait hors de son tour.
   */
  pendingActions?: PendingChatAction[]
  /**
   * #2452.1 / épopée #2907 — le compte que CE tour cadrait (écran de compte ou
   * amorce `<AskLaura accountId>`), figé au moment de la question. C'est le
   * repli de « Aller plus loin sur cette réponse » quand la réponse ne cite
   * aucun compte — la même règle que l'écran `/chat` (`fallbackAccountId`).
   * Posé sur une réponse RÉUSSIE seulement : un échec ne s'approfondit pas.
   */
  accountId?: string
}

/**
 * La clé de fil d'une bulle.
 *
 * ⚠️ Le préfixe n'est PAS décoratif. La clé voyage jusqu'au serveur, qui roule
 * un résumé de conversation par clé (`conversation_summaries`) : une bulle qui
 * réutiliserait `general` mélangerait sa mémoire longue avec celle de l'écran
 * `/chat`, et une question posée en passant déformerait la conversation de
 * travail. Une clé neuve par ouverture de bulle, préfixée pour être
 * reconnaissable en base.
 */
export function newBubbleConversationId(): string {
  return `bubble-${newConversationId()}`
}

/**
 * PROMOUVOIR le fil — « garde ça ».
 *
 * Il est réécrit sous une clé de fil NEUVE et NORMALE (sans le préfixe
 * `bubble-`), message par message, dans l'ordre. La clé change à dessein : le
 * résumé roulé côté serveur pour la clé éphémère décrit une conversation de
 * couloir, et le fil promu commence sa vie propre.
 *
 * ⚠️ Les messages sont écrits **en séquence** et non en parallèle. `created_at`
 * est le seul ordre que la relecture connaît (`chat_messages_conversation_idx`),
 * et six `POST` lancés ensemble arrivent dans l'ordre du réseau — c'est-à-dire
 * un fil dont les réponses précèdent les questions.
 *
 * Rejette si une écriture échoue : contrairement à la persistance de `/chat`,
 * qui est du confort par-dessus un fil déjà affiché, ici l'écriture EST le
 * geste. Une promotion à moitié écrite qu'on annoncerait réussie serait pire
 * qu'un échec dit.
 */
export async function promoteEphemeralThread(args: {
  messages: readonly EphemeralMessage[]
  accountId: string | null
}): Promise<{ conversationId: string }> {
  const conversationId = newConversationId()
  for (const message of args.messages) {
    await createAgentChatMessage({
      accountId: args.accountId,
      conversationId,
      role: message.role,
      content: message.content,
    })
  }
  return { conversationId }
}
