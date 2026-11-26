import { useTranslation } from 'react-i18next'
import { DropdownMenuCheckboxItem } from '@bellum/ui'
import { useConversationContextMode } from '@/features/work-contexts/useConversationContextMode'

/**
 * #5048 — « Mon profil » dans le « + », sous 768 px une fois le fil commencé (la rangée d'outils
 * se tait alors, #3050 / GA-28). Même interrupteur binaire Mon activité ↔ Neutre que
 * `ComposerProfileControl` (revient sur #5048 menu 3 choix : arbitrage Louis 01/11/2026), même
 * magasin : un réglage, deux accès jamais montés ensemble (`showHiddenComposerTools`, GA-26).
 * « Mission ponctuelle » s'y affiche éteinte et nommée.
 */
export function ComposerProfileMenu({ conversationId }: { conversationId: string | null }) {
  const { t } = useTranslation('workContexts')
  const { current, choose } = useConversationContextMode(conversationId)
  if (!conversationId) return null
  const on = current === 'my_activity'
  return (
    <DropdownMenuCheckboxItem
      checked={on}
      onCheckedChange={next => choose(next ? 'my_activity' : 'neutral')}
      className="min-h-11"
    >
      {t('mode.profileSwitch.label')} : {t(`mode.profileSwitch.state.${current}`)}
    </DropdownMenuCheckboxItem>
  )
}
