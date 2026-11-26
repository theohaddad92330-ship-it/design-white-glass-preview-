import { Button, Input, SelectField, Text } from '@bellum/ui'
import type { UniversalImportMapping, UniversalImportPreview, UniversalImportScope } from '@bellum/contracts'
import { UNIVERSAL_IMPORT_REGISTRY } from '@bellum/contracts'
import { useTranslation } from 'react-i18next'

type Props = {
  filename: string
  preview: UniversalImportPreview
  mapping: UniversalImportMapping
  onMapping: (mapping: UniversalImportMapping) => void
  onSheet: (sheet: string) => void
  scope: UniversalImportScope
  onScope: (scope: UniversalImportScope) => void
  sourceSystem: string
  onSourceSystem: (value: string) => void
  verifying: boolean
  error: string | null
  onBack: () => void
  onVerify: () => void
}

/**
 * Théo B c4-assistant-import.R2 — l'étape « Colonnes » : une carte par colonne du fichier (valeur d'exemple ↔ champ),
 * le choix de la feuille d'un classeur (A1), « Organiser l'arrivée » : qui voit les contacts (A5 de C3), le CRM d'origine
 * (A6 de C3). Une colonne sans champ d'accueil n'est jamais jetée : elle reste en informations complémentaires (A4).
 */
