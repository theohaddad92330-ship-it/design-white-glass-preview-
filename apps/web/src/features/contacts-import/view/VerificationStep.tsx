import { Button, SelectField, Text } from '@bellum/ui'
import type { UniversalImportVerification, UniversalImportVerifiedRow } from '@bellum/contracts'
import { AlertTriangle } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useRecordContactResolutionCorrection } from '@/features/contacts/hooks/useContactResolutionCorrections'
import { confirmedCounts, isImportable, pageBounds } from '../model/verification'

const PAGE_SIZE = 25

type Props = {
  report: UniversalImportVerification
  declined: ReadonlySet<number>
  onDecision: (line: number, skip: boolean) => void
  confirmed: boolean
  onConfirmed: (value: boolean) => void
  importing: boolean
  error: string | null
  onBack: () => void
  onImport: () => void
}

/** « Ce n'est pas la même personne » : un rapprochement refusé, pour que les imports suivants ne le refassent pas. */
function NotSamePerson({ contactId }: { contactId: string }) {
  const { t } = useTranslation('importWizard')
  const record = useRecordContactResolutionCorrection(contactId)
  if (record.isSuccess) {
    return (
      <Text size="xs" className="text-[var(--text-secondary)]">
        {t('contactsImport.assistant.verification.notSamePersonDone')}
      </Text>
    )
  }
  return (
    <Button
      variant="outline"
      size="xs"
      isLoading={record.isPending}
      onClick={() =>
        record.mutate(
          { decision: 'rejected' },
          { onError: () => toast.error(t('contactsImport.assistant.verification.notSamePersonError')) },
        )
      }
    >
      {t('contactsImport.assistant.verification.notSamePerson')}
    </Button>
  )
}

/**
 * Théo B c4-assistant-import.R3/R4/R5 — l'étape « Vérification » : le plan du fichier, ligne à ligne, AVANT toute
 * écriture et quelle que soit la taille. Compteurs, alertes RGPD (A2) en tête, verdict + décision par ligne (N1),
 * pagination (N3), confirmation explicite. Rien ne s'écrase automatiquement.
 */
