import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

const allowed = vi.hoisted(() => ({ value: true }))

// Les options portent LEURS hooks : on les remplace par des repères, ce qui est
// vérifié ici c'est le REGROUPEMENT (#3554, #3556), pas chaque dialogue.
vi.mock('./CvSingleImportDialog', () => ({ CvSingleImportDialog: () => <button type="button">opt-single</button> }))
vi.mock('./CvZipImportDialog', () => ({ CvZipImportDialog: () => <button type="button">opt-zip</button> }))
vi.mock('./CvMailImportDialog', () => ({ CvMailImportDialog: () => <button type="button">opt-mail</button> }))
vi.mock('./CvCsvImportDialog', () => ({ CvCsvImportDialog: () => <button type="button">opt-csv</button> }))
vi.mock('./AvailabilityImportDialog', () => ({
  AvailabilityImportDialog: () => <button type="button">opt-availability</button>,
}))
vi.mock('./AtsExportButton', () => ({ AtsExportButton: () => <button type="button">opt-ats</button> }))
vi.mock('./BulkExportButton', () => ({ BulkExportButton: () => <button type="button">opt-bulk</button> }))
vi.mock('@/lib/data-exit', () => ({ useDataExit: () => ({ allowed: allowed.value, grant: null }) }))

const { VivierImportMenu, VivierExportMenu } = await import('./VivierIoMenus')

afterEach(() => {
  cleanup()
  allowed.value = true
})

describe('VivierImportMenu — UN bouton « Importer » (#3554, #3556)', () => {
  it('ne montre aucune option tant que la modale est fermée', () => {
    render(<VivierImportMenu />)
    expect(screen.getByRole('button', { name: 'Importer' })).toBeInTheDocument()
    expect(screen.queryByText('opt-csv')).not.toBeInTheDocument()
  })

  it('ouvre une modale qui porte les CINQ imports, aucun supprimé (dont le CV unique, #3811)', async () => {
    render(<VivierImportMenu />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Importer' }))
    const dialog = await screen.findByRole('dialog')
    for (const option of ['opt-single', 'opt-csv', 'opt-zip', 'opt-mail', 'opt-availability']) {
      expect(within(dialog).getByText(option)).toBeInTheDocument()
    }
  })

  it('s’ouvre d’emblée quand Laura a pré-ciblé le dépôt (initialOpen)', async () => {
    render(<VivierImportMenu initialOpen />)
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })
})

describe('VivierExportMenu — UN bouton « Exporter » (#3554)', () => {
  it('ouvre une modale qui porte les DEUX exports', async () => {
    render(<VivierExportMenu />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Exporter' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('opt-ats')).toBeInTheDocument()
    expect(within(dialog).getByText('opt-bulk')).toBeInTheDocument()
  })

  it('n’affiche rien quand la sortie de données n’est pas permise à l’espace', () => {
    allowed.value = false
    const { container } = render(<VivierExportMenu />)
    expect(container).toBeEmptyDOMElement()
  })
})
