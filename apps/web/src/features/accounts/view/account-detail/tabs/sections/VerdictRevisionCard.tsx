import { Text } from '@bellum/ui'
import { GitCompareArrows } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  namedAccountVerdict,
  normalizeStoredVerdict,
  type VerdictRevision,
  type VerdictUnchanged,
} from '@bellum/contracts'
import { formatRunDate, verdictRevisionView } from '@/features/accounts/lib/analysisRuns'

/** Le verdict d'un instantané, NOMMÉ comme la Synthèse (RÉSERVE, pas PRUDENT) ; illisible = le texte tel quel. */
function namedSnapshotVerdict(raw: string, hasNoGoTrigger: boolean, hasObjective: boolean): string {
  const family = normalizeStoredVerdict(raw)
  return family ? namedAccountVerdict(family, hasNoGoTrigger, { hasObjective }) : raw
}

/**
 * #3212.4/.6 + #3235 — « ancien verdict → nouveau verdict, cause, date » (D213 ne compare que les FAITS du
 * compte, jamais le verdict). Une seule mise en forme pour la Synthèse (historique) ET le Plan (sous le
 * verdict) : GA-26. `null` = pas de verdict précédent → aucune ligne, jamais une révision inventée.
 */
export function VerdictRevisionCard({
  revision,
  hasObjective,
  unchanged,
}: {
  revision: VerdictRevision | null | undefined
  hasObjective: boolean
  /** #4180 — les deux dernières analyses portent le MÊME verdict : « Même verdict depuis le … ». */
  unchanged?: VerdictUnchanged | null
}) {
  const { t } = useTranslation('accountDetail')
  const view = verdictRevisionView(revision)
  if (!revision || !view) {
    if (!unchanged) return null
    return (
      <div
        data-testid="verdict-unchanged"
        className="mb-3 flex items-center gap-2 rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-2"
      >
        <GitCompareArrows className="size-3.5 text-[var(--bellum-text-accent)]" />
        <Text size="xs" color="text-[var(--bellum-text-secondary)]">
          {t('revision.unchangedSince', { date: formatRunDate(unchanged.unchangedSince) })}
        </Text>
      </div>
    )
  }
  const previous = namedSnapshotVerdict(view.previousVerdict, Boolean(revision.previousNoGoTrigger), hasObjective)
  const current = namedSnapshotVerdict(view.newVerdict, Boolean(revision.newNoGoTrigger), hasObjective)
  return (
    <div
      data-testid="verdict-revision"
      className="mb-3 rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-2"
    >
      <div className="mb-1 flex items-center gap-2">
        <GitCompareArrows className="size-3.5 text-[var(--bellum-text-accent)]" />
        <Text size="xs" weight="semibold">
          {t('revision.title')}
        </Text>
      </div>
      <Text size="xs" color="text-[var(--bellum-text-secondary)]">
        {t('revision.from')} <strong>{previous}</strong> → {t('revision.to')} <strong>{current}</strong>
      </Text>
      <Text size="xs" color="text-[var(--bellum-text-muted)]" className="mt-0.5">
        {t('revision.changedAt', { date: view.changedAtLabel })}
      </Text>
      <ul className="mt-1 list-disc space-y-0.5 pl-4">
        {view.causes.map(cause => (
          <li key={cause}>
            <Text element="span" size="xs" color="text-[var(--bellum-text-secondary)]">
              {cause}
            </Text>
          </li>
        ))}
      </ul>
    </div>
  )
}
