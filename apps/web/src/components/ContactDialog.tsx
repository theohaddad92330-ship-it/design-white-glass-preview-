import { ContactDialog as BaseContactDialog } from '@bellum/ui'
import { Lightbulb, Mail } from 'lucide-react'
import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { useBrand } from '@/features/brand/brand-context'

type ContactDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * BellumAI-flavoured wrapper around the shared `ContactDialog` from
 * `@bellum/ui`. Always controlled — pass `open` + `onOpenChange` from a
 * parent component (onboarding help card, invalid-link screen).
 */
export const ContactDialog = memo<ContactDialogProps>(function ContactDialog({ open, onOpenChange }) {
  const { t } = useTranslation('contacts')
  const { isCustom } = useBrand()
  // Canonical in-app support address (Théo restitution P0-09) — was the drifting
  // `contact@bellum.ai`; the product's support inbox is support@bellum-it.com
  // (confirmée par Louis le 13/09/2026).
  //
  // #1960.20 — ⚠️ C'est NOTRE boîte : elle ne se montre pas dans un espace en
  // marque blanche (décision de Louis du 13/09/2026). Les deux entrées d'origine
  // (onboarding, lien invalide) ne s'y affichent déjà plus ; ce dialogue retient
  // l'adresse lui-même parce qu'il est le SEUL endroit de l'app qui l'écrit.
  const supportContacts = isCustom
    ? []
    : [
        { icon: Mail, label: 'support@bellum-it.com', href: 'mailto:support@bellum-it.com' },
        {
          icon: Lightbulb,
          label: t('support.suggestion'),
          // ⚠️ Le sujet ne porte pas le nom du produit : un « Suggestion
          // BellumAI » pré-rempli dans le client de messagerie de quelqu'un
          // reprendrait la marque que ce lot retire.
          href: 'mailto:support@bellum-it.com?subject=Suggestion',
        },
      ]
  return (
    <BaseContactDialog
      openDialog={open}
      onOpenChange={onOpenChange}
      showTriggerButton={false}
      title={t('support.title')}
      description={isCustom ? t('support.descriptionWhiteLabel') : t('support.description')}
      contacts={supportContacts}
    />
  )
})
