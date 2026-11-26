import type { ChatMessageAuthor } from '../api/agentChatApi'

/**
 * #1910.8 — « CONVERSATION PARTAGÉE », L'ÉTAT DE PÉRIMÈTRE QUI SE MESURE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE N'EST PAS « TOUS LES FILS SONT PARTAGÉS »
 * ─────────────────────────────────────────────────────────────────────────────
 * Un fil de Laura est team-scopé côté serveur depuis la phase 2
 * multi-utilisateur : `GET /chat/messages` résout l'espace de l'appelant et rend
 * le fil de cet espace sans regarder qui l'a écrit (`ShareConversation` le
 * documente, et c'est pour ça que « Partager » n'a aucune API derrière). Donc
 * TOUS les fils sont partageables — une étiquette posée sur tous les fils ne
 * distingue rien et cesse d'être lue au bout de deux jours.
 *
 * Ce qu'on affiche est ce qu'on MESURE : quelqu'un d'autre a écrit ici. À côté
 * de la portée, cela répond à la question que la portée ne couvre pas — « ce fil
 * est-il à moi ? » — et cela change la façon dont on y écrit.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ LA SOUS-ESTIMATION EST ASSUMÉE, ET C'EST LE BON SENS DE L'ERREUR
 * ─────────────────────────────────────────────────────────────────────────────
 * L'API ne rend AUCUN identifiant d'auteur — `WorkspaceAuthor` vaut
 * `{ firstName, avatarUrl }`, délibérément (« jamais d'e-mail ni
 * d'identifiant »). Trois cas échappent donc à la mesure : deux collègues au
 * même prénom, un auteur que le serveur n'a pas su résoudre (`null` : compte
 * effacé, message antérieur au champ), et un profil sans prénom déclaré du côté
 * du lecteur.
 *
 * Dans les trois, on se TAIT. Annoncer « partagée » à tort mettrait un nom de
 * collègue sur ses propres phrases ; ne rien annoncer laisse l'écran exactement
 * comme il était. C'est « non mesuré n'est jamais 0 » transposé à un état
 * d'interface.
 */

type ThreadMessage = { role: 'user' | 'assistant'; author?: ChatMessageAuthor | null }

/**
 * Les prénoms des AUTRES personnes de l'espace qui ont écrit dans ce fil, dans
 * l'ordre où elles apparaissent, sans doublon — ou `null` quand on ne peut rien
 * affirmer (voir l'en-tête du fichier).
 *
 * @param self l'auteur « moi », tel que `selfChatAuthor` le dérive du profil.
 */
export function sharedConversationAuthors(
  messages: readonly ThreadMessage[],
  self: ChatMessageAuthor | null,
): string[] | null {
  const mine = self?.firstName?.trim()
  // Sans mon propre prénom, chaque auteur nommé pourrait être moi.
  if (!mine) return null

  const others: string[] = []
  for (const message of messages) {
    // Une réponse de Laura n'est l'auteur de personne ; une bulle sans champ
    // `author` est celle qu'on vient de taper dans cet onglet, donc la mienne.
    if (message.role !== 'user') continue
    const firstName = message.author?.firstName?.trim()
    if (!firstName || firstName === mine) continue
    if (!others.includes(firstName)) others.push(firstName)
  }
  return others.length > 0 ? others : null
}

/**
 * #1910.8 — RETROUVER ses fils partagés dans la liste, sans rien ouvrir.
 *
 * Arbitré par Louis le 16/09/2026 : « conversation partagée » est un périmètre
 * de LECTURE SEULEMENT — un filtre pour retrouver ces fils, que l'humain lit et
 * que Laura NE lit PAS. Rien de ce qui est calculé ici ne descend vers le
 * modèle : c'est une liste de fils, jamais un contexte (D65).
 *
 * ⚠️ CE QUI EST MESURÉ ICI EST PLUS PAUVRE QUE `sharedConversationAuthors`, et
 * c'est assumé. Une ligne de l'historique ne porte QUE l'auteur qui a OUVERT le
 * fil (`AgentChatHistoryItem.author`) — pas la liste de ceux qui y ont répondu.
 * Un fil que j'ai ouvert et qu'un collègue a repris n'apparaît donc pas dans le
 * filtre ; il porte quand même son bandeau une fois ouvert. Le sens de l'erreur
 * est le bon : on n'annonce jamais « partagée » sur un fil qui ne l'est pas.
 */
export function sharedThreads<T extends { author?: ChatMessageAuthor | null }>(
  threads: readonly T[],
  self: ChatMessageAuthor | null,
): T[] {
  const mine = self?.firstName?.trim()
  // Sans mon propre prénom, chaque auteur nommé pourrait être moi : on se tait.
  if (!mine) return []
  return threads.filter(thread => {
    const firstName = thread.author?.firstName?.trim()
    return Boolean(firstName) && firstName !== mine
  })
}
