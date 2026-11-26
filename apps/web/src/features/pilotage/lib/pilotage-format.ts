/**
 * Pilotage — formats de la page Théo. Une valeur absente reste `null` : c'est à l'appelant de
 * rendre « Non mesuré », jamais « 0 » (gardes GA-18 / GA-19).
 */
export function formatKiloEuros(euros: number | null, language: string): string | null {
  if (euros === null || !Number.isFinite(euros)) return null
  if (Math.abs(euros) < 1000) {
    return new Intl.NumberFormat(language, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(
      euros,
    )
  }
  const thousands = euros / 1000
  const digits = Math.abs(thousands) < 100 ? 1 : 0
  return `${new Intl.NumberFormat(language, { maximumFractionDigits: digits }).format(thousands)} k€`
}

function csvCell(value: string): string {
  return /[;"\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

/** « Exporter la synthèse » : ce que la page montre à l'instant, une ligne par indicateur lu. */
export function buildSynthesisCsv(input: {
  month: string
  notMeasured: string
  rows: ReadonlyArray<{ label: string; value: string | null }>
}): string {
  const lines = ['Indicateur;Valeur;Période']
  for (const row of input.rows) {
    lines.push([csvCell(row.label), csvCell(row.value ?? input.notMeasured), csvCell(input.month)].join(';'))
  }
  return lines.join('\n')
}
