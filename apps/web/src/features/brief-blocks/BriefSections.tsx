import type { CommercialBrief } from '@bellum/contracts'
import { Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@bellum/ui'
import { formatCount } from '@/lib/locale'
import { BriefFold } from './BriefFold'
import type { BriefT } from './brief-t'

function cellText(value: string | number | boolean | null | undefined, yes: string, no: string): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'boolean') return value ? yes : no
  if (typeof value === 'number') return formatCount(value)
  return value
}

/** #5106.9 — la clé de la section « achats avant d'appeler » : sur un compte, elle vit dans Pratiques achats. */
export const PROCUREMENT_SECTION_KEY = 'achats-avant-d-appeler'

/**
 * Sections tabulaires repliables (colonnes et lignes portées par le brief).
 * `procurementLink` (compte seulement, #5106.9) remplace le tableau achats par une ligne-lien : rien n'apparaît
 * deux fois sous la même forme (GA-26). Absent (brief de marché) : la section reste un tableau.
 */
export function BriefSections({
  sections,
  t,
  procurementLink,
}: {
  sections: CommercialBrief['sections']
  t: BriefT
  procurementLink?: { label: string; onOpen: () => void }
}) {
  return (
    <>
      {sections.map(section =>
        procurementLink && section.key === PROCUREMENT_SECTION_KEY ? (
          // #5106.9
          <button
            key={section.key}
            type="button"
            data-testid="brief-procurement-link"
            onClick={procurementLink.onOpen}
            className="inline-flex min-h-11 w-fit items-center text-sm text-[var(--bellum-text-accent)] underline-offset-2 hover:underline"
          >
            {procurementLink.label}
          </button>
        ) : (
          <BriefFold
            key={section.key}
            testId={`brief-section-${section.key}`}
            title={section.title}
            count={section.rows.length}
          >
            <Table scrollLabel={section.title}>
              <TableHeader>
                <TableRow>
                  {section.columns.map(column => (
                    <TableHead key={column.key}>{column.label}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {section.rows.map((row, index) => (
                  <TableRow key={index}>
                    {section.columns.map((column, columnIndex) => (
                      <TableCell key={column.key} className="whitespace-normal">
                        {cellText(row[column.key], t('table.yes'), t('table.no'))}
                        {columnIndex === 0 && row['exited'] === true ? (
                          <Badge variant="outline" className="ml-2">
                            {t('entities.exited')}
                          </Badge>
                        ) : null}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </BriefFold>
        ),
      )}
    </>
  )
}
