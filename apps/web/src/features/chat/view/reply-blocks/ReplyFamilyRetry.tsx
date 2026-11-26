import { useTranslation } from 'react-i18next'
import { Button, Text } from '@bellum/ui'
import { replyFamilyFellBackToText, type ReplyFamilyContext } from '@bellum/contracts'

/**
 * #3758 (BEL-LAU-1001) — « le fallback texte n'apparaît que dans les cas non
 * mappés ou en erreur ».
 *
 * Quand le serveur a reconnu la famille de la demande (`context.reply_family`)
 * et que Laura a pourtant répondu sans la carte attendue (`text_fallback`),
 * l'écran DIT ce repli et offre un geste : relancer la même demande en carte.
 * Cliquer envoie un message ordinaire (`onSend`, le geste de `ReplyOptions`) —
 * rien n'est exécuté, rien ne part dehors. Famille routée et carte rendue
 * (`structured`), ou aucune famille : rien ne s'affiche.
 *
 * La phrase envoyée contient les marqueurs de la famille (test
 * `test_reply_family.py::test_the_retry_prompts_route_back_to_their_family`) :
 * le tour relancé retombe sur la même famille, donc sur la même consigne.
 */
export function ReplyFamilyRetry({
  family,
  content,
  onRetry,
}: {
  family: ReplyFamilyContext | undefined
  /** Le texte rendu de la réponse : une carte acceptée par la famille y fait taire le bandeau (lot L1 07/10). */
  content: string
  onRetry: (message: string) => void
}) {
  const { t } = useTranslation('chat')
  if (!family || !replyFamilyFellBackToText(family, content)) return null
  const prompt = t(`replyFamily.prompt.${family.family}`, { defaultValue: '' })
  // Une famille sans phrase de relance (repli générique) ne propose pas de bouton mort.
  if (!prompt) return null
  return (
    <div className="mt-1 flex flex-wrap items-center gap-2" data-reply-family-retry={family.family}>
      <Text size="xs" color="text-[var(--bellum-text-muted)]">
        {t('replyFamily.textFallback')}
      </Text>
      <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={() => onRetry(prompt)}>
        {t('replyFamily.retry')}
      </Button>
    </div>
  )
}
