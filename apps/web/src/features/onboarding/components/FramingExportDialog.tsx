import { Download } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Text,
} from '@bellum/ui'
import { buildFramingExport, framingToJson, framingToText } from '@/features/onboarding/lib/framing-export'
import { useOnboardingStore } from '@/stores/onboardingStore'

function download(filename: string, mime: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: `${mime};charset=utf-8` }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

/**
 * Théo O onboarding-relecture.N4 — « Emporter ton cadrage » : un fichier texte
 * (à relire) et un JSON (à retrouver dans un autre espace — une importation
 * reste un brouillon à relire). Fabriqué dans le navigateur : rien ne part
 * vers un serveur, et le fichier ne contient que les réponses et leurs statuts.
 */
export function FramingExportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation('onboarding')
  const answers = useOnboardingStore(s => s.answers)
  const statuses = useOnboardingStore(s => s.statuses)
  const rows = buildFramingExport(answers, statuses)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('exportDialog.close')}>
        <DialogHeader>
          <DialogTitle>{t('exportDialog.title')}</DialogTitle>
          <DialogDescription>{t('exportDialog.description')}</DialogDescription>
        </DialogHeader>
        <Text element="p" size="sm" className="text-[var(--bellum-text-secondary)]">
          {t('exportDialog.json')}
        </Text>
        <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
          {t('exportDialog.warning')}
        </Text>
        {rows.length === 0 && (
          <Text element="p" size="sm" className="text-[var(--bellum-text-muted)]">
            {t('exportDialog.empty')}
          </Text>
        )}
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('exportDialog.close')}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={rows.length === 0}
            onClick={() => download('Cadrage.txt', 'text/plain', framingToText(rows, t))}
          >
            <Download aria-hidden="true" className="mr-2 h-4 w-4" />
            {t('exportDialog.text')}
          </Button>
          <Button
            type="button"
            disabled={rows.length === 0}
            onClick={() => download('Cadrage.json', 'application/json', framingToJson(rows))}
          >
            <Download aria-hidden="true" className="mr-2 h-4 w-4" />
            {t('exportDialog.jsonButton')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
