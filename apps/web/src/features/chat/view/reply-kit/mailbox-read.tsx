import { useTranslation } from 'react-i18next'
import { Mail } from 'lucide-react'
import { Text } from '@bellum/ui'

/** L'outil de Laura qui lit un fil de LA boîte du commercial qui la sollicite (c96). */
const READ_MAIL_THREAD_TOOL = 'read_mail_thread'

/**
 * #4016.L3.a — « Laura a lu ce fil ». Une ligne sous la réponse quand le tour a
 * lu le corps d'un fil de la messagerie.
 *
 * Doctrine tenue ici, pas chez l'appelant :
 *  - jamais montré à un collègue : seul l'AUTEUR du tour (`ownTurn`) la voit —
 *    c'est SA boîte qui a été lue ;
 *  - le CORPS du message n'est jamais exposé : la ligne dit le fait, pas le contenu
 *    (ni objet, ni extrait, ni interlocuteur) ;
 *  - sans trace de lecture dans le tour : AUCUNE ligne.
 */
export function ReplyMailboxRead({
  toolsCalled,
  ownTurn,
  placement = 'footer',
}: {
  toolsCalled: readonly string[] | null | undefined
  ownTurn: boolean
  /** #4016.3c — `source` : la même mention, dans le panneau « Voir la source ». */
  placement?: 'footer' | 'source'
}) {
  const { t } = useTranslation('chat')
  if (!ownTurn || !toolsCalled?.includes(READ_MAIL_THREAD_TOOL)) return null
  return (
    <Text
      size="xs"
      color="text-[var(--bellum-text-muted)]"
      className="inline-flex items-center gap-1"
      {...(placement === 'source' ? { 'data-mailbox-read-source': true } : { 'data-mailbox-read': true })}
    >
      <Mail className="size-3" aria-hidden />
      {t(placement === 'source' ? 'replyMailboxRead.source' : 'replyMailboxRead.label')}
    </Text>
  )
}
