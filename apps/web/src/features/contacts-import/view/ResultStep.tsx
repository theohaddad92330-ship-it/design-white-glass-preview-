import { Button, Text } from '@bellum/ui'
import type { UniversalImportJobState, UniversalImportVerifiedRow } from '@bellum/contracts'
import { CheckCircle2, Download } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ImportFamilyReport, hasFamilyReport } from '@/features/universal-import/view/ImportFamilyReport'

type Props = {
  job: UniversalImportJobState
  /** Les lignes du détail de la vérification qui n'entrent pas (écartées d'office ou par toi), pour les nommer. */
  notImported: readonly UniversalImportVerifiedRow[]
  declined: ReadonlySet<number>
  onDownload: () => void
  onResume: () => void
  error: string | null
}

const live = (job: UniversalImportJobState) => job.status === 'queued' || job.status === 'processing'

/**
 * Théo B c4-assistant-import.R6 — l'étape « Résultat ». Un import long continue en arrière-plan APRÈS la vérification
 * (jamais à sa place) : on peut fermer la fenêtre, le bilan se retrouve dans Imports & sources. « Annulation
 * protégée » n'est pas affichée ici : l'annulation d'un import de fichier n'existe pas encore.
 */
export function ResultStep({ job, notImported, declined, onDownload, onResume, error }: Props) {
  const { t } = useTranslation('importWizard')
  if (live(job)) {
    return (
      <div className="space-y-4" aria-live="polite">
        <Text element="h2" size="base" weight="semibold" className="text-[var(--text-primary)]">
          {t('contactsImport.assistant.result.queued')}
        </Text>
        <Text size="sm" className="text-[var(--text-secondary)]">
          {t('contactsImport.assistant.result.queuedLead', { count: job.processedRows })}
        </Text>
        <progress className="w-full" />
        <Link to="/contacts/imports" className="inline-flex min-h-11 items-center text-sm underline underline-offset-2">
          {t('contactsImport.assistant.result.backToSources')}
        </Link>
      </div>
    )
  }
  const family = job.breakdown['contact']
  const created = family?.created ?? job.imported
  const completed = family ? family.matched : null
  const notWritten = family ? family.duplicates + family.rejected + family.toReconcile : job.duplicates + job.rejected
  const stopped = job.status === 'failed'
  // Les lignes écartées d'office (verdict qui n'entre pas tel quel) et celles que tu as décochées.
  const lines = notImported.filter(
    row => (row.verdict !== 'create' && row.verdict !== 'complete') || declined.has(row.line),
  )
  return (
    <div className="space-y-5" aria-live="polite">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="size-5 text-[var(--success-soft-text)]" aria-hidden />
        <Text element="h2" size="base" weight="semibold" className="text-[var(--text-primary)]">
          {stopped
            ? t('contactsImport.assistant.result.stopped', { count: job.processedRows })
            : t('contactsImport.assistant.result.title')}
        </Text>
      </div>
      <dl className="flex flex-wrap gap-x-8 gap-y-2">
        {(
          [
            ['created', created],
            ['completed', completed],
            ['notImported', notWritten],
          ] as const
        )
          // Une valeur absente ne s'écrit pas : « complétés » n'a pas de chiffre sans bilan par famille.
          .filter(([key, value]) => value !== null && (value > 0 || key === 'created'))
          .map(([key, value]) => (
            <div key={key}>
              <dd className="text-2xl font-semibold text-[var(--text-primary)]">{value}</dd>
              <dt className="text-sm text-[var(--text-muted)]">{t(`contactsImport.assistant.result.${key}`)}</dt>
            </div>
          ))}
      </dl>
      <div className="flex flex-wrap gap-3">
        <Button asChild variant="black" size="sm">
          <Link to="/contacts">{t('contactsImport.assistant.result.openDirectory')}</Link>
        </Button>
        <Button variant="secondary" size="sm" icon={Download} onClick={onDownload}>
          {t('contactsImport.assistant.result.download')}
        </Button>
        {stopped ? (
          <Button variant="black" size="sm" onClick={onResume}>
            {t('contactsImport.assistant.result.resume')}
          </Button>
        ) : null}
        <Button asChild variant="ghost" size="sm">
          <Link to="/contacts/imports">{t('contactsImport.assistant.result.backToSources')}</Link>
        </Button>
      </div>
      {error ? (
        <Text size="sm" role="alert" className="text-[var(--warning-soft-text)]">
          {error}
        </Text>
      ) : null}
      {hasFamilyReport(job.breakdown) ? (
        <ImportFamilyReport breakdown={job.breakdown} queryableByLaura={job.queryableByLaura} />
      ) : null}
      <section aria-labelledby="result-kept">
        <Text element="h3" id="result-kept" size="sm" weight="semibold" className="text-[var(--text-primary)]">
          {t('contactsImport.assistant.result.kept')}
        </Text>
        <Text size="sm" className="text-[var(--text-secondary)]">
          {t('contactsImport.assistant.result.keptBody')}
        </Text>
      </section>
      {lines.length > 0 ? (
        <section aria-labelledby="result-lines">
          <Text element="h3" id="result-lines" size="sm" weight="semibold" className="text-[var(--text-primary)]">
            {t('contactsImport.assistant.result.notImportedTitle')}
          </Text>
          <ul className="mt-1 space-y-1">
            {lines.map(row => (
              <li key={row.line}>
                <Text size="sm" className="text-[var(--text-secondary)]">
                  {t('contactsImport.assistant.result.lineLabel', { line: row.line })}
                  {row.label ? ` · ${row.label}` : ''}
                  {' — '}
                  {t(
                    `contactsImport.assistant.verification.reason.${declined.has(row.line) ? 'skipped_by_user' : (row.reason ?? 'duplicate')}`,
                    {
                      defaultValue: row.reason ?? '',
                    },
                  )}
                </Text>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
