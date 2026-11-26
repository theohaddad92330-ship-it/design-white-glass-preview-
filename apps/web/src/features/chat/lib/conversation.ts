import type { AgentChatHistoryItem } from '@/features/chat/api/agentChatApi'

/**
 * Ce qui désigne une conversation de Laura, partagé par les surfaces qui en
 * ouvrent une : l'écran `/chat`, la liste de la barre latérale, et le lanceur.
 *
 * Chacune avait sa propre copie. Deux d'entre elles auraient fini par diverger
 * — c'est la leçon de `withDedupInputs` : une dérivation vit à UN seul endroit,
 * sinon la simulation et l'écriture ne répondent plus la même chose.
 */

/**
 * L'identifiant d'un fil NEUF.
 *
 * `crypto.randomUUID` n'existe pas partout (contexte non sécurisé, très vieux
 * navigateur) : le repli n'a pas à être cryptographique, il a juste à ne pas
 * collisionner avec le fil d'à côté.
 */
export function newConversationId(): string {
  const uuid = globalThis.crypto?.randomUUID?.()
  return uuid ?? `thread-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
}

/**
 * #1911.11 — LA RECHERCHE VOIT CE QUE LA LISTE MONTRE, et rien de plus.
 *
 * Elle ne portait que sur le titre. Le panneau, lui, affiche aussi le NOM DU
 * COMPTE du fil (#1911.10, `accountNameOf`) — il groupe même par compte
 * (#1911.7) — et le PRÉNOM de qui l'a ouvert (#1911.4). Chercher « PAYFIT » ne
 * rendait donc rien sur un fil intitulé « Relance après le webinar » alors que
 * le mot est à l'écran deux lignes plus bas, et le résultat vide se lit « ce fil
 * n'existe pas ». C'est la règle déjà appliquée à la modale de portée : on
 * cherche sur l'intitulé ET sur son compte.
 *
 * ⚠️ La borne est l'INVERSE aussi : ce que la liste n'affiche PAS ne se cherche
 * pas. Un identifiant technique ferait « trouver » un fil sur une chaîne que
 * personne ne peut lire, donc sur un hasard.
 *
 * Elle reste CÔTÉ CLIENT, donc bornée aux fils chargés (`/ia/chat/history` en
 * rend 20 par défaut) — c'est le retour INSTANTANÉ, avant toute réponse
 * réseau. `ConversationsPanel` la complète depuis le 15/09 par
 * `searchAgentChatThreads` (#1911.11, `GET chat/threads/search`), qui parcourt
 * tout l'historique ; `mergeSearchResults` ci-dessous combine les deux sans
 * jamais retirer un résultat que ce filtre-ci avait déjà trouvé.
 *
 * Insensible à la casse ET aux accents : un commercial tape « latecoere ».
 */
export function filterThreads(threads: readonly AgentChatHistoryItem[], query: string): AgentChatHistoryItem[] {
  const needle = fold(query)
  if (!needle) return [...threads]
  return threads.filter(thread =>
    fold([thread.title ?? '', thread.account_name ?? '', thread.author?.firstName ?? ''].join(' ')).includes(needle),
  )
}

/**
 * #1911.11 / #1955.2 — fusionne le résultat INSTANTANÉ (`filterThreads`, la page
 * déjà chargée) avec celui du SERVEUR (`searchAgentChatThreads`, tout
 * l'historique).
 *
 * Une UNION, jamais un remplacement : un échec réseau, ou la fenêtre pendant
 * laquelle la réponse du serveur n'est pas encore arrivée, ne doit jamais faire
 * disparaître un fil que le filtre local avait déjà trouvé — c'est exactement le
 * défaut qu'une recherche qui « recharge » la liste commettrait.
 *
 * LE LOCAL D'ABORD, puis ce que le serveur ajoute, chacun dans l'ordre où il
 * arrive (les deux corpus sont déjà servis par récence). On n'entrelace PAS par
 * date : la réponse serveur arrive APRÈS coup, et un tri global insérerait des
 * lignes au milieu — la liste se réordonnerait sous le doigt au moment précis où
 * l'utilisateur vise un résultat qu'il voit déjà. Ajouter à la fin ne déplace
 * rien de ce que l'œil a déjà lu.
 *
 * L'identité est `conversation_id ?? id`, et pas `id` seul : c'est le
 * `conversation_id` qui DÉSIGNE le fil, plusieurs lignes peuvent le porter, et
 * dédupliquer par ligne afficherait alors deux fois la même conversation. Les
 * fils anciens qui n'en portent pas se distinguent par leur ligne gardée.
 */
export function mergeSearchResults(
  local: readonly AgentChatHistoryItem[],
  remote: readonly AgentChatHistoryItem[],
): AgentChatHistoryItem[] {
  const byThread = new Map<string, AgentChatHistoryItem>()
  for (const item of local) byThread.set(threadKeyOf(item), item)
  for (const item of remote) if (!byThread.has(threadKeyOf(item))) byThread.set(threadKeyOf(item), item)
  return [...byThread.values()]
}

/**
 * L'identité d'un fil pour la déduplication de la recherche.
 *
 * `conversation_id` d'abord : c'est LUI qui désigne le fil. Les fils anciens qui
 * n'en portent pas se distinguent par la ligne gardée (`id`) — jamais par le
 * seul `account_id`, qui en confondrait plusieurs.
 */
function threadKeyOf(thread: AgentChatHistoryItem): string {
  return thread.conversation_id ?? thread.id
}

/**
 * #3367 — LA MÊME QUESTION, DEUX LIGNES.
 *
 * Recette du 30/09 : « la liste des fils affiche des doublons — même fil en
 * "En attente" (`href /chat`, donc SANS `conversation_id`) et en "Reçu"
 * (`href ?conversationId=`) — visible sur tous les fils du jour. »
 *
 * `threadKeyOf` (au-dessus) ne les confond JAMAIS — c'est justement ce qu'il
 * garantit pour deux lignes d'un fil ANCIEN qui n'a jamais porté de
 * `conversation_id` : chacune reste sa propre ligne, distinguée par son `id`.
 * Il ne peut donc pas être la clé qui réunit ICI la ligne sans
 * `conversation_id` et celle, plus tard, qui en porte le vrai — ce sont deux
 * IDENTITÉS différentes tant que la seconde n'a pas remplacé la première.
 *
 * Le repère est celui que l'œil compare, pas un identifiant technique : même
 * TITRE, même COMPTE. Une ligne SANS `conversation_id` s'efface dès qu'une
 * autre, du même titre et du même compte, EN PORTE un — c'est elle que le
 * clic doit ouvrir, et son statut (souvent plus avancé : « reçu » contre
 * « en attente ») est le vrai.
 *
 * #3367.1 — recette du 30/09 (après la première correction) : « la liste
 * GARDE dix lignes "En attente" sans conversationId que la déduplication ne
 * couvre pas. » Une ligne sans `conversation_id` n'a pas TOUJOURS une sœur
 * avec un vrai identifiant pour la faire disparaître — deux tentatives d'UNE
 * même question, envoyées avant que la première n'ait abouti, restent
 * TOUTES LES DEUX sans `conversation_id` pour toujours : rien, dans la règle
 * ci-dessus, ne les compare JAMAIS l'une à l'autre. Même repère (même titre,
 * même compte), appliqué maintenant ENTRE deux lignes sans `conversation_id` :
 * la plus RÉCENTE (la liste arrive déjà triée par activité) reste, les
 * tentatives plus anciennes de la MÊME question s'effacent.
 */
export function dedupeThreads(threads: readonly AgentChatHistoryItem[]): AgentChatHistoryItem[] {
  const titledElsewhere = new Set(
    threads.filter(item => item.conversation_id && item.title).map(item => threadTitleKeyOf(item)),
  )
  const keptWithoutConversationId = new Set<string>()
  return threads.filter(item => {
    if (item.conversation_id || !item.title) return true
    if (titledElsewhere.has(threadTitleKeyOf(item))) return false
    const key = threadTitleKeyOf(item)
    if (keptWithoutConversationId.has(key)) return false
    keptWithoutConversationId.add(key)
    return true
  })
}

function threadTitleKeyOf(thread: AgentChatHistoryItem): string {
  return `${thread.title}\u0000${thread.account_id ?? ''}`
}

function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}
