import { canCompleteCrmAccount, contactsToComplete, type Account, type Contact } from '@bellum/contracts'
import { DatabaseZap } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAccountCrmProvenance } from '@/features/crm/hooks/useAccountCrmProvenance'
import { CompleteCrmAccountDialog } from '@/features/crm/view/CompleteCrmAccountDialog'
import { DossierCtaButton } from '../cta/DossierCta'

/**
 * #4507 — la règle d'éligibilité, lue à UN seul endroit : le bouton ci-dessous et l'entrée « Compléter le
 * compte » du menu « … » de l'en-tête (refonte V22) posent la même question.
 */
export function useCanCompleteCrmAccount(account: Pick<Account, 'status'>): boolean {
  const provenance = useAccountCrmProvenance()
  return canCompleteCrmAccount({
    status: account.status,
    accountFromCrm: provenance?.accountFromCrm === true,
    toComplete: contactsToComplete(provenance?.contacts ?? []).length,
  })
}

/**
 * #4459.1 / #4459.3 — « Compléter le compte », à côté du geste principal du hero : sur un compte VENU DU CRM
 * dont l'analyse est allée au bout (`canCompleteCrmAccount`, règle unique du contrat — GA-26). Tant que le
 * compte n'est pas analysé, c'est le geste principal qui dit « Analyser le compte » ; ce bouton n'existe pas.
 *
 * Fichier nommé dans `DOSSIER_CTA_SCOPE_FILES` : son seul cliquable porte le contrat `dossier.hero.completeAccount`.
 */
export function CompleteCrmAccountButton({
  account,
  contacts,
  fullWidth = false,
}: {
  account: Pick<Account, 'id' | 'status'>
  contacts: readonly Pick<Contact, 'id' | 'full_name' | 'title'>[]
  fullWidth?: boolean
}) {
  const { t } = useTranslation('accounts')
  const [open, setOpen] = useState(false)
  const eligible = useCanCompleteCrmAccount(account)
  // Fenêtre ouverte : elle reste montée même quand l'envoi vient de vider la liste (le résultat doit se lire).
  if (!eligible && !open) return null
  return (
    <>
      {eligible ? (
        <DossierCtaButton
          cta="dossier.hero.completeAccount"
          variant="light"
          size="sm"
          icon={DatabaseZap}
          fullWidth={fullWidth}
          className="min-h-11"
          onClick={() => setOpen(true)}
        >
          {t('hero.primary.completeAccount')}
        </DossierCtaButton>
      ) : null}
      <CompleteCrmAccountDialog open={open} onOpenChange={setOpen} contacts={contacts} />
    </>
  )
}
