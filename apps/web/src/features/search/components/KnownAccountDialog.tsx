import type { MarketPreview } from '@bellum/contracts'
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { formatDate } from '@/lib/locale'
import type { KnownInput } from '../hooks/useKnownLine'
import {
  deriveKnownContactsSummary,
  deriveKnownCorrectionsSummary,
  deriveKnownFreshSignalsSummary,
  deriveKnownIdentitySummary,
  deriveKnownWorkspaceAnalysisSummary,
} from '../lib/knownAccountSummary'
import { MarketPreviewCard } from './MarketPreviewCard'

function Row({ label, value }: { label: string; value: string | null }) {
  if (!value) return null
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-2 py-1.5 text-sm">
      <dt className="text-[var(--bellum-text-muted)]">{label}</dt>
      <dd className="text-[var(--bellum-text-primary)]">{value}</dd>
    </div>
  )
}

/**
 * « Ce que Bellum sait déjà sur X » — le détail, en deux colonnes : ce que l'espace possède, ce que
 * le marché a laissé voir. Aucun nom de fournisseur, aucun fait inventé : une ligne sans donnée
 * n'est pas écrite.
 */
export function KnownAccountDialog({
  open,
  onOpenChange,
  companyName,
  known,
  market,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  companyName: string
  known: KnownInput
  market: { preview: MarketPreview | null; isPending: boolean; notCovered: boolean; unavailable: boolean }
}) {
  const { t } = useTranslation('search')
  const { account, contacts, corrections } = known
  const identity = deriveKnownIdentitySummary(account)
  const workspace = deriveKnownWorkspaceAnalysisSummary(account)
  const people = deriveKnownContactsSummary(contacts)
  const fresh = deriveKnownFreshSignalsSummary(account)
  const fixes = deriveKnownCorrectionsSummary(corrections)
  const identityLine = identity
    ? [account?.company_name, account?.siren ? t('scope.siren', { siren: account.siren }) : null]
        .filter(Boolean)
        .join(' · ')
    : null
  const analysedOn = workspace ? formatDate(workspace.lastAnalyzedAt, { dateStyle: 'long' }) : null
  const factsLine = people
    ? [
        people.facts > 0 ? t('confirm.known.facts', { count: people.facts }) : null,
        people.hypotheses > 0 ? t('confirm.known.hypotheses', { count: people.hypotheses }) : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl" closeLabel={t('common:actions.close')}>
        <DialogHeader>
          <DialogTitle>{t('analyze.known.dialogTitle', { company: companyName })}</DialogTitle>
          <DialogDescription>{t('analyze.known.dialogDescription')}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 md:grid-cols-2">
          <section aria-label={t('analyze.known.workspaceColumn')}>
            <h3 className="mb-1 text-sm font-semibold text-[var(--bellum-text-primary)]">
              {t('analyze.known.workspaceColumn')}
            </h3>
            <dl className="divide-y divide-[var(--bellum-border)]">
              <Row label={t('analyze.known.identity')} value={identityLine} />
              <Row label={t('analyze.known.lastAnalysis')} value={analysedOn} />
              <Row
                label={t('analyze.known.contactsLabel')}
                value={people ? t('analyze.known.contacts', { count: people.total }) : null}
              />
              <Row label={t('analyze.known.factsLabel')} value={factsLine || null} />
              <Row
                label={t('analyze.known.signalsLabel')}
                value={fresh ? t('analyze.known.signals', { count: fresh.current }) : null}
              />
              <Row
                label={t('analyze.known.correctionsLabel')}
                value={fixes ? t('analyze.known.corrections', { count: fixes.total }) : null}
              />
            </dl>
          </section>
          <section aria-label={t('analyze.known.marketColumn')}>
            <h3 className="mb-1 text-sm font-semibold text-[var(--bellum-text-primary)]">
              {t('analyze.known.marketColumn')}
            </h3>
            <MarketPreviewCard
              preview={market.preview}
              isPending={market.isPending}
              notCovered={market.notCovered}
              unavailable={market.unavailable}
            />
          </section>
        </div>
        <p className="text-xs text-[var(--bellum-text-muted)]">{t('analyze.known.footnote')}</p>
        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>
            {t('analyze.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
