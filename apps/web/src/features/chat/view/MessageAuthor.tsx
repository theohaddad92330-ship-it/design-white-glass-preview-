import { EntityAvatar, cn } from '@bellum/ui'
import type { ChatMessageAuthor } from '@/features/chat/api/agentChatApi'

/**
 * #1940.4 / #1911.6 — le prénom et l'avatar de qui a écrit.
 *
 * Décision de Louis du 12/09 : « prénom + avatar sur chaque message ». Un fil de
 * Laura est une ressource d'ÉQUIPE : sans ce nom, la question d'un collègue et
 * la mienne étaient deux bulles identiques.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'IL AFFICHE, ET CE QU'IL N'AFFICHE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 *  - la photo quand l'API en sert une (https), sinon les INITIALES — jamais une
 *    photo inventée ni une silhouette qui ferait croire à un compte chargé ;
 *  - rien du tout quand il n'y a pas d'auteur : l'appelant ne monte pas ce
 *    composant (compte effacé, ancien message, API antérieure au champ) ;
 *  - un nom ACCESSIBLE complet (« Message de Théo ») : l'avatar et le prénom
 *    visible sont décoratifs pour le lecteur d'écran, sinon il entendrait
 *    « Théo, T, Théo ».
 *
 * ⚠️ Une photo s'AFFICHE, elle ne classe rien (doctrine critères protégés).
 */
export function MessageAuthor({
  author,
  label,
  size = 'bubble',
  className,
}: {
  author: ChatMessageAuthor
  /** La phrase annoncée — « Message de Théo », « Ouverte par Théo ». */
  label: string
  /** `bubble` au-dessus d'une bulle, `meta` dans la ligne d'un fil (240 px). */
  size?: 'bubble' | 'meta'
  className?: string
}) {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5', className)}>
      <EntityAvatar
        aria-hidden
        name={author.firstName}
        src={author.avatarUrl}
        className={cn('shrink-0 text-xs', size === 'bubble' ? 'size-6' : 'size-5')}
      />
      <span aria-hidden className="shrink-0 whitespace-nowrap text-xs text-[var(--bellum-text-muted)]">
        {author.firstName}
      </span>
      <span className="sr-only">{label}</span>
    </span>
  )
}
