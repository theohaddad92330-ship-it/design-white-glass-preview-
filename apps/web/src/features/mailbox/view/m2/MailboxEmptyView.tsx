import { Box, Button, EmptyState } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

/**
 * Théo B m2-brouillons.R5 — une vue vide le dit en deux phrases : « Rien dans cette vue. Les autres vues restent
 * disponibles. », avec « Retirer les filtres » quand un filtre est posé, puis l'invitation à préparer un message.
 */
export function MailboxEmptyView({ onClear, onNewMessage }: { onClear?: () => void; onNewMessage?: () => void }) {
  const { t } = useTranslation('mailbox')
  return (
    <Box className="flex flex-col items-start gap-2">
      <EmptyState
        size="sm"
        align="start"
        title={t('m2.empty.title')}
        description={t('m2.empty.description')}
        action={
          onClear ? (
            <Button size="sm" variant="outline" className="min-h-11" onClick={onClear}>
              {t('m2.empty.clear')}
            </Button>
          ) : undefined
        }
      />
      <Box className="flex flex-col gap-1 pl-1">
        <p className="text-sm font-medium">{t('m2.empty.inviteTitle')}</p>
        <p className="text-sm text-[var(--bellum-text-secondary)]">{t('m2.empty.inviteBody')}</p>
        {/* Théo B m2 — « Nouveau message » ouvre « À qui veux-tu écrire ? » ; sans dialogue, le répertoire. */}
        {onNewMessage ? (
          <Button size="sm" variant="outline" className="min-h-11 w-fit" onClick={onNewMessage}>
            {t('m2.empty.newMessage')}
          </Button>
        ) : (
          <Button asChild size="sm" variant="outline" className="min-h-11 w-fit">
            <Link to="/contacts">{t('m2.empty.newMessage')}</Link>
          </Button>
        )}
      </Box>
    </Box>
  )
}
