import { cvBatchBreakdown, documentUploadBreakdown } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { i18n } from '@/i18n'
import { ImportFamilyReport, hasFamilyReport } from './ImportFamilyReport'

// #4051.2 — le bilan par famille couvre aussi les CV et les documents : jamais « tout importé ».
beforeEach(async () => {
  await i18n.changeLanguage('fr')
})

describe('ImportFamilyReport — CV et documents (#4051.2)', () => {
  it('CV : créés, mis à jour, à rapprocher, échoués — chacun son nombre', () => {
    const breakdown = cvBatchBreakdown({ created: 5, auto_updated: 2, exception: 3, too_big: 1, failed: 4 })
    render(<ImportFamilyReport breakdown={breakdown} queryableByLaura={null} />)
    const report = screen.getByTestId('import-family-report')
    expect(report).toHaveTextContent('CV')
    expect(report).toHaveTextContent('5 CV importés')
    expect(report).toHaveTextContent('2 fiches consultants existantes mises à jour')
    expect(report).toHaveTextContent('3 CV à rapprocher, avec leur raison')
    expect(report).toHaveTextContent('5 CV échoués, avec leur raison')
  })

  it('documents : déposés et échoués', () => {
    render(<ImportFamilyReport breakdown={documentUploadBreakdown({ done: 3, failed: 1 })} queryableByLaura={null} />)
    const report = screen.getByTestId('import-family-report')
    expect(report).toHaveTextContent('3 documents déposés et indexés')
    expect(report).toHaveTextContent('1 document échoué')
  })

  it('⚠️ SAIT DIRE NON — rien d’échoué : aucune ligne d’échec, jamais « 0 »', () => {
    render(<ImportFamilyReport breakdown={documentUploadBreakdown({ done: 2, failed: 0 })} queryableByLaura={null} />)
    expect(screen.getByTestId('import-family-report')).not.toHaveTextContent(/échoué/)
    expect(screen.getByTestId('import-family-report')).not.toHaveTextContent(/\b0 /)
  })

  // #4051.5 (18/10) — personnes distinctes et comptes résolus : deux nombres que le bilan lisait mal (lignes ≠ personnes).
  it('#4051.5 — contacts : personnes distinctes et comptes résolus, chacun son nombre', () => {
    const breakdown = {
      contact: {
        created: 5,
        matched: 0,
        duplicates: 2,
        rejected: 0,
        toReconcile: 0,
        distinctPeople: 6,
        resolvedAccounts: 3,
      },
    }
    render(<ImportFamilyReport breakdown={breakdown} queryableByLaura={null} />)
    const report = screen.getByTestId('import-family-report')
    expect(report).toHaveTextContent('6 personnes distinctes')
    expect(report).toHaveTextContent('3 comptes résolus')
  })

  it('⚠️ SAIT DIRE NON — #4051.5 non calculé : ni personnes distinctes ni comptes résolus, jamais « 0 »', () => {
    const breakdown = { contact: { created: 0, matched: 0, duplicates: 2, rejected: 0, toReconcile: 0 } }
    render(<ImportFamilyReport breakdown={breakdown} queryableByLaura={null} />)
    const report = screen.getByTestId('import-family-report')
    expect(report).not.toHaveTextContent(/distincte/)
    expect(report).not.toHaveTextContent(/résolu/)
  })

  it('⚠️ SAIT DIRE NON — un lot sans issue n’a aucun bilan', () => {
    expect(
      hasFamilyReport(cvBatchBreakdown({ created: 0, auto_updated: 0, exception: 0, too_big: 0, failed: 0 })),
    ).toBe(false)
    expect(hasFamilyReport(documentUploadBreakdown({ done: 0, failed: 0 }))).toBe(false)
  })
})
