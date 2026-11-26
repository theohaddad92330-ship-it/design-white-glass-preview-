import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { SpreadsheetSheet } from './spreadsheet'

/** Au-delà, la grille ne rend plus de ligne : un DOM de 2 000 × 100 cellules gèle un téléphone. */
const MAX_RENDERED_ROWS = 500

function columnLetter(index: number): string {
  let name = ''
  let rest = index + 1
  while (rest > 0) {
    const remainder = (rest - 1) % 26
    name = String.fromCharCode(65 + remainder) + name
    rest = Math.floor((rest - 1) / 26)
  }
  return name
}

/**
 * #3803 (3803.2) — un classeur tel qu'il est : ses ONGLETS cliquables, une
 * grille avec en-têtes de colonnes (A, B, C…) et numéros de lignes, les
 * cellules longues REPLIÉES (le texte entier au survol, `title`), et un
 * défilement horizontal DANS la grille — jamais la page qui déborde.
 */
export function SpreadsheetGrid({ sheets }: { sheets: readonly SpreadsheetSheet[] }) {
  const { t } = useTranslation('common')
  const [active, setActive] = useState(0)
  const sheet = sheets[Math.min(active, sheets.length - 1)]
  const rows = sheet?.rows ?? []
  const shown = rows.slice(0, MAX_RENDERED_ROWS)
  const columnCount = shown.reduce((max, row) => Math.max(max, row.length), 0)

  return (
    <div className="flex min-w-0 flex-col gap-2">
      {sheets.length > 1 ? (
        <div role="tablist" aria-label={t('documentPreview.sheetsLabel')} className="flex gap-1 overflow-x-auto">
          {sheets.map((candidate, index) => (
            <button
              key={`${candidate.name}-${index}`}
              type="button"
              role="tab"
              aria-selected={index === active}
              onClick={() => setActive(index)}
              className={`min-h-11 shrink-0 rounded-md border px-3 text-sm ${
                index === active
                  ? 'border-[var(--bellum-text-accent)] font-semibold text-[var(--bellum-text-accent)]'
                  : 'border-[var(--bellum-border)] text-[var(--bellum-text-secondary)]'
              }`}
            >
              {candidate.name || columnLetter(index)}
            </button>
          ))}
        </div>
      ) : null}
      {columnCount === 0 ? (
        <p className="text-sm text-[var(--bellum-text-muted)]">{t('documentPreview.emptySheet')}</p>
      ) : (
        <div className="max-h-[60dvh] overflow-auto rounded-md border border-[var(--bellum-border)]">
          <table className="border-collapse text-xs">
            <thead className="sticky top-0 bg-[var(--bellum-bg)]">
              <tr>
                <th scope="col" className="border border-[var(--bellum-border)] px-2 py-1" />
                {Array.from({ length: columnCount }, (_, index) => (
                  <th
                    key={index}
                    scope="col"
                    className="border border-[var(--bellum-border)] px-2 py-1 font-semibold text-[var(--bellum-text-muted)]"
                  >
                    {columnLetter(index)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  <th
                    scope="row"
                    className="border border-[var(--bellum-border)] px-2 py-1 text-right font-normal text-[var(--bellum-text-muted)]"
                  >
                    {rowIndex + 1}
                  </th>
                  {Array.from({ length: columnCount }, (_, column) => {
                    const value = row[column] ?? ''
                    return (
                      <td
                        key={column}
                        title={value.length > 40 ? value : undefined}
                        className="max-w-[16rem] truncate border border-[var(--bellum-border)] px-2 py-1 text-[var(--bellum-text-secondary)]"
                      >
                        {value}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > MAX_RENDERED_ROWS ? (
        <p className="text-xs text-[var(--bellum-text-muted)]">
          {t('documentPreview.rowsTruncated', { count: MAX_RENDERED_ROWS })}
        </p>
      ) : null}
    </div>
  )
}
