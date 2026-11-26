import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ContextPackClassification } from '@bellum/contracts'
import { ContextPackDropzone } from './ContextPackDropzone'

const classifyContextFile = vi.fn()
const importContextFile = vi.fn()

vi.mock('../lib/context-pack', async importOriginal => ({
  ...(await importOriginal<typeof import('../lib/context-pack')>()),
  classifyContextFile: (file: File) => classifyContextFile(file),
  importContextFile: (file: File, destination: string, sheet: string | null) =>
    importContextFile(file, destination, sheet),
}))

vi.mock('@bellum/ui', async importOriginal => {
  const actual = await importOriginal<typeof import('@bellum/ui')>()
  return {
    ...actual,
    // Radix ne se pilote pas en jsdom : un <select> natif porte les mêmes options.
    SelectField: ({
      value,
      onChange,
      options,
      ariaLabel,
    }: {
      value: string
      onChange: (next: string) => void
      options: readonly { value: string; label: string }[]
      ariaLabel?: string
    }) => (
      <select aria-label={ariaLabel} value={value} onChange={event => onChange(event.target.value)}>
        {options.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    ),
  }
})

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...rest }: { to: string; children: ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}))

const grid: ContextPackClassification = {
  fileName: 'Go-no-go.xlsx',
  extension: 'xlsx',
  destination: 'qualification_grid',
  rule: 'headers',
  matchedHeaders: ['Critère', 'Poids'],
  sheetCount: 1,
  sheet: null,
  otherSheets: [],
  allowedDestinations: ['accounts', 'target_personas', 'qualification_grid', 'sequences', 'knowledge'],
}
const offer: ContextPackClassification = {
  fileName: 'Offre.docx',
  extension: 'docx',
  destination: 'knowledge',
  rule: 'extension',
  matchedHeaders: [],
  sheetCount: null,
  sheet: null,
  otherSheets: [],
  allowedDestinations: ['knowledge'],
}

const drop = (files: File[]) =>
  fireEvent.change(screen.getByLabelText('Choisir des documents à déposer'), { target: { files } })