export function ColumnsStep({
  filename,
  preview,
  mapping,
  onMapping,
  onSheet,
  scope,
  onScope,
  sourceSystem,
  onSourceSystem,
  verifying,
  error,
  onBack,
  onVerify,
}: Props) {
  const { t } = useTranslation('importWizard')
  const used = new Set(Object.values(mapping).filter(Boolean))
  const kept = preview.headers.filter(header => !mapping[header])
  // Un contact se nomme aussi par prénom + nom : le champ obligatoire est alors composé.
  const nameComposed = used.has('first_name') && used.has('last_name')
  const missing = UNIVERSAL_IMPORT_REGISTRY['contact'].fields.filter(
    field => field.required && !used.has(field.key) && !(field.key === 'full_name' && nameComposed),
  )
  const rows = preview.sample.length
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <Text size="sm" weight="semibold" className="break-all text-[var(--text-primary)]">
          {filename}
        </Text>
        <Text size="sm" className="text-[var(--text-muted)]">
          {t('contactsImport.assistant.columns.fileSummary', { rows, columns: preview.headers.length })}
        </Text>
        <Text size="sm" className="text-[var(--text-muted)]">
          {t('contactsImport.assistant.columns.untouched')}
        </Text>
      </div>
      <Text size="xs" className="-mt-4 text-[var(--text-muted)]">
        {t('contactsImport.assistant.columns.autoRead')}
      </Text>

      {preview.sheets && preview.sheets.length > 1 ? (
        <div className="flex max-w-sm flex-col gap-1">
          <Text size="sm" weight="medium" className="text-[var(--text-primary)]">
            {t('contactsImport.assistant.columns.sheet')}
          </Text>
          <SelectField
            ariaLabel={t('contactsImport.assistant.columns.sheet')}
            value={preview.sheet ?? ''}
            onChange={next => onSheet(next)}
            options={preview.sheets.map(sheet => ({
              value: sheet.name,
              label: t('universal.sheet.option', { name: sheet.name, count: sheet.rows }),
            }))}
          />
        </div>
      ) : null}

      <section aria-labelledby="columns-fields">
        <Text element="h3" id="columns-fields" size="base" weight="semibold" className="text-[var(--text-primary)]">
          {t('contactsImport.assistant.columns.findFields')}
        </Text>
        <Text size="sm" className="mb-3 text-[var(--text-muted)]">
          {t('contactsImport.assistant.columns.findFieldsHint')}
        </Text>
        <ul className="grid gap-3 md:grid-cols-2">
          {preview.headers.map(header => {
            const example = preview.sample.find(row => row[header]?.trim())?.[header]
            const firstRowEmpty = !preview.sample[0]?.[header]?.trim()
            return (
              <li key={header} className="rounded-lg border border-[var(--border-subtle)] p-3">
                <Text size="sm" weight="medium" className="break-all text-[var(--text-primary)]">
                  {header}
                </Text>
                <Text size="xs" className="mb-2 text-[var(--text-muted)]">
                  {firstRowEmpty ? t('contactsImport.assistant.columns.emptyCell') : example}
                </Text>
                <SelectField
                  ariaLabel={t('universal.mapping.fieldFor', { column: header })}
                  value={mapping[header] ?? ''}
                  onChange={next => onMapping({ ...mapping, [header]: next || null })}
                  emptyOption={{ label: t('contactsImport.assistant.columns.keepExtra') }}
                  options={preview.fields.map(field => ({
                    value: field,
                    label: t(`universal.fields.${field}`, { defaultValue: field }),
                    // Un champ déjà pris par une autre colonne : deux colonnes ne s'écrasent jamais.
                    disabled: used.has(field) && mapping[header] !== field,
                  }))}
                />
              </li>
            )
          })}
        </ul>
        {kept.length > 0 ? (
          <Text size="sm" className="mt-3 text-[var(--text-secondary)]">
            {t('contactsImport.assistant.columns.keepExtraSome', { count: kept.length, list: kept.join(', ') })}
          </Text>
        ) : null}
        {missing.length > 0 ? (
          <Text size="sm" className="mt-2 text-[var(--warning-soft-text)]">
            {t('contactsImport.assistant.columns.missing', {
              fields: missing.map(field => t(`universal.fields.${field.key}`, { defaultValue: field.key })).join(', '),
            })}
          </Text>
        ) : null}
      </section>

      <section aria-labelledby="columns-arrival" className="space-y-3">
        <Text element="h3" id="columns-arrival" size="base" weight="semibold" className="text-[var(--text-primary)]">
          {t('contactsImport.assistant.columns.arrival')}
        </Text>
        <fieldset className="space-y-1">
          <legend className="text-sm font-medium text-[var(--text-primary)]">
            {t('contactsImport.assistant.columns.whoSees')}
          </legend>
          <div className="flex flex-wrap gap-4">
            {(['workspace', 'personal'] as const).map(value => (
              <label key={value} className="flex min-h-11 items-center gap-2 text-sm text-[var(--text-primary)]">
                <input
                  type="radio"
                  name="import-scope"
                  checked={scope === value}
                  onChange={() => onScope(value)}
                  aria-label={t(`contactsImport.assistant.columns.${value === 'workspace' ? 'team' : 'justMe'}`)}
                />
                {t(`contactsImport.assistant.columns.${value === 'workspace' ? 'team' : 'justMe'}`)}
              </label>
            ))}
          </div>
          {scope === 'personal' ? (
            <Text size="xs" className="text-[var(--text-muted)]">
              {t('universal.scope.personalHint')}
            </Text>
          ) : null}
        </fieldset>
        <div className="flex max-w-sm flex-col gap-1">
          <label htmlFor="import-crm-origin" className="text-sm font-medium text-[var(--text-primary)]">
            {t('contactsImport.assistant.columns.crmOrigin')}
          </label>
          <Input
            id="import-crm-origin"
            value={sourceSystem}
            onChange={event => onSourceSystem(event.target.value)}
            placeholder={t('contactsImport.assistant.columns.crmOriginPlaceholder')}
            maxLength={80}
          />
          {sourceSystem.trim() ? (
            <Text size="xs" className="text-[var(--text-muted)]">
              {t('contactsImport.assistant.columns.crmOriginHint', { crm: sourceSystem.trim() })}
            </Text>
          ) : null}
        </div>
        <Text size="sm" className="text-[var(--text-muted)]">
          {t('contactsImport.assistant.columns.notes')}
        </Text>
      </section>

      {error ? (
        <Text size="sm" role="alert" className="text-[var(--warning-soft-text)]">
          {error}
        </Text>
      ) : null}
      <div className="flex flex-wrap justify-between gap-3">
        <Button variant="secondary" size="sm" onClick={onBack}>
          {t('contactsImport.assistant.columns.changeSource')}
        </Button>
        <Button variant="black" size="sm" onClick={onVerify} disabled={verifying}>
          {verifying ? t('contactsImport.assistant.columns.verifying') : t('contactsImport.assistant.columns.verify')}
        </Button>
      </div>
    </div>
  )
}