export function VerificationStep({
  report,
  declined,
  onDecision,
  confirmed,
  onConfirmed,
  importing,
  error,
  onBack,
  onImport,
}: Props) {
  const { t } = useTranslation('importWizard')
  const [page, setPage] = useState(0)
  const bounds = pageBounds(page, PAGE_SIZE, report.rows.length)
  const visible = report.rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const counts = confirmedCounts(report.rows, declined, report)
  const nothing = counts.create + counts.complete === 0

  const sentence =
    counts.complete === 0
      ? t('contactsImport.assistant.verification.confirmCreateOnly', {
          create: t('contactsImport.assistant.verification.confirmCreate', { count: counts.create }),
        })
      : counts.create === 0
        ? t('contactsImport.assistant.verification.confirmCompleteOnly', {
            complete: t('contactsImport.assistant.verification.confirmComplete', { count: counts.complete }),
          })
        : t('contactsImport.assistant.verification.confirm', {
            create: t('contactsImport.assistant.verification.confirmCreate', { count: counts.create }),
            complete: t('contactsImport.assistant.verification.confirmComplete', { count: counts.complete }),
          })

  const verdictLine = (row: UniversalImportVerifiedRow) => (
    <>
      <Text size="sm" weight="medium" className="text-[var(--text-primary)]">
        {t(`contactsImport.assistant.verification.verdict.${row.verdict}`)}
      </Text>
      {row.reason ? (
        <Text size="xs" className="text-[var(--text-muted)]">
          {t(`contactsImport.assistant.verification.reason.${row.reason}`, { defaultValue: row.reason })}
        </Text>
      ) : null}
    </>
  )

  return (
    <div className="space-y-5">
      <dl className="flex flex-wrap gap-x-8 gap-y-2">
        {(
          [
            ['toCreate', report.toCreate],
            ['toComplete', report.toComplete],
            ['discarded', report.discarded],
          ] as const
        ).map(([key, value]) => (
          <div key={key}>
            <dd className="text-2xl font-semibold text-[var(--text-primary)]">{value}</dd>
            <dt className="text-sm text-[var(--text-muted)]">{t(`contactsImport.assistant.verification.${key}`)}</dt>
          </div>
        ))}
      </dl>
      <Text size="sm" className="text-[var(--text-secondary)]">
        {t('contactsImport.assistant.verification.noOverwrite')}
      </Text>

      {report.sensitiveColumns.length > 0 ? (
        <div role="note" className="flex gap-2 rounded-lg border border-[var(--border-default)] p-4">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--warning-soft-text)]" aria-hidden />
          <div>
            <Text size="sm" weight="semibold" className="text-[var(--text-primary)]">
              {t('contactsImport.assistant.verification.sensitiveTitle')}
            </Text>
            <Text size="sm" className="text-[var(--text-secondary)]">
              {t('contactsImport.assistant.verification.sensitiveBody', { list: report.sensitiveColumns.join(', ') })}
            </Text>
          </div>
        </div>
      ) : null}
      {report.withoutLegalBasis > 0 ? (
        <div role="note" className="flex gap-2 rounded-lg border border-[var(--border-default)] p-4">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--warning-soft-text)]" aria-hidden />
          <div>
            <Text size="sm" weight="semibold" className="text-[var(--text-primary)]">
              {t('contactsImport.assistant.verification.legalTitle')}
            </Text>
            <Text size="sm" className="text-[var(--text-secondary)]">
              {t('contactsImport.assistant.verification.legalBody', { count: report.withoutLegalBasis })}
            </Text>
          </div>
        </div>
      ) : null}

      <div className="overflow-x-auto overscroll-x-contain rounded-lg border border-[var(--border-subtle)]">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="bg-[var(--bg-elevated)] text-[var(--text-muted)]">
            <tr>
              {(['line', 'contact', 'check', 'decision'] as const).map(column => (
                <th key={column} scope="col" className="px-3 py-2 font-medium">
                  {t(`contactsImport.assistant.verification.table.${column}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map(row => (
              <tr key={row.line} className="border-t border-[var(--border-subtle)] align-top">
                <td className="px-3 py-2 text-[var(--text-muted)]">{row.line}</td>
                <td className="px-3 py-2 text-[var(--text-primary)]">
                  {row.label ?? t('contactsImport.assistant.verification.unnamed')}
                </td>
                <td className="px-3 py-2">{verdictLine(row)}</td>
                <td className="space-y-1 px-3 py-2">
                  {isImportable(row) ? (
                    <SelectField
                      ariaLabel={t('contactsImport.assistant.verification.decisionLabel', { line: row.line })}
                      value={declined.has(row.line) ? 'skip' : 'import'}
                      onChange={next => onDecision(row.line, next === 'skip')}
                      options={[
                        { value: 'import', label: t('contactsImport.assistant.verification.decisions.import') },
                        { value: 'skip', label: t('contactsImport.assistant.verification.decisions.skip') },
                      ]}
                    />
                  ) : (
                    <Text size="sm" className="text-[var(--text-muted)]">
                      {t('contactsImport.assistant.verification.notImportedAsIs')}
                    </Text>
                  )}
                  {row.existingId && (row.verdict === 'complete' || row.verdict === 'duplicate') ? (
                    <NotSamePerson contactId={row.existingId} />
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Text size="sm" className="text-[var(--text-muted)]">
          {t('contactsImport.assistant.verification.page', {
            from: bounds.from,
            to: bounds.to,
            total: report.rows.length,
          })}
          {report.truncated
            ? ` · ${t('contactsImport.assistant.verification.truncated', { count: report.rows.length })}`
            : ''}
        </Text>
        {bounds.pages > 1 ? (
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
              {t('contactsImport.assistant.verification.previous')}
            </Button>
            <Button variant="secondary" size="sm" disabled={page + 1 >= bounds.pages} onClick={() => setPage(page + 1)}>
              {t('contactsImport.assistant.verification.next')}
            </Button>
          </div>
        ) : null}
      </div>

      {nothing ? (
        <Text size="sm" className="text-[var(--text-muted)]">
          {t('contactsImport.assistant.verification.nothing')}
        </Text>
      ) : (
        <label className="flex min-h-11 items-start gap-3 text-sm text-[var(--text-primary)]">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={event => onConfirmed(event.target.checked)}
            className="mt-1"
          />
          <span>{sentence}</span>
        </label>
      )}
      {error ? (
        <Text size="sm" role="alert" className="text-[var(--warning-soft-text)]">
          {error}
        </Text>
      ) : null}
      <div className="flex flex-wrap justify-between gap-3">
        <Button variant="secondary" size="sm" onClick={onBack}>
          {t('contactsImport.assistant.verification.backToColumns')}
        </Button>
        <Button variant="black" size="sm" onClick={onImport} disabled={!confirmed || nothing || importing}>
          {importing
            ? t('contactsImport.assistant.verification.importing')
            : t('contactsImport.assistant.verification.import')}
        </Button>
      </div>
    </div>
  )
}
