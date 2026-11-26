import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

/**
 * #2150.43 — « PORTE D'ENTRÉE : LIEN PARTAGÉ ».
 *
 * La fiche contact est UNIQUE et sa route profonde (`/contacts/$id`) existait,
 * mais aucun geste ne la donnait. Le lien copié est celui de la fiche NUE :
 * l'origine de navigation (`from` / `fromId`, #2150.62) appartient à qui copie,
 * et un collègue qui ouvre le lien retrouve le fil d'Ariane de la fiche.
 *
 * #4504.2 (contrat Louis 24/10) — le bouton de l'en-tête de page devient l'item « Copier le lien » du menu « … »
 * de la fiche (`ContactMoreActions`) : la copie, elle, ne change pas.
 *
 * ⚠️ Un presse-papiers refusé (contexte non sécurisé, permission) se DIT : un
 * « lien copié » qui n'a pas eu lieu se découvre au moment de coller.
 */
export function useCopyContactLink(contactId: string): () => void {
  const { t } = useTranslation('contacts')
  return () => {
    void (async () => {
      try {
        if (!navigator.clipboard) throw new Error('clipboard unavailable')
        await navigator.clipboard.writeText(`${window.location.origin}/contacts/${contactId}`)
        toast.success(t('header.linkCopied'))
      } catch {
        toast.error(t('header.linkCopyFailed'))
      }
    })()
  }
}
