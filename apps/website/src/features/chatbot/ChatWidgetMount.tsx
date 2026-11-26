import { ChatWidget } from './ChatWidget'

/**
 * Le point de montage de Laura — et son interrupteur.
 *
 * Composant SERVEUR : il lit la clé qui fait vivre `/api/chat` et ne rend le
 * widget que si elle existe. Sans clé, **no-op strict** — aucun bouton, aucun
 * script, aucune requête. C'est la règle du dépôt pour toute capacité
 * optionnelle, et elle compte double ici : un chatbot présent qui répond « une
 * erreur est survenue » à chaque message, sur la page d'accueil, coûte plus de
 * visiteurs qu'il n'en convertit.
 *
 * La clé ne traverse jamais la frontière : elle est LUE ici, le widget ne reçoit
 * qu'un booléen implicite — sa propre existence.
 */
export function ChatWidgetMount() {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) return null
  return <ChatWidget />
}
