import { Button } from '@bellum/ui'
import { Link2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

/**
 * #2185.52 — « Partager » : copier le lien PROFOND de la fiche talent, même
 * patron que `CopyContactLinkButton` (#2150.43). Un presse-papiers refusé
 * (contexte non sécurisé, permission) se DIT : un « lien copié » qui n'a pas
 * eu lieu se découvre au moment de coller.
 */
export function CopyTalentLinkButton({ talentId }: { talentId: string }) {
  const { t } = useTranslation('consultants')

  const copy = async () => {
    try {
      if (!navigator.clipboard) throw new Error('clipboard unavailable')
      await navigator.clipboard.writeText(`${window.location.origin}/consultants/${talentId}`)
      toast.success(t('detail.profile.linkCopied'))
    } catch {
      toast.error(t('detail.profile.linkCopyFailed'))
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" className="min-h-11 gap-2" onClick={() => void copy()}>
      <Link2 className="size-4" aria-hidden />
      {t('detail.profile.copyLink')}
    </Button>
  )
}
