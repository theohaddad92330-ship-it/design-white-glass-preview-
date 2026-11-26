import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { renderWithRouter, resetTestQueryClient } from '@/test-utils/renderWithRouter'

const apiFetch = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }))

import { ImportsSourcesContent } from './ImportsSourcesContent'

const job = (extra: Record<string, unknown>) => ({
  id: 'j1',
  type: 'contact',
  status: 'done',
  filename: 'Contacts salon Data.csv',
  totalRows: 214,
  processedRows: 214,
  imported: 198,
  duplicates: 9,
  rejected: 7,
  error: null,
  scope: 'workspace',
  toReconcile: 0,
  breakdown: { contact: { created: 198, matched: 9, duplicates: 0, rejected: 7, toReconcile: 0 } },
  queryableByLaura: 198,
  sourceSystem: null,
  createdAt: '2026-10-21T16:40:00.000Z',
  reasons: [],
  ...extra,
})

const serve = (jobs: unknown[] | Error) =>
  apiFetch.mockImplementation(async ({ path }: { path: string }) => {
    if (path.includes('context-pack')) return []
    if (jobs instanceof Error) throw jobs
    return jobs
  })

// Théo B c3-imports-sources — la page « Imports & sources » du répertoire.
describe('ImportsSourcesContent — Théo B c3', () => {
  beforeEach(async () => {
    apiFetch.mockReset()
    resetTestQueryClient()
    await i18n.changeLanguage('fr')
  })

  it('R3/N5 — dit la promesse de la page et ne vend aucun enrichissement payant', async () => {
    serve([])
    renderWithRouter(<ImportsSourcesContent />, '/contacts/imports')
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Enrichir ton répertoire, sans le dupliquer.' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/aucun enrichissement payant/i)).toBeInTheDocument()
  })

  it('#4503.b — le contenu ne porte plus sa propre sous-navigation (les onglets de Contacts suffisent)', async () => {
    serve([])
    renderWithRouter(<ImportsSourcesContent />, '/contacts/imports')
    await screen.findByRole('heading', { level: 2, name: 'Enrichir ton répertoire, sans le dupliquer.' })
    expect(screen.queryByRole('navigation')).toBeNull()
  })

  it('R2 — cinq sources, chacune un lien vers l’assistant avec sa source (cible ≥ 44 px, nom accessible)', async () => {
    serve([])
    renderWithRouter(<ImportsSourcesContent />, '/contacts/imports')
    for (const [name, source] of [
      ['Fichier CSV ou Excel', 'file'],
      ['Copier un tableau', 'paste'],
      ['Carnet d’adresses', 'address-book'],
      ['Mon CRM', 'crm'],
    ] as const) {
      const link = await screen.findByRole('link', { name: new RegExp(name) })
      expect(link.getAttribute('href')).toContain('/contacts/import')
      expect(link.getAttribute('href')).toContain(`source=${source}`)
    }
    // « Liste depuis un texte » passe par Laura : un bouton nommé, pas un lien d’import.
    expect(screen.getAllByText('Liste depuis un texte').length).toBeGreaterThan(0)
  })

  it('A2/A3 — les renvois : documents de cadrage → Réglages › Import, CV en masse → Talents', async () => {
    serve([])
    renderWithRouter(<ImportsSourcesContent />, '/contacts/imports')
    const context = await screen.findByRole('link', { name: /Documents de cadrage/ })
    expect(context.getAttribute('href')).toBe('/settings/mes-donnees?tab=imports')
    const cv = screen.getByRole('link', { name: /CV en masse/ })
    expect(cv.getAttribute('href')).toBe('/consultants')
  })

  it('A7 — « Ce que ces données vont débloquer » est sous la grille', async () => {
    serve([])
    renderWithRouter(<ImportsSourcesContent />, '/contacts/imports')
    expect(await screen.findByText('Ce que ces données vont débloquer')).toBeInTheDocument()
    expect(screen.getByText('Un portefeuille analysable')).toBeInTheDocument()
    expect(screen.getByText('Un historique pour Laura')).toBeInTheDocument()
    expect(screen.getByText('Aucun doublon créé')).toBeInTheDocument()
  })

  it('A1/N4 — « Nouvel import » ouvre le choix de ce qu’on importe : huit types', async () => {
    serve([])
    renderWithRouter(<ImportsSourcesContent />, '/contacts/imports')
    fireEvent.click(await screen.findByRole('button', { name: 'Nouvel import' }))
    const dialog = await screen.findByRole('dialog', { name: 'Que veux-tu importer ?' })
    for (const name of [
      'Contacts',
      'Comptes',
      'Besoins',
      'Missions',
      'Consultants et candidats',
      'Projets',
      'Notes',
      'Historique d’activité',
    ]) {
      expect(within(dialog).getByText(name)).toBeInTheDocument()
    }
    expect(
      within(dialog)
        .getByRole('link', { name: /Contacts/ })
        .getAttribute('href'),
    ).toContain('/contacts/import')
  })

  it('R4 — l’historique dit la date, le résultat et le statut ; « Voir le bilan » sur un import terminé', async () => {
    serve([job({})])
    renderWithRouter(<ImportsSourcesContent />, '/contacts/imports')
    const row = await screen.findByTestId('imports-history-row')
    expect(row).toHaveTextContent('Contacts salon Data.csv')
    expect(row).toHaveTextContent('198 créés')
    expect(row).toHaveTextContent('7 non importés')
    expect(row).toHaveTextContent('Terminé')
    expect(within(row).getByRole('button', { name: /Voir le bilan/ })).toBeInTheDocument()
  })

  // #4597.3 — retrouver UN import précis : « voir les N contacts / N comptes » ouvre la liste filtrée sur SON identifiant.
  it('#4597.3 — « Voir les N contacts / comptes » ouvre la liste filtrée sur l’identifiant de CET import', async () => {
    serve([job({ id: 'j-fichier', linked: { contacts: 1080, accounts: 40 } })])
    renderWithRouter(<ImportsSourcesContent />, '/contacts/imports')
    const row = await screen.findByTestId('imports-history-row')
    const contacts = within(row).getByRole('link', { name: 'Voir les 1080 contacts de cet import' })
    expect(contacts.getAttribute('href')).toContain('/contacts?')
    expect(contacts.getAttribute('href')).toContain('importJob=j-fichier')
    const accounts = within(row).getByRole('link', { name: 'Voir les 40 comptes de cet import' })
    expect(accounts.getAttribute('href')).toContain('/accounts?')
    expect(accounts.getAttribute('href')).toContain('importJob=j-fichier')
  })

  it('#4597.3 sait dire NON : un import sans fiche marquée (ou d’avant la colonne) n’a AUCUN lien, jamais « 0 »', async () => {
    serve([job({ id: 'j-ancien' }), job({ id: 'j-vide', filename: 'vide.csv', linked: {} })])
    renderWithRouter(<ImportsSourcesContent />, '/contacts/imports')
    const rows = await screen.findAllByTestId('imports-history-row')
    expect(rows).toHaveLength(2)
    for (const row of rows) expect(within(row).queryByRole('link', { name: /de cet import/ })).toBeNull()
  })

  it('A4 — un import interrompu se reprend d’un clic (reprise au dernier paquet validé)', async () => {
    serve([
      job({
        id: 'j2',
        status: 'failed',
        filename: 'Plan 2027.xlsx',
        processedRows: 1203,
        imported: 1203,
        totalRows: null,
        duplicates: 0,
        rejected: 0,
      }),
    ])
    renderWithRouter(<ImportsSourcesContent />, '/contacts/imports')
    const row = await screen.findByTestId('imports-history-row')
    expect(row).toHaveTextContent('Interrompu')
    expect(row).toHaveTextContent('Arrêté après 1203 lignes écrites')
    fireEvent.click(within(row).getByRole('button', { name: 'Reprendre' }))
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        expect.objectContaining({ path: '/import/universal/jobs/j2/resume', method: 'POST' }),
      ),
    )
  })

  it('A4/N — un import en cours dit qu’il continue sans toi', async () => {
    serve([
      job({
        id: 'j3',
        status: 'processing',
        filename: 'Export CRM.csv',
        processedRows: 7990,
        totalRows: null,
        imported: 0,
        duplicates: 0,
        rejected: 0,
      }),
    ])
    renderWithRouter(<ImportsSourcesContent />, '/contacts/imports')
    const row = await screen.findByTestId('imports-history-row')
    expect(row).toHaveTextContent('En cours')
    expect(row).toHaveTextContent('7990 lignes lues')
    expect(row).toHaveTextContent('tu peux fermer cette page')
  })

  it('R7 — trois états distincts : vide, indisponible (≠ « aucun import »), et jamais « 0 »', async () => {
    serve([])
    const view = renderWithRouter(<ImportsSourcesContent />, '/contacts/imports')
    expect(await screen.findByText('Ton prochain import apparaîtra ici.')).toBeInTheDocument()
    view.unmount()
    resetTestQueryClient()
    serve(new Error('réseau'))
    renderWithRouter(<ImportsSourcesContent />, '/contacts/imports')
    expect(await screen.findByText(/Bellum n’a pas pu récupérer tes imports précédents/)).toBeInTheDocument()
    expect(screen.queryByText('Ton prochain import apparaîtra ici.')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument()
  })
})

