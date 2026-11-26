import { readReferenceArchive, readWorkingCopyOf, type Account } from '@bellum/contracts'
import { Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { Copy } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useCreateWorkingCopy } from '@/features/accounts/hooks/useCreateWorkingCopy'
import { ReferenceArchiveBanner } from './ReferenceArchiveBanner'

/**
 * Théo A comptes-fiche-reference.A2 — le SEUL bandeau d'état d'un dossier de référence :
 * l'archive figée (lecture seule, « Créer une copie de travail »), ou la copie de travail
 * qui renvoie vers son archive. Un compte ordinaire n'en porte aucun.
 */
export function AccountReferenceNotice({ account }: { account: Account }) {
  const { t } = useTranslation('accounts')
  const createCopy = useCreateWorkingCopy(account.id)
  const archive = readReferenceArchive(account.raw_analysis)
  const archiveId = readWorkingCopyOf(account.raw_analysis)

  if (archive) {
    return (
      <ReferenceArchiveBanner
        archive={archive}
        companyName={account.company_name || ''}
        busy={createCopy.isPending}
        onCreateCopy={() => createCopy.mutate()}
      />
    )
  }
  if (archiveId) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] px-4 py-3">
        <Copy className="size-4 shrink-0 text-[var(--bellum-text-muted)]" aria-hidden />
        <Text size="sm" className="min-w-0 flex-1 text-[var(--bellum-text-secondary)]">
          {t('referenceArchive.copyOf')}
        </Text>
        <Link
          to="/accounts/$id"
          params={{ id: archiveId }}
          className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--bellum-text-primary)] underline underline-offset-2"
        >
          {t('referenceArchive.openArchive')}
        </Link>
      </div>
    )
  }
  return null
}
