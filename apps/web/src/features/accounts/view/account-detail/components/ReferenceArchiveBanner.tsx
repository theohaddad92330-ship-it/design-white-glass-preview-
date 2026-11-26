import type { ReferenceArchive } from '@bellum/contracts'
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
import { Archive, Copy } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatArchivePeriod } from '@/features/accounts/lib/referenceArchive'

interface ReferenceArchiveBannerProps {
  archive: ReferenceArchive
  companyName: string
  onCreateCopy: () => void
  /** La copie est en cours de création : un second clic ne part pas. */
  busy?: boolean
}

/**
 * Théo A comptes-fiche-reference.N4 / A2 — le bandeau d'un DOSSIER DE RÉFÉRENCE.
 *
 * Une archive figée : lecture seule, jamais réécrite (aucun « Actualiser »). Le
 * geste est « Créer une copie de travail », qui hérite des notes et laisse
 * l'archive intacte. « Source & portée » dit ce que l'archive couvre — et
 * qu'elle n'est pas une vérification actuelle. Un seul bandeau d'état.
 */
export function ReferenceArchiveBanner({
  archive,
  companyName,
  onCreateCopy,
  busy = false,
}: ReferenceArchiveBannerProps) {
  const { t } = useTranslation('accounts')
  const [scopeOpen, setScopeOpen] = useState(false)
  const period = formatArchivePeriod(archive.period_from, archive.period_to)
  const verification = archive.verified_online ? t('referenceArchive.verified') : t('referenceArchive.notVerified')

  return (
    <section
      data-testid="reference-archive-banner"
      aria-label={t('referenceArchive.title', { period })}
      className="flex flex-col gap-3 rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] px-4 py-3 md:flex-row md:items-start"
    >
      <Archive className="mt-0.5 size-4 shrink-0 text-[var(--bellum-text-muted)]" aria-hidden />
      <div className="min-w-0 flex-1">
        <Text size="sm" weight="medium" className="text-[var(--bellum-text-primary)]">
          {t('referenceArchive.title', { period })}
        </Text>
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('referenceArchive.body', { company: companyName })}
        </Text>
        <Text size="xs" className="mt-1 text-[var(--bellum-text-muted)]">
          {t('referenceArchive.scopeLine', { label: archive.label, period, verification })}
        </Text>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="ghost" size="default" className="min-h-11" onClick={() => setScopeOpen(true)}>
          {t('referenceArchive.sourceScope')}
        </Button>
        <Button
          type="button"
          variant="default"
          size="default"
          className="min-h-11 gap-1.5"
          aria-busy={busy}
          onClick={() => {
            if (!busy) onCreateCopy()
          }}
        >
          <Copy className="size-4" aria-hidden />
          {t('referenceArchive.createCopy')}
        </Button>
      </div>

      <Dialog open={scopeOpen} onOpenChange={setScopeOpen}>
        <DialogContent closeLabel={t('common:actions.close')}>
          <DialogHeader>
            <Text size="xs" weight="medium" className="uppercase tracking-wide text-[var(--bellum-text-muted)]">
              {t('referenceArchive.scopeEyebrow')}
            </Text>
            <DialogTitle>{t('referenceArchive.scopeTitle')}</DialogTitle>
            <DialogDescription>
              {t('referenceArchive.scopeBody', { label: archive.label, period, scope: archive.scope_note })}
            </DialogDescription>
          </DialogHeader>
          <Text size="sm" className="text-[var(--bellum-text-secondary)]">
            {t('referenceArchive.scopeReading')}
          </Text>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setScopeOpen(false)}>
              {t('referenceArchive.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
