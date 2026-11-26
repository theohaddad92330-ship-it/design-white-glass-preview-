import { useOpenLauraInPlace } from '@/features/laura/bubble/use-open-laura-in-place'
import { Button, EmptyState, Logo } from '@bellum/ui'
import { useNavigate } from '@tanstack/react-router'
import { Building2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

/** Empty state for /accounts when the user has no analyzed account yet —
 *  action-oriented, never a mute blank page.
 *
 *  #3905 (décision Louis 15/10/2026) — « demander des comptes en une phrase » sur un espace neuf entre par
 *  LAURA : le geste mène à /chat, la phrase d'exemple déjà posée dans le champ (rien n'est envoyé sans le
 *  geste de la personne), plutôt qu'à un lanceur d'analyse à choisir. */
export function AccountsEmpty() {
  const navigate = useNavigate()
  const openLauraInPlace = useOpenLauraInPlace()
  const { t } = useTranslation('accounts')
  return (
    <EmptyState
      align="start"
      className="py-60"
      title={t('emptyState.title')}
      description={t('emptyState.description')}
      icon={<Building2 className="size-12" />}
      action={
        <Button
          variant="violet"
          size="sm"
          icon={<Logo className="rounded-lg text-white" />}
          onClick={() =>
            openLauraInPlace
              ? openLauraInPlace(t('emptyState.chatPrompt'))
              : navigate({ to: '/chat', search: { prompt: t('emptyState.chatPrompt') } })
          }
        >
          {t('emptyState.cta')}
        </Button>
      }
    />
  )
}
