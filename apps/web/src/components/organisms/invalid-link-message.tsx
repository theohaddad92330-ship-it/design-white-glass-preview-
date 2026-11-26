import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { GenericProblemMessage } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { ContactDialog } from '@/components/ContactDialog'
import { ProblemIconCycle } from '@/components/feedback/AnimatedProblemIcons'
import { ProblemIllustration } from '@/components/feedback/ProblemIllustration'
import { useBrand } from '@/features/brand/brand-context'

/**
 * Trois causes, trois gestes.
 *
 * L'écran collapsait « expiré », « déjà utilisé » et « mot de passe refusé » en
 * un seul « Lien invalide ». Les trois appellent pourtant des gestes opposés :
 * refaire une demande · essayer de se connecter, parce que le mot de passe est
 * peut-être déjà changé · corriger le mot de passe, le lien n'y étant pour rien.
 * Incident du 25/08 : impossible de savoir laquelle des trois avait eu lieu.
 */
export type InvalidLinkReason = 'expired' | 'used' | 'password_rejected' | 'unknown'

export function InvalidLinkMessage({ reason = 'unknown' }: { reason?: InvalidLinkReason } = {}) {
  const { t } = useTranslation('common')
  const navigate = useNavigate()
  const [contactOpen, setContactOpen] = useState(false)
  // #1960.20 — le recours « Contacter le support » ouvre NOTRE boîte. Sur un
  // domaine en marque blanche (la marque se résout par l'hôte avant connexion),
  // il ne s'affiche pas : décision de Louis du 13/09/2026.
  const { isCustom } = useBrand()

  return (
    <>
      <GenericProblemMessage
        title={t(`errorScreens.invalidLink.${reason}.title`, { defaultValue: t('errorScreens.invalidLink.title') })}
        principalMessage={t(`errorScreens.invalidLink.${reason}.message`, {
          defaultValue: t('errorScreens.invalidLink.message'),
        })}
        firstSubText={t(`errorScreens.invalidLink.${reason}.sub1`, {
          defaultValue: t('errorScreens.invalidLink.sub1'),
        })}
        secondSubText={t('errorScreens.invalidLink.sub2')}
        icon={<ProblemIconCycle className="text-[var(--bellum-text-accent)]" />}
        illustration={<ProblemIllustration />}
        buttonText={t('errorScreens.invalidLink.cta')}
        onButtonClick={() => navigate({ to: '/' })}
        {...(isCustom
          ? {}
          : { secondaryButtonText: t('nav:help.contactSupport'), onSecondaryButtonClick: () => setContactOpen(true) })}
      />
      {isCustom ? null : <ContactDialog open={contactOpen} onOpenChange={setContactOpen} />}
    </>
  )
}
