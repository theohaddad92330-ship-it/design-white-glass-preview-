import { SelectField, Text } from '@bellum/ui'
import {
  UNIVERSAL_IMPORT_REGISTRY,
  UNIVERSAL_IMPORT_TYPES,
  type UniversalImportJobState,
  type UniversalImportMapping,
  type UniversalImportPreview,
  type UniversalImportType,
} from '@bellum/contracts'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'

/** #5223 — le choix des feuilles d'un dépôt : celles qu'on lit, et la correspondance de colonnes de chacune. */
export type SheetChoice = {
  chosen: string[]
  /** La correspondance déjà vue (ou éditée) de chaque feuille ; une feuille cochée jamais ouverte est proposée au lancement. */
  mappings: Record<string, UniversalImportMapping>
  /** #5224 — le type CORRIGÉ par l'humain, feuille par feuille ; absent = ce que le serveur propose. Il gagne. */
  types: Record<string, UniversalImportType>
}

/**
 * #5223 — le choix existe quand le serveur DIT, feuille par feuille, si elle est reconnue (`recognised`). Toutes les
 * feuilles reconnues sont cochées d'emblée ; une feuille non reconnue reste décochée, jamais devinée.
 */
export function initialSheetChoice(preview: UniversalImportPreview): SheetChoice | undefined {
  const sheets = preview.sheets
  if (!sheets || sheets.length < 2 || sheets.every(sheet => sheet.recognised === undefined)) return undefined
  return {
    // #5224 — une égalité entre deux types n'est jamais cochée d'office : l'humain tranche.
    chosen: sheets
      .filter(sheet => sheet.recognised && !(sheet.candidates && sheet.candidates.length > 1))
      .map(sheet => sheet.name),
    mappings: preview.sheet ? { [preview.sheet]: preview.mapping } : {},
    types: {},
  }
}

/** Les types dans lesquels on sait écrire — les mêmes libellés que le choix du type du dépôt (un seul jeu de noms). */
const WRITABLE_TYPES = UNIVERSAL_IMPORT_TYPES.filter(type => UNIVERSAL_IMPORT_REGISTRY[type].writable)

export function SheetChoiceList({
  sheets,
  chosen,
  types,
  onToggle,
  onType,
}: {
  sheets: NonNullable<UniversalImportPreview['sheets']>
  chosen: readonly string[]
  types: Readonly<Record<string, UniversalImportType>>
  onToggle: (name: string) => void
  onType: (name: string, type: UniversalImportType) => void
}) {
  const { t } = useTranslation('importWizard')
  return (
    <fieldset className="space-y-2 rounded-card border border-[var(--bellum-border)] bg-card p-5">
      <legend className="px-1 text-sm font-semibold text-[var(--bellum-text-primary)]">
        {t('universal.sheets.title')}
      </legend>
      <Text size="sm" className="text-[var(--bellum-text-muted)]">
        {t('universal.sheets.help')}
      </Text>
      <ul className="space-y-1">
        {sheets.map(sheet => (
          <li key={sheet.name} data-testid={`sheet-type-${sheet.name}`} className="py-1">
            <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1">
              <input
                type="checkbox"
                className="mt-1 size-4"
                checked={chosen.includes(sheet.name)}
                onChange={() => onToggle(sheet.name)}
              />
              <span className="min-w-0">
                <span className="block break-words text-sm text-[var(--bellum-text-primary)]">
                  {t('universal.sheet.option', { name: sheet.name, count: sheet.rows })}
                </span>
                <span className="block text-xs text-[var(--bellum-text-muted)]">
                  {reasonOf(sheet, types[sheet.name], t)}
                </span>
              </span>
            </label>
            <div className="ml-7 max-w-sm">
              <SelectField
                ariaLabel={t('universal.sheets.typeOf', { name: sheet.name })}
                placeholder={t('universal.sheets.typePlaceholder')}
                value={types[sheet.name] ?? sheet.detected?.type ?? ''}
                onChange={next => onType(sheet.name, next as UniversalImportType)}
                options={WRITABLE_TYPES.map(type => ({ value: type, label: t(`universal.types.${type}`) }))}
              />
            </div>
          </li>
        ))}
      </ul>
      {chosen.length === 0 ? (
        <Text size="sm" className="text-[var(--warning-soft-text)]">
          {t('universal.sheets.noneChosen')}
        </Text>
      ) : null}
    </fieldset>
  )
}

type SheetOf = NonNullable<UniversalImportPreview['sheets']>[number]

/** #5224 — ce que le produit croit lire dans la feuille, lisible : le type ET les colonnes, jamais un score. */
function reasonOf(sheet: SheetOf, corrected: UniversalImportType | undefined, t: TFunction<'importWizard'>): string {
  if (corrected) return t('universal.sheets.corrected', { type: t(`universal.types.${corrected}`) })
  if (sheet.detected)
    return t('universal.sheets.detected', {
      type: t(`universal.types.${sheet.detected.type}`),
      columns: sheet.detected.columns.join(', '),
    })
  if (sheet.candidates && sheet.candidates.length > 1)
    return t('universal.sheets.tie', { types: sheet.candidates.map(type => t(`universal.types.${type}`)).join(' / ') })
  return sheet.recognised ? t('universal.sheets.recognised') : t('universal.sheets.unrecognised')
}

/**
 * #5223 — UN bilan, ventilé par feuille : lignes lues, créées, à revoir, écartées avec leur raison. Une absence ne
 * fait AUCUNE ligne (jamais « 0 écartée ») ; `totalRows` inconnu (feuille non lue jusqu'au bout) ne s'écrit pas.
 */
export function ImportSheetsReport({ sheets }: { sheets: NonNullable<UniversalImportJobState['sheets']> }) {
  const { t } = useTranslation('importWizard')
  return (
    <div className="space-y-1" data-testid="import-sheets-report">
      <Text size="sm" weight="medium" className="text-[var(--text-primary)]">
        {t('universal.sheets.reportTitle')}
      </Text>
      <ul className="space-y-1">
        {sheets.map(sheet => {
          const review = sheet.duplicates + sheet.toReconcile
          const parts = [
            sheet.totalRows !== null ? t('universal.sheets.read', { count: sheet.totalRows }) : null,
            sheet.created > 0 ? t('universal.sheets.created', { count: sheet.created }) : null,
            review > 0 ? t('universal.sheets.review', { count: review }) : null,
            sheet.rejected > 0 ? t('universal.sheets.rejected', { count: sheet.rejected }) : null,
          ].filter(Boolean)
          return (
            <li key={sheet.name}>
              <Text size="sm">
                <span className="font-medium">{sheet.name}</span>
                {parts.length > 0 ? ` — ${parts.join(' · ')}` : ''}
                {sheet.done ? '' : ` (${t('universal.sheets.notDone')})`}
              </Text>
              {sheet.reasons.length > 0 ? (
                <ul className="ml-4 list-disc">
                  {sheet.reasons.map(reason => (
                    <li key={`${reason.kind}-${reason.reason}`}>
                      <Text size="xs" className="text-[var(--bellum-text-muted)]">
                        {t(`universal.history.reasons.${reason.kind}.${reason.reason}`, {
                          count: reason.count,
                          defaultValue: `${reason.count} · ${reason.reason}`,
                        })}
                      </Text>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
