/* ------------------------------------------------------------------ */
/*  CSV primitives, shared by every export in the app.                  */
/*  Kept apart from `export-csv.ts` (the contacts export) so a feature  */
/*  can format rows without pulling in — or being mocked along with —   */
/*  that specific exporter.                                            */
/* ------------------------------------------------------------------ */

/**
 * Quote one CSV cell, neutralising spreadsheet formula injection: exported
 * fields come from scraping + AI output, so a value starting with `= + - @`
 * (or tab/CR) could execute in Excel/Sheets. Prefix it with a single quote
 * before the usual CSV quoting.
 */
function escapeCsvValue(val: string): string {
  const safe = /^[=+\-@\t\r]/.test(val) ? `'${val}` : val
  return `"${safe.replace(/"/g, '""')}"`
}

/** Rows → CSV text, BOM-prefixed so Excel opens UTF-8 without mangling accents. */
export function toCsv(rows: readonly (readonly string[])[]): string {
  return '﻿' + rows.map(row => row.map(escapeCsvValue).join(',')).join('\n')
}
