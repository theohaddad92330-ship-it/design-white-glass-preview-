import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { UniversalImportVerification } from '@bellum/contracts'
import { ImportVerificationSummary } from './ImportVerificationSummary'

const report = (rows: UniversalImportVerification['rows']): UniversalImportVerification => ({
  total: rows.length,
  toCreate: rows.filter(row => row.verdict === 'create').length,
  toComplete: 0,
  discarded: rows.filter(row => row.verdict !== 'create').length,
  rows,
  truncated: false,
  sensitiveColumns: [],
  withoutLegalBasis: 0,
})

/** #2732.1 — « 1 écartés / à revoir » sans motif ne dit pas quoi corriger : chaque ligne écartée NOMME le sien. */
describe('ImportVerificationSummary — motifs des lignes écartées', () => {
  it('nomme le motif de chaque ligne écartée, avec son numéro', () => {
    render(
      <ImportVerificationSummary
        report={report([
          { line: 2, verdict: 'create', label: 'Refonte SI', reason: null, existingId: null },
          { line: 3, verdict: 'invalid', label: null, reason: 'missing_required_field', existingId: null },
          { line: 4, verdict: 'invalid', label: 'Migration cloud', reason: 'unknown_company', existingId: null },
        ])}
      />,
    )
    const list = screen.getByTestId('import-discarded-rows')
    expect(list.textContent).toContain('Ligne 3 — Champ obligatoire absent')
    expect(list.textContent).toContain('Ligne 4 — Société introuvable (Migration cloud)')
    expect(list.textContent).not.toContain('Ligne 2')
  })

  it('NON : aucune ligne écartée → aucune liste', () => {
    render(
      <ImportVerificationSummary
        report={report([{ line: 2, verdict: 'create', label: 'Refonte SI', reason: null, existingId: null }])}
      />,
    )
    expect(screen.queryByTestId('import-discarded-rows')).toBeNull()
  })
})

describe('ImportVerificationSummary — #5223 ventilé par feuille', () => {
  it('une ligne par feuille ; une absence ne fait aucune mention « 0 »', () => {
    render(
      <ImportVerificationSummary
        report={{
          ...report([]),
          total: 4,
          toCreate: 3,
          discarded: 1,
          sheets: [
            { name: 'Comptes A', total: 2, toCreate: 2, toComplete: 0, discarded: 0 },
            { name: 'Comptes B', total: 2, toCreate: 1, toComplete: 0, discarded: 1 },
          ],
        }}
      />,
    )
    const list = screen.getByTestId('import-verification-sheets')
    expect(list.textContent).toContain('Comptes A — 2 lues · 2 à créer')
    expect(list.textContent).toContain('Comptes B — 2 lues · 1 à créer · 1 écartée')
    expect(list.textContent).not.toMatch(/0 écart/)
  })
})