// #4573 (#4426, recette du 25/10) — les trois lignes visibles étaient des CSV de contacts, aucun pack n'apparaissait :
// l'historique COMPTAIT les imports du pack sans les AFFICHER. Un pack importé s'y reconnaît désormais.
describe('ImportsSourcesContent — un import de pack se reconnaît dans l’historique (#4573)', () => {
  beforeEach(async () => {
    apiFetch.mockReset()
    resetTestQueryClient()
    await i18n.changeLanguage('fr')
  })

  it('le pack figure dans la liste, nommé « Pack de contexte » ; le CSV de contacts dit sa nature', async () => {
    apiFetch.mockImplementation(async ({ path }: { path: string }) =>
      path.includes('context-pack')
        ? [
            {
              id: '22222222-2222-4222-8222-222222222222',
              fileName: 'Playbook.pdf',
              destination: 'knowledge',
              status: 'done',
              imported: 1,
              skipped: 0,
              scripts: null,
              message: null,
              createdAt: '2026-10-22T09:00:00.000Z',
              original: 'earlier',
            },
          ]
        : [job({})],
    )
    renderWithRouter(<ImportsSourcesContent />, '/contacts/imports')
    const rows = await screen.findAllByTestId('imports-history-row')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('Playbook.pdf')
    expect(rows[0]).toHaveTextContent('Pack de contexte')
    expect(rows[0]).toHaveTextContent('Importé avant que Bellum garde les originaux : pas d’aperçu.')
    expect(rows[1]).toHaveTextContent('Contacts salon Data.csv')
    expect(rows[1]).toHaveTextContent('Import de fichier · Contacts')
  })
})
