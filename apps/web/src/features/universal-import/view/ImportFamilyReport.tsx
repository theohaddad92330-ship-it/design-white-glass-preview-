import { Text } from '@bellum/ui'
import type { UniversalImportBreakdown, UniversalImportFamilyCounts } from '@bellum/contracts'
import { useTranslation } from 'react-i18next'

// #4051.2 — les CV et les documents ont leur propre chemin d'import : même bilan, même composant.
const FAMILY_ORDER = ['account', 'contact', 'need', 'talent', 'mission', 'cv', 'document'] as const
const COUNT_KEYS = [
  'created',
  'matched',
  'duplicates',
  'rejected',
  'toReconcile',
  'alreadyKnown',
  'resolvedAccounts',
] as const

/** Le bilan par famille existe-t-il ? Un lot d'avant (`breakdown` vide) garde ses compteurs globaux. */
export function hasFamilyReport(breakdown: UniversalImportBreakdown | null | undefined): boolean {
  return FAMILY_ORDER.some(family => breakdown?.[family])
}

/**
 * #4051.1 — LE BILAN d'un lot, PAR FAMILLE : créés, reconnus par leur référence CRM, doublons proposés,
 * écartés, à rapprocher — chacun avec son nombre, et une absence ne fait AUCUNE ligne (jamais un « 0 »).
 * Jamais « tout importé » : on dit ce qui est lu, ce qui en est fait, et ce que Laura peut interroger.
 *
 * UN SEUL composant pour les deux chemins d'import (l'import universel de /contacts et l'assistant de
 * reprise de /settings/import) : deux bilans pour la même chose finiraient par ne plus dire pareil.
 */
export function ImportFamilyReport({
  breakdown,
  queryableByLaura,
}: {
  breakdown: UniversalImportBreakdown
  queryableByLaura: number | null
}) {
  const { t } = useTranslation('importWizard')
  const families = FAMILY_ORDER.filter(family => breakdown[family])
  return (
    <div className="space-y-3" data-testid="import-family-report">
      {families.map(family => {
        const counts = breakdown[family] as UniversalImportFamilyCounts
        // #4051.5 — les personnes DISTINCTES que l'API a comptées ; un lot d'avant garde l'ancien compte (créés + reconnus).
        const people = family === 'contact' ? (counts.distinctPeople ?? counts.created + counts.matched) : 0
        return (
          <div key={family} className="space-y-1">
            <Text size="sm" weight="medium" className="text-[var(--text-primary)]">
              {t(
                family === 'cv' || family === 'document'
                  ? `universal.report.familyTitle.${family}`
                  : `universal.types.${family}`,
              )}
            </Text>
            <ul className="space-y-1">
              {COUNT_KEYS.flatMap(key => {
                // Une valeur absente (lot d'avant, `alreadyKnown` non porté) ne fait AUCUNE ligne, jamais « 0 ».
                const count = counts[key]
                if (count === undefined || count <= 0) return []
                return [
                  <li key={key}>
                    <Text size="sm">{t(`universal.report.family.${family}.${key}`, { count })}</Text>
                  </li>,
                ]
              })}
              {people > 0 ? (
                <li>
                  <Text size="sm" className="text-[var(--text-muted)]">
                    {t('universal.report.people', { count: people })}
                  </Text>
                </li>
              ) : null}
            </ul>
          </div>
        )
      })}
      {queryableByLaura !== null ? (
        <Text size="sm" className="text-[var(--text-primary)]">
          {queryableByLaura > 0
            ? t('universal.report.queryable', { count: queryableByLaura })
            : t('universal.report.queryableNone')}
        </Text>
      ) : null}
    </div>
  )
}
