import { useState } from 'react'
import { Button } from '@bellum/ui'
import { Download } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { talentApi } from '@/features/consultants/talent-api'

/**
 * #2176.62 — LE CV ORIGINAL, DEPUIS LA CARTE DE MATCHING.
 *
 * Réutilise l'existant (#4034.3) : la liste des documents du talent et l'URL
 * signée (≤ 5 min) de l'original, demandée AU CLIC — jamais préchargée pour
 * les quarante profils d'un classement. Le droit se tranche côté API (talent
 * de l'espace, document de ce talent) ; un refus n'ouvre rien et se dit.
 */
export function OriginalCvButton({ consultantId }: { consultantId: string }) {
  const { t } = useTranslation('matching')
  const [pending, setPending] = useState(false)

  const download = async () => {
    setPending(true)
    try {
      const { items } = await talentApi.documents(consultantId)
      const latest = items
        .filter(document => document.kind === 'cv' && document.hasOriginal)
        .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))[0]
      if (!latest) {
        toast.error(t('card.originalCvMissing'))
        return
      }
      const file = await talentApi.documentFileUrl(consultantId, latest.id)
      window.open(file.url, '_blank', 'noopener')
    } catch (error) {
      toast.error(t('card.originalCvDenied', { reason: error instanceof Error ? error.message : '' }))
    } finally {
      setPending(false)
    }
  }

  return (
    <Button variant="ghost" size="sm" onClick={() => void download()} disabled={pending}>
      <Download aria-hidden className="size-4" />
      {t('card.originalCv')}
    </Button>
  )
}