// import-contexte Je.3 — la zone « Dépose tes documents » : voir, changer, puis SEULEMENT importer sur clic.
describe('ContextPackDropzone (Je.3)', () => {
  beforeEach(() => {
    classifyContextFile.mockReset()
    importContextFile.mockReset()
    classifyContextFile.mockImplementation(async (file: File) => (file.name === 'Go-no-go.xlsx' ? grid : offer))
  })

  it('affiche la destination proposée ET les colonnes qui l’ont décidée, sans rien importer', async () => {
    render(<ContextPackDropzone />)
    drop([new File(['x'], 'Go-no-go.xlsx'), new File(['x'], 'Offre.docx')])
    expect(await screen.findByText(/reconnu comme grille go\/no-go — colonnes Critère, Poids/)).toBeInTheDocument()
    expect(screen.getByText(/document — rangé dans les connaissances/)).toBeInTheDocument()
    expect(importContextFile).not.toHaveBeenCalled()
  })

  it('l’utilisateur change la destination avant d’importer ; le select ne propose que ce que le format sait lire', async () => {
    render(<ContextPackDropzone />)
    drop([new File(['x'], 'Go-no-go.xlsx'), new File(['x'], 'Offre.docx')])
    const select = await screen.findByLabelText('Destination de Go-no-go.xlsx')
    fireEvent.change(select, { target: { value: 'knowledge' } })
    const docSelect = screen.getByLabelText('Destination de Offre.docx')
    expect(within(docSelect).getAllByRole('option')).toHaveLength(1)

    importContextFile.mockResolvedValue({
      status: 'imported',
      fileName: 'x',
      destination: 'knowledge',
      count: 1,
      skipped: 0,
    })
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter ces documents' }))
    await waitFor(() => expect(importContextFile).toHaveBeenCalledTimes(2))
    expect(importContextFile.mock.calls[0]?.[1]).toBe('knowledge')
  })

  it('un échec reste PAR FICHIER, les autres continuent ; chaque réussite dit ce qui a été pris et porte un lien', async () => {
    render(<ContextPackDropzone />)
    drop([new File(['x'], 'Go-no-go.xlsx'), new File(['x'], 'Offre.docx')])
    await screen.findByLabelText('Destination de Go-no-go.xlsx')
    importContextFile.mockImplementation(async (file: File, destination: string) =>
      file.name === 'Go-no-go.xlsx'
        ? { status: 'imported', fileName: file.name, destination, count: 4, skipped: 0 }
        : { status: 'failed', fileName: file.name, destination, message: 'Fichier illisible.' },
    )
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter ces documents' }))
    expect(await screen.findByText('4 critères de grille pris')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Voir la grille go/no-go' })).toHaveAttribute(
      'href',
      '/settings/workspace-rules?onglet=qualite',
    )
    expect(screen.getByText(/Échec : Fichier illisible\./)).toBeInTheDocument()
  })

  it('un import de comptes lancé en tâche de fond ne s’écrit jamais « 0 compte »', async () => {
    classifyContextFile.mockResolvedValue({ ...grid, fileName: 'Tiering.csv', destination: 'accounts' })
    importContextFile.mockResolvedValue({
      status: 'imported',
      fileName: 'Tiering.csv',
      destination: 'accounts',
      count: null,
      skipped: 0,
    })
    render(<ContextPackDropzone />)
    drop([new File(['x'], 'Tiering.csv')])
    await screen.findByLabelText('Destination de Tiering.csv')
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter ces documents' }))
    expect(await screen.findByText(/Import des comptes lancé/)).toBeInTheDocument()
    expect(screen.queryByText(/0 compte/)).not.toBeInTheDocument()
  })

  it('un classement indisponible ne bloque pas : le fichier part en connaissances et la ligne le dit', async () => {
    classifyContextFile.mockRejectedValue(new Error('réseau'))
    render(<ContextPackDropzone />)
    drop([new File(['x'], 'Notes.md')])
    expect(await screen.findByText(/classement indisponible — rangé dans les connaissances/)).toBeInTheDocument()
  })

  // #4426.4 — l'onglet retenu est nommé à l'écran, les autres onglets reconnus sont listés, et l'onglet part à l'import.
  it('#4426.4 — nomme l’onglet retenu, liste les autres, et le transmet à l’import', async () => {
    classifyContextFile.mockResolvedValue({
      ...grid,
      fileName: 'Pack.xlsx',
      destination: 'accounts',
      matchedHeaders: ['Nom de la société', 'Tiering (A, B, C)'],
      sheetCount: 3,
      sheet: 'Tiering 2026-2027',
      otherSheets: [{ sheet: 'Postes', destination: 'target_personas' }],
    })
    importContextFile.mockResolvedValue({
      status: 'imported',
      fileName: 'Pack.xlsx',
      destination: 'accounts',
      count: null,
      skipped: 0,
    })
    render(<ContextPackDropzone />)
    drop([new File(['x'], 'Pack.xlsx')])
    expect(await screen.findByText(/onglet « Tiering 2026-2027 » reconnu comme tiering de comptes/)).toBeInTheDocument()
    expect(screen.getByText(/« Postes » : liste de postes cibles/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter ces documents' }))
    await waitFor(() => expect(importContextFile).toHaveBeenCalledTimes(1))
    expect(importContextFile.mock.calls[0]).toEqual([expect.any(File), 'accounts', 'Tiering 2026-2027'])
  })

  // #4426.7 — les scripts sont comptés (plus écartés) et chaque ligne écartée garde son MOTIF, dépliable.
  it('#4426.7 — compte les scripts gardés et déplie le motif de chaque ligne écartée', async () => {
    classifyContextFile.mockResolvedValue({ ...grid, fileName: 'Campagnes.xlsx', destination: 'sequences' })
    importContextFile.mockResolvedValue({
      status: 'imported',
      fileName: 'Campagnes.xlsx',
      destination: 'sequences',
      count: 9,
      skipped: 1,
      scripts: 54,
      mails: 36,
      skippedDetails: [{ line: 20, reason: 'no_body', label: 'Campagne 3' }],
    })
    render(<ContextPackDropzone />)
    drop([new File(['x'], 'Campagnes.xlsx')])
    await screen.findByLabelText('Destination de Campagnes.xlsx')
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter ces documents' }))
    expect(await screen.findByText('9 séquences prises')).toBeInTheDocument()
    expect(screen.getByText('54 scripts d’appel gardés avec leur campagne')).toBeInTheDocument()
    // #4426.7 — les MAILS aussi sont dits : 36 étapes de séquence, rangées sous leur campagne.
    expect(screen.getByText('36 mails rangés en étapes de séquence')).toBeInTheDocument()
    const summary = screen.getByText('1 ligne écartée')
    expect(summary.closest('details')).not.toBeNull()
    expect(screen.getByText(/ligne 20 — texte manquant \(Campagne 3\)/)).toBeInTheDocument()
  })

  // #4893.2 — une ligne écartée nomme la valeur LUE et le format attendu, jamais « (—) ».
  it('un niveau illisible nomme la valeur lue et le format attendu', async () => {
    classifyContextFile.mockResolvedValue({ ...grid, fileName: 'Postes.csv', destination: 'target_personas' })
    importContextFile.mockResolvedValue({
      status: 'imported',
      fileName: 'Postes.csv',
      destination: 'target_personas',
      count: 0,
      skipped: 1,
      skippedDetails: [{ line: 2, reason: 'level_invalid', label: 'Décideur' }],
    })
    render(<ContextPackDropzone />)
    drop([new File(['x'], 'Postes.csv')])
    await screen.findByLabelText('Destination de Postes.csv')
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter ces documents' }))
    expect(await screen.findByText(/ligne 2 — niveau décideur illisible « Décideur »/)).toBeInTheDocument()
    expect(screen.getByText(/un chiffre de 1 à 4 attendu/)).toBeInTheDocument()
    expect(screen.queryByText(/\(—\)/)).toBeNull()
  })

  // #4426.1 — un type que l'app ne sait pas lire le DIT : ni classé, ni « rangé dans les connaissances », ni importé.
  it('un type non reconnu est nommé avec les formats acceptés, sans appel réseau, et n’est jamais importé', async () => {
    render(<ContextPackDropzone />)
    drop([new File(['x'], 'Offre.docx'), new File(['x'], 'archive.zip'), new File(['x'], 'LISEZMOI')])
    expect(await screen.findByText(/format « \.zip » non pris en charge/)).toBeInTheDocument()
    expect(screen.getByText(/fichier sans extension non pris en charge/)).toBeInTheDocument()
    expect(screen.getAllByText(/formats acceptés : csv, tsv, xlsx, docx, pptx, pdf, md, txt, json/)).toHaveLength(2)
    expect(classifyContextFile).toHaveBeenCalledTimes(1)
    expect(screen.queryByLabelText('Destination de archive.zip')).toBeNull()

    importContextFile.mockResolvedValue({
      status: 'imported',
      fileName: 'x',
      destination: 'knowledge',
      count: 1,
      skipped: 0,
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Ajouter ces documents' }))
    await waitFor(() => expect(importContextFile).toHaveBeenCalledTimes(1))
    expect(importContextFile.mock.calls[0]?.[0].name).toBe('Offre.docx')
  })
})
