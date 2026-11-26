import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountImportLine } from './AccountImportLine'

const provenanceMock = vi.fn()
vi.mock('@/features/crm/hooks/useAccountCrmProvenance', () => ({
  useAccountCrmProvenance: () => provenanceMock(),
}))

// #4680 — « Périmètre & données » dit quand le compte vient d'un import ; rien sinon.
describe('AccountImportLine', () => {
  beforeEach(() => provenanceMock.mockReset())

  it('dit « importé le … depuis un fichier » quand le compte vient d’un fichier', () => {
    provenanceMock.mockReturnValue({
      accountFromCrm: true,
      contacts: [],
      accountImport: { kind: 'file', importedAt: '2026-10-20T08:00:00.000Z' },
    })
    render(<AccountImportLine />)
    expect(screen.getByTestId('scope-account-import').textContent).toMatch(
      /Importé le .*2026.* depuis un fichier|Importé le 2?0\/10\/2026 depuis un fichier/,
    )
  })

  it('un outil branché se dit « depuis un outil branché »', () => {
    provenanceMock.mockReturnValue({
      accountFromCrm: true,
      contacts: [],
      accountImport: { kind: 'tool', importedAt: '2026-10-20T08:00:00.000Z' },
    })
    render(<AccountImportLine />)
    expect(screen.getByTestId('scope-account-import')).toHaveTextContent('depuis un outil branché')
  })

  it('SAIT DIRE NON — sans date : « date non mesurée », jamais une date devinée', () => {
    provenanceMock.mockReturnValue({
      accountFromCrm: true,
      contacts: [],
      accountImport: { kind: 'file', importedAt: null },
    })
    render(<AccountImportLine />)
    expect(screen.getByTestId('scope-account-import')).toHaveTextContent('date non mesurée')
  })

  it('SAIT DIRE NON — compte jamais importé : aucune ligne', () => {
    provenanceMock.mockReturnValue({ accountFromCrm: false, contacts: [] })
    const { container } = render(<AccountImportLine />)
    expect(container).toBeEmptyDOMElement()
  })

  it('hors de la fiche (aucun contexte) : aucune ligne', () => {
    provenanceMock.mockReturnValue(null)
    const { container } = render(<AccountImportLine />)
    expect(container).toBeEmptyDOMElement()
  })
})
