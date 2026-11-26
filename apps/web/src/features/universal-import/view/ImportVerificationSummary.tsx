import { Text } from '@bellum/ui'
import type { UniversalImportVerification } from '@bellum/contracts'
import { AlertTriangle } from 'lucide-react'
import { useTranslation } from 'react-i18next'

/**
 * Théo B c4-assistant-import.R3 — le RAPPORT DE VÉRIFICATION d'un import, version compacte (la fenêtre d'import
 * universel : fiche compte, Réglages › Import). Ce qui sera créé, complété, écarté ; les alertes RGPD en tête (colonnes
 * sensibles, contacts sans base légale). Le détail ligne à ligne vit dans l'assistant de Contacts.
 */
export function ImportVerificationSummary({ report }: { report: UniversalImportVerification }) {
  const { t } = useTranslation('importWizard')
  const key = 'contactsImport.assistant.verification'
  // #2732.1 — « écartés / à revoir » sans motif ne dit pas quoi corriger : chaque ligne écartée NOMME le sien
  // (d862757502 l'annonçait ; le résumé compact ne rendait que le COMPTE, le détail vivait ailleurs).
  const reasonOf = (row: UniversalImportVerification['rows'][number]): string =>
    row.reason ? t(`${key}.reason.${row.reason}`, { defaultValue: row.reason }) : t(`${key}.verdict.${row.verdict}`)
  const discardedRows = report.rows.filter(row => row.verdict !== 'create' && row.verdict !== 'complete')
  return (
    <div className="space-y-4" data-testid="import-verification-summary">
      <dl className="flex flex-wrap gap-x-8 gap-y-2">
        {(
          [
            ['toCreate', report.toCreate],
            ['toComplete', report.toComplete],
            ['discarded', report.discarded],
          ] as const
        ).map(([name, value]) => (
          <div key={name}>
            <dd className="text-2xl font-semibold text-[var(--text-primary)]">{value}</dd>
            <dt className="text-sm text-[var(--text-muted)]">{t(`${key}.${name}`)}</dt>
          </div>
        ))}
      </dl>
      {report.sheets ? (
        <ul className="space-y-1" data-testid="import-verification-sheets">
          {report.sheets.map(sheet => (
            <li key={sheet.name} className="text-sm text-[var(--text-secondary)]">
              <span className="font-medium">{sheet.name}</span>
              {` — ${[
                t('universal.sheets.read', { count: sheet.total }),
                sheet.toCreate > 0 ? t('universal.sheets.toCreate', { count: sheet.toCreate }) : null,
                sheet.discarded > 0 ? t('universal.sheets.rejected', { count: sheet.discarded }) : null,
              ]
                .filter(Boolean)
                .join(' · ')}`}
            </li>
          ))}
        </ul>
      ) : null}
      {discardedRows.length > 0 ? (
        <ul className="space-y-1" data-testid="import-discarded-rows">
          {discardedRows.map(row => (
            <li key={row.line} className="text-sm text-[var(--text-secondary)]">
              {row.label
                ? t(`${key}.discardedLine`, { line: row.line, reason: reasonOf(row), label: row.label })
                : t(`${key}.discardedLineBare`, { line: row.line, reason: reasonOf(row) })}
            </li>
          ))}
        </ul>
      ) : null}
      <Text size="sm" className="text-[var(--text-secondary)]">
        {t(`${key}.noOverwrite`)}
      </Text>
      {report.sensitiveColumns.length > 0 ? (
        <div role="note" className="flex gap-2 rounded-lg border border-[var(--border-default)] p-3">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--warning-soft-text)]" aria-hidden />
          <div>
            <Text size="sm" weight="semibold" className="text-[var(--text-primary)]">
              {t(`${key}.sensitiveTitle`)}
            </Text>
            <Text size="sm" className="text-[var(--text-secondary)]">
              {t(`${key}.sensitiveBody`, { list: report.sensitiveColumns.join(', ') })}
            </Text>
          </div>
        </div>
      ) : null}
      {report.withoutLegalBasis > 0 ? (
        <div role="note" className="flex gap-2 rounded-lg border border-[var(--border-default)] p-3">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--warning-soft-text)]" aria-hidden />
          <div>
            <Text size="sm" weight="semibold" className="text-[var(--text-primary)]">
              {t(`${key}.legalTitle`)}
            </Text>
            <Text size="sm" className="text-[var(--text-secondary)]">
              {t(`${key}.legalBody`, { count: report.withoutLegalBasis })}
            </Text>
          </div>
        </div>
      ) : null}
    </div>
  )
}
