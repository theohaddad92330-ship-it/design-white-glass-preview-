import { memo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ImportedFromFileNote } from '@/features/universal-import/view/ImportedFromFileNote'
import { ESN_TARGET_LEVELS, type EsnTargetPersonasImportReport } from '@bellum/contracts'
import { Button, Text } from '@bellum/ui'
import { useEsnProfileWorkspaceMeta } from '../hooks/useEsnProfileWorkspaceMeta'
import { useImportTargetPersonas, useTargetPersonas } from '../hooks/useTargetPersonas'
import { SettingsCard } from './SettingsCard'

/**
 * #3754.1 — Réglages › Profil ESN : importer les postes cibles de l'ESN avec leur
 * niveau décideur (csv ou xlsx). Ils ORDONNENT les contacts d'un compte, jamais
 * ne les filtrent (doctrine c76) ; chaque ligne invalide est NOMMÉE.
 */
export const TargetPersonasSection = memo(function TargetPersonasSection() {
  const { t } = useTranslation('profile')
  const { data: meta } = useEsnProfileWorkspaceMeta()
  const { data } = useTargetPersonas()
  const importer = useImportTargetPersonas()
  const csvRef = useRef<HTMLInputElement>(null)
  const xlsxRef = useRef<HTMLInputElement>(null)
  const [report, setReport] = useState<EsnTargetPersonasImportReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const locked = (meta?.shared ?? false) && !(meta?.canEditCompany ?? true)
  const count = data?.personas.length

  const submit = async (format: 'csv' | 'xlsx', file: File) => {
    setReport(null)
    setError(null)
    try {
      const content = format === 'xlsx' ? await readAsBase64(file) : await readAsText(file)
      setReport(await importer.mutateAsync({ format, content }))
    } catch (caught) {
      // Le message du serveur porte la RAISON (fichier trop long, xlsx illisible…).
      setError((caught as Error).message || t('targetPersonas.failed'))
    }
  }

  return (
    <SettingsCard title={t('targetPersonas.title')} description={t('targetPersonas.description')}>
      <div className="space-y-3">
        {/* #4426.2 — d'où viennent les niveaux, quand l'assistant « Dépose tes documents » les a posés. */}
        <ImportedFromFileNote destination="target_personas" />
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('targetPersonas.format')}
        </Text>
        <ul className="space-y-0.5">
          {ESN_TARGET_LEVELS.map(level => (
            <li key={level}>
              <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                {t(`targetPersonas.levels.${level}`)}
              </Text>
            </li>
          ))}
        </ul>
        <Text size="sm" weight="medium">
          {count !== undefined && count > 0 ? t('targetPersonas.count', { count }) : t('targetPersonas.empty')}
        </Text>

        <input
          ref={csvRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          aria-label={t('targetPersonas.chooseCsv')}
          onChange={event => {
            const file = event.target.files?.[0]
            if (file) void submit('csv', file)
            event.target.value = ''
          }}
        />
        <input
          ref={xlsxRef}
          type="file"
          accept=".xlsx"
          className="hidden"
          aria-label={t('targetPersonas.chooseXlsx')}
          onChange={event => {
            const file = event.target.files?.[0]
            if (file) void submit('xlsx', file)
            event.target.value = ''
          }}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            className="min-h-11"
            disabled={locked || importer.isPending}
            onClick={() => csvRef.current?.click()}
          >
            {importer.isPending ? t('targetPersonas.working') : t('targetPersonas.chooseCsv')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="min-h-11"
            disabled={locked || importer.isPending}
            onClick={() => xlsxRef.current?.click()}
          >
            {t('targetPersonas.chooseXlsx')}
          </Button>
        </div>
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {locked ? t('targetPersonas.locked') : t('targetPersonas.replaceHint')}
        </Text>

        {error ? (
          <Text size="sm" className="text-[var(--danger-soft-text)]">
            {error}
          </Text>
        ) : null}

        {report ? (
          <div className="space-y-1.5" data-testid="target-personas-report">
            {report.missing_columns.map(column => (
              <Text key={column} size="sm" className="text-[var(--danger-soft-text)]">
                {t(`targetPersonas.missingColumn.${column}`)}
              </Text>
            ))}
            {report.imported > 0 ? (
              <Text size="sm" weight="medium">
                {t('targetPersonas.summary', { count: report.imported })}
              </Text>
            ) : null}
            {report.fed_to_personas > 0 ? (
              <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                {t('targetPersonas.fed', { count: report.fed_to_personas })}
              </Text>
            ) : null}
            {report.rejected.length > 0 ? (
              <>
                <Text size="xs" weight="medium">
                  {t('targetPersonas.rejectedTitle', { count: report.rejected.length })}
                </Text>
                <ul className="max-h-48 space-y-0.5 overflow-y-auto">
                  {report.rejected.map(row => (
                    <li key={`${row.line}-${row.reason}`}>
                      <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                        {t(`targetPersonas.rejected.${row.reason}`, { line: row.line })}
                      </Text>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </SettingsCard>
  )
})

function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('read_failed'))
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.readAsText(file)
  })
}

/** Le fichier → base64, sans le préfixe `data:` (même patron que les autres imports xlsx). */
function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('read_failed'))
    reader.onload = () => {
      const result = String(reader.result ?? '')
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.readAsDataURL(file)
  })
}
