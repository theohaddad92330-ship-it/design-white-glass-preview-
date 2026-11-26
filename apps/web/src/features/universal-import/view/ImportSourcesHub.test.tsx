import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import '@/i18n'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, search }: { children: ReactNode; to: string; search?: unknown }) => (
    <a href={to} data-search={JSON.stringify(search ?? null)}>
      {children}
    </a>
  ),
}))
vi.mock('./UniversalImportHistory', () => ({ UniversalImportHistory: () => <div>historique</div> }))
vi.mock('./UniversalImportDialog', () => ({
  UniversalImportDialog: ({
    layout,
    initialSource,
    fixedType,
    onClose,
  }: {
    layout: string
    initialSource: string
    fixedType: string
    onClose: () => void
  }) => (
    <div>
      assistant {layout} {initialSource} {fixedType}
      <button type="button" onClick={onClose}>
        retour
      </button>
    </div>
  ),
}))

import { ImportSourcesHub } from './ImportSourcesHub'

describe('Théo B C3 — Imports & sources', () => {
  it('l’accroche, la mention « rien d’automatique », « Nouvel import », cinq sources, trois bénéfices, l’historique', () => {
    render(<ImportSourcesHub>{<p>documents de cadrage</p>}</ImportSourcesHub>)
    expect(screen.getByRole('heading', { name: 'Enrichir ton répertoire, sans le dupliquer.' })).toBeInTheDocument()
    expect(screen.getByTestId('hub-nothing-automatic')).toHaveTextContent(
      'Aucune inscription automatique en séquence, aucun enrichissement payant.',
    )
    expect(screen.getByRole('button', { name: 'Nouvel import' })).toBeInTheDocument()
    for (const name of [
      'Fichier CSV ou Excel',
      'Copier un tableau',
      "Carnet d'adresses",
      'Mon CRM',
      'Liste depuis un texte',
    ]) {
      expect(screen.getByText(name)).toBeInTheDocument()
    }
    expect(screen.getByText('Un portefeuille analysable')).toBeInTheDocument()
    expect(screen.getByText('Aucun doublon créé')).toBeInTheDocument()
    expect(screen.getByText('historique')).toBeInTheDocument()
    // Rien n'est retiré : la zone « documents de cadrage » et l'assistant par outil restent sur la page.
    expect(screen.getByText('documents de cadrage')).toBeInTheDocument()
  })

  it('« Nouvel import » demande d’abord « Que veux-tu importer ? », puis ouvre l’assistant du type choisi', async () => {
    render(<ImportSourcesHub />)
    await userEvent.click(screen.getByRole('button', { name: 'Nouvel import' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Que veux-tu importer ?')).toBeInTheDocument()
    expect(
      within(screen.getByTestId('hub-what-types'))
        .getAllByRole('button')
        .map(button => button.querySelector('span > span')?.textContent),
    ).toEqual(['Contacts', 'Comptes', 'Besoins', 'Missions', 'Consultants et candidats'])
    await userEvent.click(within(dialog).getByText('Comptes'))
    expect(screen.getByText(/assistant page file account/)).toBeInTheDocument()
    expect(screen.queryByText('Un portefeuille analysable')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'retour' }))
    expect(screen.getByRole('heading', { name: 'Enrichir ton répertoire, sans le dupliquer.' })).toBeInTheDocument()
  })

  it('une carte de source ouvre directement l’assistant des CONTACTS (raccourci, sans la question du type)', async () => {
    render(<ImportSourcesHub />)
    await userEvent.click(screen.getByText('Fichier CSV ou Excel'))
    expect(screen.getByText(/assistant page file contact/)).toBeInTheDocument()
  })

  it('« Copier un tableau » ouvre l’assistant sur l’onglet du tableau collé', async () => {
    render(<ImportSourcesHub />)
    await userEvent.click(screen.getByText('Copier un tableau'))
    expect(screen.getByText(/assistant page paste/)).toBeInTheDocument()
  })

  it('« Mon CRM » mène aux intégrations, « Liste depuis un texte » à la conversation avec la demande préparée', () => {
    render(<ImportSourcesHub />)
    expect(screen.getByText('Mon CRM').closest('a')).toHaveAttribute('href', '/integrations')
    const laura = screen.getByText('Liste depuis un texte').closest('a')
    expect(laura).toHaveAttribute('href', '/chat')
    expect(laura?.getAttribute('data-search')).toContain('Prépare-moi une liste de contacts')
  })
})

/** `a` précède `b` dans le document. */
const before = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)

describe('Théo B C3 — la structure de la maquette (`b/c3-imports-sources.html`)', () => {
  it('de haut en bas : titre + « Nouvel import », sources, imports d’ailleurs, « Ce que ces données vont débloquer », historique', () => {
    render(<ImportSourcesHub>{<p>documents de cadrage</p>}</ImportSourcesHub>)
    const order = [
      screen.getByRole('heading', { name: 'Enrichir ton répertoire, sans le dupliquer.' }),
      screen.getByRole('button', { name: 'Nouvel import' }),
      screen.getByTestId('hub-sources'),
      screen.getByTestId('hub-elsewhere'),
      screen.getByRole('heading', { name: 'Ce que ces données vont débloquer' }),
      screen.getByText('historique'),
      screen.getByText('documents de cadrage'),
    ]
    order.slice(1).forEach((node, index) => expect(before(order[index]!, node)).toBe(true))
  })

  it('chaque carte porte titre, phrase et sa ligne de format', () => {
    render(<ImportSourcesHub />)
    expect(screen.getByText('CSV, TSV, XLSX ou JSON · sans limite de lignes')).toBeInTheDocument()
    expect(screen.getByText('En-têtes, aperçu et correspondance')).toBeInTheDocument()
    expect(screen.getByText('Connexion ou export de ton outil')).toBeInTheDocument()
  })

  it('« Documents de cadrage » mène à la zone de dépôt de la page, « CV en masse » à Talents', () => {
    render(<ImportSourcesHub />)
    expect(screen.getByText('Documents de cadrage').closest('a')).toHaveAttribute('href', '#depose-tes-documents')
    expect(screen.getByText('CV en masse').closest('a')).toHaveAttribute('href', '/consultants')
  })
})
